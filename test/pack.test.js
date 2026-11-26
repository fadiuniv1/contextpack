import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildContext, changedFiles, collectFiles } from '../src/pack.js';
import { formatJson, formatMarkdown, parseArgs } from '../src/cli.js';

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextpack-test-'));
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
    write(rel, content) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
      return target;
    },
  };
}

test('collectFiles respects .gitignore, skips binaries and build output', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('.gitignore', 'secret.txt\n*.log\n');
  tmp.write('README.md', '# Hi');
  tmp.write('src/app.js', 'console.log(1)');
  tmp.write('secret.txt', 'nope');
  tmp.write('debug.log', 'nope');
  tmp.write('node_modules/pkg/index.js', 'nope');
  tmp.write('image.bin', Buffer.from([0, 1, 2, 3]));

  const rels = collectFiles(tmp.dir).map((file) => file.rel).sort();
  assert.deepEqual(rels, ['README.md', 'src/app.js']);
});

test('include, exclude and --no-gitignore options work', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('.gitignore', 'ignored.js\n');
  tmp.write('a.js', 'a');
  tmp.write('b.py', 'b');
  tmp.write('ignored.js', 'c');

  assert.deepEqual(collectFiles(tmp.dir, { include: ['*.py'] }).map((f) => f.rel), ['b.py']);
  assert.deepEqual(collectFiles(tmp.dir, { exclude: ['*.js'] }).map((f) => f.rel), ['b.py']);
  assert.equal(collectFiles(tmp.dir, { respectGitignore: false }).length, 3);
});

test('buildContext prioritizes focused files and redacts secrets', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('README.md', '# Demo');
  tmp.write('src/main.js', 'const x = 1;\n');
  tmp.write('src/api/handler.js', 'export const key = process.env.API_KEY;\n');
  tmp.write('src/api/handler.js', 'API_KEY=abcdefghijklmnopqrstuvwxyz\n');

  const ctx = buildContext(tmp.dir, { focus: ['src/api/**'], budget: 10000 });
  assert.equal(ctx.files[0].rel, 'src/api/handler.js');
  assert.match(ctx.files[0].content, /\[REDACTED\]/);
  assert.equal(ctx.meta.omitted, 0);
});

test('budget omits lower-priority files', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('README.md', 'x'.repeat(400));
  tmp.write('a.js', 'y'.repeat(400));
  tmp.write('b.js', 'z'.repeat(400));

  const ctx = buildContext(tmp.dir, { budget: 50 });
  assert.equal(ctx.meta.included, 1);
  assert.equal(ctx.meta.omitted, 2);
});

test('maxLines truncates long files', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('a.js', 'line\n'.repeat(50));

  const ctx = buildContext(tmp.dir, { maxLines: 5 });
  assert.match(ctx.files[0].content, /more lines omitted by contextpack/);
  assert.equal(ctx.files[0].lines, 5);
});

test('formatters produce usable output', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('src/app.js', 'const value = "hello";\n');

  const ctx = buildContext(tmp.dir, { budget: 0 });
  const md = formatMarkdown(ctx);
  assert.match(md, /# Context:/);
  assert.match(md, /```js/);
  assert.match(md, /src\/app\.js/);

  const json = JSON.parse(formatJson(ctx));
  assert.equal(json.files[0].path, 'src/app.js');
  assert.equal(json.meta.budget, 0);
});

test('parseArgs handles flags and validates values', () => {
  const parsed = parseArgs(['.', '-b', '1000', '--focus', 'src/**', '--diff', 'main', '--format', 'json', '--no-redact']);
  assert.equal(parsed.budget, 1000);
  assert.deepEqual(parsed.focus, ['src/**']);
  assert.equal(parsed.diff, 'main');
  assert.equal(parsed.format, 'json');
  assert.equal(parsed.redact, false);
  assert.equal(parsed.path, '.');

  assert.throws(() => parseArgs(['--budget', 'abc']), /Invalid budget/);
  assert.throws(() => parseArgs(['--format', 'xml']), /Unknown format/);
  assert.equal(parseArgs(['--profile', '32k']).budget, 32000);
  assert.equal(parseArgs(['--profile', '8k', '-b', '500']).budget, 500);
  assert.equal(parseArgs(['--no-date']).date, false);
  assert.throws(() => parseArgs(['--profile', 'nope']), /Unknown profile/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/);
});

test('.ignore files are respected alongside .gitignore', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('.ignore', 'generated.js\n');
  tmp.write('keep.js', 'a');
  tmp.write('generated.js', 'b');
  assert.deepEqual(collectFiles(tmp.dir).map((f) => f.rel), ['keep.js']);
});

test('context includes a directory tree and optional deterministic timestamp', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('src/a.js', 'a');
  tmp.write('src/deep/b.js', 'b');

  const ctx = buildContext(tmp.dir, { date: false, budget: 0 });
  assert.equal(ctx.meta.generated, null);
  assert.match(ctx.meta.structure, /└── src/);
  assert.match(ctx.meta.structure, /└── deep/);
});

test('changedFiles finds modified and untracked files', (t) => {
  const tmp = tempDir();
  t.after(tmp.cleanup);
  tmp.write('a.js', 'a');
  tmp.write('b.js', 'b');
  const git = (args) => execFileSync('git', args, { cwd: tmp.dir, encoding: 'utf8' });
  try {
    git(['init', '-q']);
    git(['add', '.']);
    git(['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-q', '-m', 'init']);
  } catch (error) {
    t.skip(`git unavailable or commit failed: ${error.message}`);
    return;
  }
  tmp.write('a.js', 'changed');
  tmp.write('c.js', 'new');

  const files = changedFiles(tmp.dir);
  assert.deepEqual([...files].sort(), ['a.js', 'c.js']);

  const ctx = buildContext(tmp.dir, { diff: 'HEAD', budget: 0 });
  assert.deepEqual(ctx.files.map((f) => f.rel).sort(), ['a.js', 'c.js']);
});
