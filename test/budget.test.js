import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildContext } from '../src/pack.js';
import { formatJson, formatMarkdown, parseArgs } from '../src/cli.js';

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextpack-budget-'));
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
    write(rel, content) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    },
  };
}

test('default reserve leaves room for the question and the answer', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('a.js', 'const a = 1;\n');

  const ctx = buildContext(tmp.dir, { budget: 1000 });
  assert.equal(ctx.meta.reserved, 120);
  assert.equal(ctx.meta.usable, 880);
  assert.ok(ctx.meta.usedTokens <= ctx.meta.usable);
  assert.match(formatMarkdown(ctx), /Reserved: ~120 tokens/);
});

test('--no-reserve and explicit reserve are respected', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('a.js', 'const a = 1;\n');

  const none = buildContext(tmp.dir, { budget: 1000, reserve: 0 });
  assert.equal(none.meta.reserved, 0);
  assert.equal(none.meta.usable, 1000);

  const custom = buildContext(tmp.dir, { budget: 1000, reserve: 300 });
  assert.equal(custom.meta.reserved, 300);
  assert.equal(custom.meta.usable, 700);
});

test('a huge file becomes an outline instead of consuming the whole budget', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  const filler = Array.from({ length: 200 }, (_, i) => `  const filler${i} = ${i};`).join('\n');
  tmp.write('huge.js', `import fs from 'node:fs';\nexport function importantFeature() {\n${filler}\n}\n`);

  const ctx = buildContext(tmp.dir, { budget: 4000, noDate: true });
  assert.equal(ctx.files.length, 1);
  assert.equal(ctx.files[0].outlined, true);
  assert.match(ctx.files[0].content, /importantFeature/);
  assert.match(ctx.files[0].content, /outline only/);
  assert.ok(ctx.files[0].tokens <= ctx.meta.maxFileTokens);
  assert.equal(ctx.meta.outlined, 1);
});

test('--no-outline skips oversized files instead of outlining them', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  const filler = Array.from({ length: 200 }, (_, i) => `  const filler${i} = ${i};`).join('\n');
  tmp.write('huge.js', `export function importantFeature() {\n${filler}\n}\n`);
  tmp.write('small.js', 'export const ok = true;\n');

  const ctx = buildContext(tmp.dir, { budget: 4000, noOutline: true });
  assert.equal(ctx.files.length, 1);
  assert.equal(ctx.meta.outlined, 0);
  assert.equal(ctx.meta.omitted, 1);
  assert.equal(ctx.skipped[0].reason, 'over per-file cap');
});

test('--ask appends a ready-to-paste question and JSON records omission reasons', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('a.js', 'export const a = 1;\n');
  tmp.write('huge.js', `export function huge() {\n${'x'.repeat(5000)}\n}\n`);

  const ctx = buildContext(tmp.dir, { budget: 2000, ask: 'Where is the bug?' });
  assert.equal(ctx.meta.ask, 'Where is the bug?');
  assert.match(formatMarkdown(ctx), /## Question\n\nWhere is the bug\?/);
  const json = JSON.parse(formatJson(ctx));
  assert.equal(json.meta.ask, 'Where is the bug?');
  assert.ok(json.omitted.every((file) => file.reason));
});

test('--ask tokens are charged to the reserved budget', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('a.js', 'export const a = 1;\n');

  const question = 'Please explain this file and suggest a careful fix. '.repeat(20);
  const ctx = buildContext(tmp.dir, { budget: 1000, ask: question });

  assert.ok(ctx.meta.askTokens > 0);
  assert.equal(ctx.meta.reserved, Math.min(1000, 120 + ctx.meta.askTokens));
  assert.equal(ctx.meta.usable, 1000 - ctx.meta.reserved);
  assert.ok(ctx.meta.usedTokens <= ctx.meta.usable);
  assert.match(formatMarkdown(ctx), /Reserved: ~[\d,]+ tokens for your question and the answer \(includes ~[\d,]+ for your question\)/);
});

test('--no-reserve still reserves the question itself', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('a.js', 'const a = 1;\n');

  const ctx = buildContext(tmp.dir, { budget: 1000, reserve: 0, ask: 'x'.repeat(400) });
  assert.equal(ctx.meta.reserved, ctx.meta.askTokens);
  assert.equal(ctx.meta.usable, 1000 - ctx.meta.askTokens);
});

test('unlimited budget keeps the question out of the reserve', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('a.js', 'const a = 1;\n');

  const ctx = buildContext(tmp.dir, { budget: 0, ask: 'Where is the bug?' });
  assert.equal(ctx.meta.reserved, 0);
  assert.equal(ctx.meta.usable, 0);
  assert.ok(ctx.meta.askTokens > 0);
});

test('task keywords are prioritized inside outlines', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  const filler = Array.from({ length: 150 }, (_, i) => `  const filler${i} = ${i};`).join('\n');
  tmp.write('huge.js', `export function renderButton() {\n${filler}\n  const refreshToken = 1;\n}\n`);

  const ctx = buildContext(tmp.dir, { budget: 3000, task: 'refresh token' });
  assert.match(ctx.files[0].content, /refreshToken/);
});

test('parseArgs accepts the new budget flags', () => {
  const parsed = parseArgs(['.', '--reserve', '500', '--max-file-tokens', '900', '--no-outline', '--ask', 'Explain this']);
  assert.equal(parsed.reserve, 500);
  assert.equal(parsed.maxFileTokens, 900);
  assert.equal(parsed.noOutline, true);
  assert.equal(parsed.ask, 'Explain this');

  assert.equal(parseArgs(['--no-reserve']).reserve, 0);
  assert.throws(() => parseArgs(['--reserve', 'abc']), /Invalid reserve/);
  assert.throws(() => parseArgs(['--max-file-tokens', '-1']), /Invalid max-file-tokens/);
});
