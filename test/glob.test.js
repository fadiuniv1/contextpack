import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesAny, matchesGlob } from '../src/glob.js';

test('matches a simple relative path', () => {
  assert.equal(matchesGlob('src/index.js', 'src/index.js'), true);
  assert.equal(matchesGlob('src/other.js', 'src/index.js'), false);
});

test('patterns without slashes match at any depth', () => {
  assert.equal(matchesGlob('a/b/c.log', '*.log'), true);
  assert.equal(matchesGlob('c.log', '*.log'), true);
  assert.equal(matchesGlob('a/b/c.txt', '*.log'), false);
});

test('double star crosses directories', () => {
  assert.equal(matchesGlob('src/deep/nested/file.ts', 'src/**/*.ts'), true);
  assert.equal(matchesGlob('src/file.ts', 'src/**/*.ts'), true);
  assert.equal(matchesGlob('lib/file.ts', 'src/**/*.ts'), false);
});

test('single star stays inside one segment', () => {
  assert.equal(matchesGlob('src/a.js', 'src/*.js'), true);
  assert.equal(matchesGlob('src/deep/a.js', 'src/*.js'), false);
});

test('question mark and character classes', () => {
  assert.equal(matchesGlob('a1.txt', 'a?.txt'), true);
  assert.equal(matchesGlob('a12.txt', 'a?.txt'), false);
  assert.equal(matchesGlob('img/pic.PNG', 'img/pic.[pP][nN][gG]'), true);
  assert.equal(matchesGlob('src/a.js', 'src/[!x].js'), true);
  assert.equal(matchesGlob('src/x.js', 'src/[!x].js'), false);
});

test('trailing slash matches a directory and its children', () => {
  assert.equal(matchesGlob('dist', 'dist/'), true);
  assert.equal(matchesGlob('dist/assets/app.js', 'dist/'), true);
  assert.equal(matchesGlob('distribution', 'dist/'), false);
});

test('matchesAny short-circuits with an empty list', () => {
  assert.equal(matchesAny('src/a.js', []), false);
  assert.equal(matchesAny('src/a.js', ['*.md', '**/*.js']), true);
});
