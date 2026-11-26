import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../src/cli.js';

test('--diff accepts an inline ref', () => {
  assert.equal(parseArgs(['--diff=main']).diff, 'main');
});

test('--diff accepts a separate ref', () => {
  assert.equal(parseArgs(['--diff', 'main']).diff, 'main');
});

test('bare --diff defaults to HEAD', () => {
  assert.equal(parseArgs(['--diff']).diff, 'HEAD');
});

test('--diff does not consume the following option', () => {
  const options = parseArgs(['--diff', '--list']);
  assert.equal(options.diff, 'HEAD');
  assert.equal(options.list, true);
});

test('inline values still work for other options', () => {
  const options = parseArgs(['--budget=100', '--format=json']);
  assert.equal(options.budget, 100);
  assert.equal(options.format, 'json');
});
