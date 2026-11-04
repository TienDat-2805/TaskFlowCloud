import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, call, patch
from urllib.error import HTTPError

from deploy import DeployError, Deployment, Release


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(__file__).resolve().parents[2] / "tmp"
        self.tmp.mkdir(exist_ok=True)
        self.scratch = tempfile.TemporaryDirectory(prefix="deploy-test-", dir=self.tmp)
        self.root = Path(self.scratch.name).resolve()
        self.source = self.root / "source"
        for name in Deployment.FILES:
            file = self.source / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("release configuration", encoding="utf-8")
        (self.root / ".env.production").write_text("SESSION_SECRET=private-test-value\n", encoding="utf-8")
        self.engine = Deployment(self.root, "taskflow-cloud", "https://app.example.com", self.source)
        self.old = Release("a" * 40, "sha256:" + "1" * 64, "sha256:" + "2" * 64)
        self.new = Release("b" * 40,
                           "ghcr.io/example/taskflow/backend@sha256:" + "3" * 64,
                           "ghcr.io/example/taskflow/frontend@sha256:" + "4" * 64)
        self.engine.stage(self.old)
        self.engine.checkpoint(self.old, None)
        self.engine.run = Mock(side_effect=self.docker)
        self.engine.apply = Mock()

    def tearDown(self):
        self.assertEqual(self.root.parent, self.tmp.resolve())
        self.scratch.cleanup()

    def docker(self, args, env=None):
        if "config" in args and "--format" in args:
            return json.dumps({"services": {"caddy": {"environment": {"APP_DOMAIN": "app.example.com"}}}})
        if args[:3] == ["docker", "image", "inspect"] and "--format" in args:
            return self.new.revision
        if args[:2] == ["docker", "ps"]:
            return "container-backend" if "backend" in args[-1] else "container-frontend"
        if args[:2] == ["docker", "inspect"]:
            return self.old.backend_image if args[-1].endswith("backend") else self.old.frontend_image
        return ""

    def test_success_records_the_exact_pair_only_after_health(self):
        self.engine.apply.side_effect = lambda _: self.assertEqual(self.engine.state()[0], self.old)
        self.engine.deploy(self.new)
        self.assertEqual(self.engine.state(), (self.new, self.old))
        self.assertNotIn("private-test-value", (self.root / "state.json").read_text())
        self.assertFalse((self.root / ".deploy.lock").exists())

    def test_unhealthy_release_restores_the_baseline_and_reports_failure(self):
        self.engine.apply.side_effect = [DeployError("unhealthy"), None]
        before = (self.root / "state.json").read_bytes()
        with self.assertRaisesRegex(DeployError, "previous release was restored"):
            self.engine.deploy(self.new)
        self.assertEqual(self.engine.apply.call_args_list, [call(self.new), call(self.old)])
        self.assertEqual((self.root / "state.json").read_bytes(), before)

    def test_failed_rollback_does_not_mark_the_candidate_current(self):
        self.engine.apply.side_effect = DeployError("unhealthy")
        with self.assertRaisesRegex(DeployError, "automatic rollback failed"):
            self.engine.deploy(self.new)
        self.assertEqual(self.engine.state(), (self.old, None))

    def test_pull_failure_does_not_replace_containers(self):
        def fail_pull(args, env=None):
            if "pull" in args:
                raise DeployError("registry unavailable")
            return self.docker(args, env)
        self.engine.run.side_effect = fail_pull
        with self.assertRaisesRegex(DeployError, "registry unavailable"):
            self.engine.deploy(self.new)
        self.engine.apply.assert_not_called()
        self.assertEqual(self.engine.state()[0], self.old)

    def test_wrong_image_revision_never_reaches_the_running_stack(self):
        def wrong_revision(args, env=None):
            if args[:3] == ["docker", "image", "inspect"] and "--format" in args:
                return "c" * 40
            return self.docker(args, env)
        self.engine.run.side_effect = wrong_revision
        with self.assertRaisesRegex(DeployError, "does not match the tested commit"):
            self.engine.deploy(self.new)
        self.engine.apply.assert_not_called()

    def test_public_url_must_match_the_runtime_domain_before_deploy(self):
        self.engine.url = "https://different.example.com"
        with self.assertRaisesRegex(DeployError, "must match APP_DOMAIN"):
            self.engine.deploy(self.new)
        self.engine.apply.assert_not_called()
        self.assertEqual(self.engine.state()[0], self.old)

    def test_checkpoint_failure_rolls_back_without_corrupting_state(self):
        before = (self.root / "state.json").read_bytes()
        with patch("deploy.os.replace", side_effect=OSError("disk full")):
            with self.assertRaisesRegex(DeployError, "previous release was restored"):
                self.engine.deploy(self.new)
        self.assertEqual((self.root / "state.json").read_bytes(), before)
        self.assertEqual(self.engine.apply.call_args_list, [call(self.new), call(self.old)])

    def test_first_automated_deployment_requires_adoption(self):
        (self.root / "state.json").unlink()
        with self.assertRaisesRegex(DeployError, "Adopt the running stack"):
            self.engine.deploy(self.new)
        self.engine.run.assert_not_called()
        self.engine.apply.assert_not_called()

    def test_adoption_records_running_image_ids_without_replacing_containers(self):
        (self.root / "state.json").unlink()
        self.engine.smoke = Mock()
        self.engine.adopt(self.old.revision)
        self.assertEqual(self.engine.state(), (self.old, None))
        self.engine.apply.assert_not_called()
        self.engine.smoke.assert_called_once()
        with self.assertRaisesRegex(DeployError, "baseline already exists"):
            self.engine.adopt(self.old.revision)

    def test_manual_rollback_swaps_current_and_previous(self):
        self.engine.stage(self.new)
        self.engine.checkpoint(self.new, self.old)
        self.engine.rollback()
        self.engine.apply.assert_called_once_with(self.old)
        self.assertEqual(self.engine.state(), (self.old, self.new))

    def test_failed_manual_rollback_restores_the_current_release(self):
        self.engine.stage(self.new)
        self.engine.checkpoint(self.new, self.old)
        self.engine.apply.side_effect = [DeployError("unhealthy"), None]
        with self.assertRaisesRegex(DeployError, "current release was restored"):
            self.engine.rollback()
        self.assertEqual(self.engine.state(), (self.new, self.old))
        self.assertEqual(self.engine.apply.call_args_list, [call(self.old), call(self.new)])

    def test_lock_blocks_concurrent_deployments(self):
        (self.root / ".deploy.lock").mkdir()
        with self.assertRaisesRegex(DeployError, "Another deployment is active"):
            self.engine.deploy(self.new)
        self.engine.apply.assert_not_called()
        self.assertTrue((self.root / ".deploy.lock").is_dir())

    def test_release_files_cannot_silently_change_under_a_recorded_revision(self):
        (self.source / "compose.prod.yml").write_text("different", encoding="utf-8")
        with self.assertRaisesRegex(DeployError, "cannot be overwritten"):
            self.engine.stage(self.old)

    def test_mutable_images_mixed_repositories_and_injected_revisions_are_rejected(self):
        for release in [
            ("../../outside", self.new.backend_image, self.new.frontend_image),
            (self.new.revision, "ghcr.io/example/taskflow/backend:latest", self.new.frontend_image),
            (self.new.revision, self.new.backend_image, self.new.frontend_image.replace("example/", "other/")),
        ]:
            with self.subTest(release=release), self.assertRaises(DeployError):
                Release(*release)

    def test_runtime_secrets_come_from_the_server_file(self):
        with patch.dict(os.environ, {"MONGODB_URI": "private-parent-value", "SESSION_SECRET": "private-parent-secret"}):
            self.engine.compose(self.old, "config", "--quiet")
        environment = self.engine.run.call_args.kwargs["env"]
        self.assertNotIn("MONGODB_URI", environment)
        self.assertNotIn("SESSION_SECRET", environment)
        self.assertEqual(environment["BACKEND_IMAGE"], self.old.backend_image)

    def test_docker_errors_never_print_raw_credentials(self):
        with patch("deploy.subprocess.run", side_effect=subprocess.CalledProcessError(
            1, ["docker"], stderr="private-test-value"
        )):
            with self.assertRaises(DeployError) as result:
                Deployment.run(self.engine, ["docker", "compose"])
        self.assertNotIn("private-test-value", str(result.exception))

    def test_smoke_checks_health_frontend_and_unauthenticated_api_without_writes(self):
        self.engine.request = Mock(side_effect=[
            json.dumps({"status": "ok", "database": "connected"}).encode(),
            b'<div id="root"></div>', b'{}',
        ])
        self.engine.smoke()
        self.assertEqual(self.engine.request.call_args_list,
                         [call("/health", 200), call("/", 200), call("/api/auth/me", 401)])

    def test_degraded_database_never_passes_smoke(self):
        self.engine.request = Mock(return_value=b'{"status":"degraded"}')
        with patch("deploy.time.sleep"), self.assertRaisesRegex(DeployError, "smoke checks failed"):
            self.engine.smoke()

    def test_expected_unauthenticated_response_is_not_a_network_failure(self):
        url = self.engine.url + "/api/auth/me"
        failure = HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b'{}'))
        with patch("deploy.urlopen", side_effect=failure):
            self.assertEqual(self.engine.request("/api/auth/me", 401), b'{}')


if __name__ == "__main__":
    unittest.main()
