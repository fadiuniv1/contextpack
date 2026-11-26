import test from 'node:test';
import assert from 'node:assert/strict';
import { isIgnored, parseIgnoreFile } from '../src/gitignore.js';

const rules = parseIgnoreFile(`# comment
*.log
!important.log
/build/
temp?
`);

test('standard ignore patterns', () => {
  assert.equal(isIgnored('src/app.log', false, rules), true);
  assert.equal(isIgnored('app.log', false, rules), true);
  assert.equal(isIgnored('src/app.js', false, rules), false);
});

test('negation re-includes a file', () => {
  assert.equal(isIgnored('important.log', false, rules), false);
  assert.equal(isIgnored('logs/important.log', false, rules), false);
});

test('leading slash anchors to the ignore file directory', () => {
  assert.equal(isIgnored('build', true, rules), true);
  assert.equal(isIgnored('build/app.js', true, rules), false);
  assert.equal(isIgnored('src/build', true, rules), false);
});

test('directory-only rules do not match files', () => {
  assert.equal(isIgnored('build', true, rules), true);
  assert.equal(isIgnored('build.txt', false, rules), false);
});

test('rules from nested ignore files are relative to that directory', () => {
  const nested = parseIgnoreFile('*.generated.js\n', 'src/api');
  assert.equal(isIgnored('src/api/foo.generated.js', false, nested), true);
  assert.equal(isIgnored('src/foo.generated.js', false, nested), false);
});
