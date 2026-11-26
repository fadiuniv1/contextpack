import test from 'node:test';
import assert from 'node:assert/strict';
import { countLines, estimateTokens } from '../src/tokens.js';

test('empty input costs no tokens', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(countLines(''), 0);
});

test('longer text costs more tokens', () => {
  assert.ok(estimateTokens('a'.repeat(400)) > estimateTokens('a'.repeat(40)));
});

test('code with punctuation costs more than plain text of equal length', () => {
  const plain = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const code = 'a b { c } d . e ; f = g [ h ] i ( j )';
  assert.ok(estimateTokens(code) > estimateTokens(plain.slice(0, code.length)));
});

test('line counting handles trailing newlines', () => {
  assert.equal(countLines('one\ntwo'), 2);
  assert.equal(countLines('one\ntwo\n'), 3);
});
