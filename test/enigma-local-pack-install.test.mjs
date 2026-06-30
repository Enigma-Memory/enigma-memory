import test from 'node:test';
import assert from 'node:assert/strict';

import { renderLocalPackInstallSmokePlain, runLocalPackInstallSmoke } from '../scripts/verify-local-pack-install.mjs';


test('local packed install smoke installs tarball into temp prefix only', async () => {
  const report = await runLocalPackInstallSmoke(new Date('2026-06-23T12:00:00.000Z'));
  const plain = renderLocalPackInstallSmokePlain(report);
  const serialized = JSON.stringify(report);

  assert.equal(report.schema, 'enigma.local_pack_install_smoke.v1');
  assert.equal(report.ok, true);
  assert.equal(report.package.name, 'enigma-memory');
  assert.equal(report.package.version, '0.1.19');
  assert.match(report.package.tarball, /^enigma-memory-0\.1\.19\.tgz$/);
  assert.equal(report.install.global_install, false);
  assert.equal(report.install.registry_install, false);
  assert.equal(report.install.npm_publish, false);
  assert.equal(report.install.npm_token_required, false);
  assert.equal(report.install.command, 'npm install --prefix <temp-prefix> --ignore-scripts <local-tarball>');
  assert.deepEqual(report.checks.map((check) => check.entrypoint), [
    'apps/cli/bin/enigma.mjs',
    'apps/cli/bin/enigma.mjs',
    'apps/verifier/bin/enigma-verify.mjs',
    'apps/relay/bin/enigma-relay.mjs',
    'apps/gateway/bin/enigma-gateway.mjs',
    'packages/mcp-server/bin/enigma-mcp.mjs',
    'apps/native-host/bin/enigma-native-host.mjs',
  ]);
  assert.deepEqual(report.checks[3].evidence.commands, ['demo', 'serve']);
  assert.deepEqual(report.checks[4].evidence.commands, ['demo', 'serve']);
  assert.equal(report.checks[1].evidence.schema, 'enigma.test_drive.v1');
  assert.equal(report.checks[5].evidence.server, 'enigma-mcp-server');
  assert.equal(report.checks[5].evidence.tool_count > 0, true);
  assert.equal(report.checks[5].evidence.resource_count > 0, true);
  assert.equal(report.checks[5].evidence.prompt_count > 0, true);
  assert.equal(report.checks[1].evidence.writes_performed, false);
  assert.match(plain, /local temp-prefix install smoke only/);
  assert.doesNotMatch(serialized, /C:\\Users|[A-Za-z]:\\\\|AppData\\\\Local|file:\/\/\/|\/tmp\/enigma|\/home\/[^"',]+|npm_[A-Za-z0-9]{8,}|ghp_|sk-[A-Za-z0-9]{8,}/i);
});

