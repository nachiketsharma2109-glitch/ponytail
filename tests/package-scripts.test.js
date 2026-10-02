#!/usr/bin/env node

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

test('root npm test covers bundled subprojects', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(packageJson.scripts.test, /npm test --prefix pi-extension/);
  assert.match(packageJson.scripts.test, /npm test --prefix ponytail-mcp/);
});

test('CI installs MCP dependencies before root npm test', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'test.yml'), 'utf8');

  assert.match(workflow, /npm install --prefix ponytail-mcp/);
  assert.ok(
    workflow.indexOf('npm install --prefix ponytail-mcp') < workflow.indexOf('npm test'),
    'MCP dependencies must be installed before the root test command runs',
  );
});

test('release version check rejects unsupported tags and preserves matching releases', () => {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  for (const [tag, expectedStatus] of [
    ['v' + version, 0],
    ['v0.0.0', 1],
    ['v' + version + '-beta', 1],
    ['v-next', 1],
  ]) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-versions.js')], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: tag },
    });
    assert.equal(result.status, expectedStatus, tag + ': ' + result.stdout + result.stderr);
  }
});
