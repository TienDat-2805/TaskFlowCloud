"""Deploy an immutable image pair without changing production secrets or data."""

import argparse
from contextlib import contextmanager
from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class DeployError(Exception):
    pass


@dataclass(frozen=True)
class Release:
    revision: str
    backend_image: str
    frontend_image: str

    def __post_init__(self):
        if not re.fullmatch(r"[0-9a-f]{40}", self.revision):
            raise DeployError("A full Git commit SHA is required.")
        for service in ("backend", "frontend"):
            image = getattr(self, service + "_image")
            if not re.fullmatch(
                r"sha256:[0-9a-f]{64}|ghcr\.io/[a-z0-9][a-z0-9._/-]*/"
                + service + r"@sha256:[0-9a-f]{64}", image
            ):
                raise DeployError("Images must use immutable GHCR digests or adopted local IDs.")
        if self.backend_image.startswith("ghcr.io/") and (
            self.backend_image.split("/backend@")[0]
            != self.frontend_image.split("/frontend@")[0]
        ):
            raise DeployError("Both images must belong to the same repository.")


class Deployment:
    FILES = ("compose.prod.yml", "infra/caddy/Caddyfile")

    def __init__(self, root, project, url, source=None):
        self.root = Path(root).resolve()
        if not self.root.is_dir() or self.root.parent == self.root:
            raise DeployError("The deployment directory must already exist and cannot be root.")
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,62}", project):
            raise DeployError("Invalid Compose project name.")
        try:
            parsed = urlsplit(url)
        except ValueError as error:
            raise DeployError("Invalid public application URL.") from error
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username
                or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in ("", "/")):
            raise DeployError("Use an HTTPS origin without a path, query or credentials.")
        if not (self.root / ".env.production").is_file():
            raise DeployError("Install the production environment file on the server first.")
        self.project = project
        self.url = url.rstrip("/")
        self.source = Path(source) if source else Path(__file__).resolve().parents[2]

    @contextmanager
    def lock(self):
        lock = self.root / ".deploy.lock"
        try:
            lock.mkdir(mode=0o700)
        except FileExistsError as error:
            raise DeployError("Another deployment is active; review any stale lock on the server.") from error
        try:
            yield
        finally:
            lock.rmdir()

    def directory(self, release):
        directory = self.root / "releases" / release.revision
        if not directory.resolve().is_relative_to(self.root):
            raise DeployError("Release directory must stay inside the deployment directory.")
        return directory

    def stage(self, release):
        directory = self.directory(release)
        for name in self.FILES:
            source = self.source / name
            target = directory / name
            if not source.is_file() or source.is_symlink():
                raise DeployError("The release bundle is incomplete.")
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if not target.resolve().is_relative_to(directory.resolve()):
                raise DeployError("Release files must stay inside their release directory.")
            if target.exists():
                if target.read_bytes() != source.read_bytes():
                    raise DeployError("An existing release cannot be overwritten with different files.")
                continue
            target.write_bytes(source.read_bytes())

    def state(self):
        try:
            data = json.loads((self.root / "state.json").read_text(encoding="utf-8"))
            if data["schema"] != 1 or data["project"] != self.project:
                raise ValueError("Unexpected project or schema")
            current = Release(**data["current"])
            previous = Release(**data["previous"]) if data["previous"] else None
            return current, previous
        except FileNotFoundError as error:
            raise DeployError("Adopt the running stack before enabling automated deployment.") from error
        except (KeyError, TypeError, ValueError) as error:
            raise DeployError("The deployment state needs review on the server.") from error

    def checkpoint(self, current, previous):
        data = {
            "schema": 1, "project": self.project,
            "current": asdict(current),
            "previous": asdict(previous) if previous else None,
        }
        descriptor, name = tempfile.mkstemp(prefix=".state-", dir=self.root)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                json.dump(data, output, indent=2)
                output.write("\n")
                output.flush()
                os.fsync(output.fileno())
            os.replace(name, self.root / "state.json")
        finally:
            if os.path.exists(name):
                os.unlink(name)

    def run(self, args, env=None):
        try:
            return subprocess.run(
                args, env=env, check=True, capture_output=True,
                text=True, timeout=240,
            ).stdout.strip()
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            # Docker errors/configuration can contain credentials. Keep raw output on the host.
            raise DeployError("A Docker command failed. Inspect the stack directly on the server.") from error

    def compose(self, release, *args):
        directory = self.directory(release)
        if not all((directory / name).is_file() for name in self.FILES):
            raise DeployError("The recorded release files are missing.")
        # The server env file is the single source for runtime secrets and feature flags.
        environment = os.environ.copy()
        for key in (
            "APP_DOMAIN", "MONGODB_URI", "SESSION_SECRET", "MONGODB_DNS_SERVERS",
            "TASKFLOW_V02_ENABLED", "REQUIRE_TASK_REVISION", "SEED_EMAIL", "SEED_PASSWORD",
        ):
            environment.pop(key, None)
        environment.update(
            BACKEND_IMAGE=release.backend_image,
            FRONTEND_IMAGE=release.frontend_image,
            COMPOSE_PROFILES="",
        )
        return self.run([
            "docker", "compose", "--env-file", str(self.root / ".env.production"),
            "--project-name", self.project, "--project-directory", str(directory),
            "-f", str(directory / "compose.prod.yml"), *args,
        ], env=environment)

    def baseline(self, release):
        self.validate(release)
        for image in (release.backend_image, release.frontend_image):
            self.run(["docker", "image", "inspect", image])

    def validate(self, release):
        # Parse in memory only: a resolved Compose configuration contains runtime secrets.
        try:
            config = json.loads(self.compose(release, "config", "--format", "json"))
            domain = config["services"]["caddy"]["environment"]["APP_DOMAIN"]
            expected = urlsplit("https://" + domain)
            requested = urlsplit(self.url)
            if ((expected.hostname, expected.port or 443)
                    != (requested.hostname, requested.port or 443)):
                raise DeployError("The public URL must match APP_DOMAIN on the server.")
        except (KeyError, TypeError, ValueError) as error:
            raise DeployError("The server Compose configuration is invalid.") from error

    def apply(self, release):
        self.compose(
            release, "up", "--no-build", "--pull", "never",
            "--wait", "--wait-timeout", "180", "backend", "frontend", "caddy",
        )
        self.smoke()

    def request(self, path, status):
        url = self.url + path
        request = Request(url, headers={"User-Agent": "TaskFlowCloud-CD"})
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            if response.getcode() != status or response.geturl() != url:
                raise DeployError("Unexpected response from the public endpoint.")
            return response.read(512 * 1024)

    def smoke(self):
        for attempt in range(12):
            try:
                health = json.loads(self.request("/health", 200))
                if (not isinstance(health, dict) or health.get("status") != "ok"
                        or health.get("database") != "connected"):
                    raise DeployError("Database health did not pass.")
                if b'id="root"' not in self.request("/", 200):
                    raise DeployError("The frontend did not return the application shell.")
                self.request("/api/auth/me", 401)
                return
            except (DeployError, URLError, OSError, ValueError):
                if attempt < 11:
                    time.sleep(2)
        raise DeployError("Public HTTPS, frontend or API smoke checks failed.")

    def adopt(self, revision):
        with self.lock():
            if (self.root / "state.json").exists():
                raise DeployError("A baseline already exists; adoption never overwrites it.")
            images = {}
            for service in ("backend", "frontend"):
                containers = self.run([
                    "docker", "ps", "-q", "--filter", "label=com.docker.compose.project=" + self.project,
                    "--filter", "label=com.docker.compose.service=" + service,
                ]).split()
                if len(containers) != 1:
                    raise DeployError("Start exactly one running container per application service first.")
                images[service] = self.run(["docker", "inspect", "--format", "{{.Image}}", containers[0]])
            release = Release(revision, images["backend"], images["frontend"])
            self.stage(release)
            self.baseline(release)
            self.smoke()
            self.checkpoint(release, None)
            print("Running stack adopted as the rollback baseline.")

    def deploy(self, release):
        if not all(image.startswith("ghcr.io/") for image in (release.backend_image, release.frontend_image)):
            raise DeployError("New deployments must use the published GHCR digest pair.")
        with self.lock():
            current, _ = self.state()
            self.baseline(current)
            self.stage(release)
            self.validate(release)
            self.compose(release, "pull", "--quiet", "backend", "frontend")
            for image in (release.backend_image, release.frontend_image):
                revision = self.run([
                    "docker", "image", "inspect", "--format",
                    '{{index .Config.Labels "org.opencontainers.image.revision"}}', image,
                ])
                if revision != release.revision:
                    raise DeployError("An image does not match the tested commit.")
            try:
                self.apply(release)
                # One atomic state update keeps the current/previous pair consistent.
                if release != current:
                    self.checkpoint(release, current)
            except Exception as error:
                try:
                    self.apply(current)
                except Exception as rollback_error:
                    raise DeployError("Deployment and automatic rollback failed; inspect the server.") from rollback_error
                raise DeployError("Deployment failed; the previous release was restored.") from error
            print("Release healthy; deployment state updated.")

    def rollback(self):
        with self.lock():
            current, previous = self.state()
            if previous is None:
                raise DeployError("No previous release is recorded.")
            self.baseline(previous)
            try:
                self.apply(previous)
                self.checkpoint(previous, current)
            except Exception as error:
                try:
                    self.apply(current)
                except Exception as restore_error:
                    raise DeployError("Rollback and restoration failed; inspect the server.") from restore_error
                raise DeployError("Rollback failed; the current release was restored.") from error
            print("Previous release restored and healthy.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("adopt", "deploy", "rollback"))
    parser.add_argument("--root", required=True)
    parser.add_argument("--project", default="taskflow-cloud")
    parser.add_argument("--url", required=True)
    parser.add_argument("--revision")
    parser.add_argument("--source", help="Existing Compose/Caddy checkout; only used for adoption.")
    parser.add_argument("--backend-image")
    parser.add_argument("--frontend-image")
    args = parser.parse_args()

    def interrupted(_signum, _frame):
        raise DeployError("Deployment interrupted.")

    for name in ("SIGTERM", "SIGHUP"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), interrupted)
    try:
        if args.source and args.action != "adopt":
            raise DeployError("Only adoption accepts a separate configuration source.")
        deployment = Deployment(args.root, args.project, args.url, args.source)
        if args.action == "adopt":
            if not args.revision:
                raise DeployError("Adoption requires the running commit SHA.")
            deployment.adopt(args.revision)
        elif args.action == "deploy":
            if not all((args.revision, args.backend_image, args.frontend_image)):
                raise DeployError("Deployment requires a commit SHA and both image digests.")
            deployment.deploy(Release(args.revision, args.backend_image, args.frontend_image))
        else:
            deployment.rollback()
    except (DeployError, OSError) as error:
        # Unexpected OS errors can include host paths; do not print their raw message.
        print(str(error) if isinstance(error, DeployError) else "Deployment filesystem operation failed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
