import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from '../../scripts/compose-diagnostics.mjs';

describe('Compose failure diagnostics', () => {
  it('preserves actionable build errors while removing generated credentials', () => {
    const output = formatDiagnostic(
      'Build failed: missing Dockerfile\nSESSION_SECRET=private-secret\npassword=private-password\n',
      ['private-secret', 'private-password', ''],
    );
    expect(output).toContain('Build failed: missing Dockerfile');
    expect(output).not.toContain('private-secret');
    expect(output).not.toContain('private-password');
  });

  it('removes database URLs and authentication headers from container logs', () => {
    const output = formatDiagnostic(
      'mongodb+srv://user:password@cluster.example/db\n' +
        'mongodb://mongo:27017/test\n' +
        'Cookie: sid=private-cookie\nSet-Cookie: sid=private-cookie; HttpOnly\n' +
        'Authorization: Bearer private-token\nDocker error: connection refused',
    );
    expect(output).not.toMatch(/cluster\.example|mongo:27017|private-cookie|private-token/);
    expect(output).toContain('Docker error: connection refused');
  });

  it('redacts before limiting output and handles missing diagnostics', () => {
    const output = formatDiagnostic('x'.repeat(20_000) + 'private-secret', ['private-secret']);
    expect(output).toHaveLength(12_000);
    expect(output.endsWith('[redacted]')).toBe(true);
    expect(formatDiagnostic(undefined)).toBe('');
  });
});
