import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from '../src/redact.js';

test('redacts key/value secrets but keeps the key name', () => {
  const input = 'API_KEY=supersecretvalue123\nPORT=3000';
  const output = redactSecrets(input);
  assert.match(output, /API_KEY=\[REDACTED\]/);
  assert.match(output, /PORT=3000/);
});

test('redacts provider tokens and GitHub tokens', () => {
  const input = 'sk-abcdefghijklmnop1234567890 and ghp_abcdefghijklmnopqrstuvwxyz0123456789';
  const output = redactSecrets(input);
  assert.doesNotMatch(output, /sk-abcdef/);
  assert.doesNotMatch(output, /ghp_abc/);
});

test('redacts private key blocks', () => {
  const input = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';
  assert.equal(redactSecrets(input), '[REDACTED PRIVATE KEY]');
});

test('can be disabled', () => {
  const input = 'API_KEY=abc123def456ghi789';
  assert.equal(redactSecrets(input, false), input);
});
