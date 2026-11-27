import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { matchesAny, toPosix } from './glob.js';
import { isIgnored, parseIgnoreFile } from './gitignore.js';
import { countLines, estimateTokens } from './tokens.js';
import { redactSecrets } from './redact.js';

export const DEFAULT_BUDGET = 8000;
export const DEFAULT_MAX_BYTES = 512 * 1024;
export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_FILES = 3000;

// Leave space for the user's question and the model's answer. Filling a
// context window to the last token produces a prompt the model cannot use.
export const DEFAULT_RESERVE_RATIO = 0.12;
export const DEFAULT_RESERVE_MAX = 4000;
export const DEFAULT_FILE_CAP_RATIO = 0.25;

const SKIP_DIRS = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.cache', '.turbo', '.svelte-kit', '.angular', 'vendor',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', '.pytest_cache',
  '.mypy_cache', '.terraform', '.gradle', 'target', 'obj',
]);

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf', '.zip',
  '.gz', '.tar', '.7z', '.rar', '.woff', '.woff2', '.ttf', '.eot', '.mp3',
  '.mp4', '.mov', '.wasm', '.pyc', '.class', '.jar', '.exe', '.dll', '.so',
  '.db', '.sqlite', '.parquet', '.pickle', '.lock',
]);

const SKIP_NAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock',
  'Cargo.lock', 'Gemfile.lock', 'composer.lock', '.DS_Store',
]);

const CODE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java',
  '.kt', '.rb', '.php', '.c', '.h', '.cpp', '.hpp', '.cs', '.swift', '.sh',
  '.bash', '.ps1', '.sql', '.vue', '.svelte', '.proto', '.graphql', '.tf', '.hcl',
]);

const DOC_EXT = new Set(['.md', '.mdx', '.txt', '.rst']);
const CONFIG_EXT = new Set(['.json', '.toml', '.yaml', '.yml', '.ini', '.env', '.xml', '.properties']);

const SPECIAL_NAMES = new Set([
  'readme.md', 'agents.md', 'claude.md', 'package.json', 'pyproject.toml',
  'cargo.toml', 'go.mod', 'makefile', 'dockerfile', 'compose.yaml',
  'compose.yml', '.env.example', '.env.sample', 'justfile',
]);

const LANGUAGES = {
  '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx',
  '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin',
  '.rb': 'ruby', '.php': 'php', '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp', '.swift': 'swift', '.sh': 'bash', '.bash': 'bash', '.ps1': 'powershell',
  '.sql': 'sql', '.vue': 'vue', '.svelte': 'svelte', '.proto': 'protobuf',
  '.graphql': 'graphql', '.tf': 'hcl', '.hcl': 'hcl', '.md': 'markdown', '.mdx': 'mdx',
  '.txt': 'text', '.rst': 'rst', '.json': 'json', '.toml': 'toml', '.yaml': 'yaml',
  '.yml': 'yaml', '.ini': 'ini', '.xml': 'xml', '.env': 'dotenv', '.html': 'html',
  '.css': 'css', '.scss': 'scss', '.dockerfile': 'dockerfile',
};

export function languageOf(relPath) {
  const base = path.basename(relPath).toLowerCase();
  if (base === 'dockerfile' || base === 'makefile') return base === 'dockerfile' ? 'dockerfile' : 'makefile';
  return LANGUAGES[path.extname(relPath).toLowerCase()] || '';
}

function isBinary(buffer) {
  const limit = Math.min(buffer.length, 1024);
  for (let i = 0; i < limit; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/** Walk the tree and return candidate files as { rel, abs }. */
export function collectFiles(root, options = {}) {
  const {
    include = [],
    exclude = [],
    respectGitignore = true,
    maxBytes = DEFAULT_MAX_BYTES,
    maxFiles = DEFAULT_MAX_FILES,
  } = options;

  const absoluteRoot = path.resolve(root);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    throw new Error(`Not a directory: ${absoluteRoot}`);
  }

  const found = [];

  function walk(currentDir, relDir, inheritedRules) {
    if (found.length >= maxFiles) return;

    let rules = inheritedRules;
    if (respectGitignore) {
      for (const filename of ['.gitignore', '.ignore']) {
        const ignorePath = path.join(currentDir, filename);
        if (fs.existsSync(ignorePath) && fs.statSync(ignorePath).isFile()) {
          rules = [...rules, ...parseIgnoreFile(fs.readFileSync(ignorePath, 'utf8'), relDir)];
        }
      }
    }

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Cannot read ${currentDir}: ${error.message}`);
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

    for (const entry of entries) {
      if (found.length >= maxFiles) return;
      if (entry.isSymbolicLink()) continue;

      const name = entry.name;
      const rel = relDir ? `${relDir}/${name}` : name;
      const abs = path.join(currentDir, name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name.toLowerCase())) continue;
        if (name.startsWith('.') && name !== '.github') continue;
        if (isIgnored(rel, true, rules)) continue;
        walk(abs, rel, rules);
        continue;
      }

      if (!entry.isFile()) continue;
      if (name.startsWith('.') && !['.env.example', '.env.sample'].includes(name)) continue;
      if (isIgnored(rel, false, rules)) continue;
      if (include.length > 0 && !matchesAny(rel, include)) continue;
      if (matchesAny(rel, exclude)) continue;
      if (SKIP_NAMES.has(name)) continue;
      if (SKIP_EXT.has(path.extname(name).toLowerCase())) continue;

      let stat;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size > maxBytes) continue;

      let buffer;
      try {
        buffer = fs.readFileSync(abs);
      } catch {
        continue;
      }
      if (isBinary(buffer)) continue;

      found.push({ rel, abs, bytes: stat.size });
    }
  }

  walk(absoluteRoot, '', []);
  return found;
}

function git(args, cwd) {
  // CI runners can export GIT_DIR/GIT_WORK_TREE for their own checkout.
  // Drop them so the command uses the requested directory.
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return execFileSync('git', args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Changed files (staged, unstaged and untracked) relative to the given root. */
export function changedFiles(root, ref = 'HEAD') {
  const absoluteRoot = path.resolve(root);
  let top;
  let prefix;
  try {
    // Ask Git for the canonical root and prefix. Node paths can keep Windows
    // 8.3 short names, which do not compare equal to Git's expanded path.
    top = git(['rev-parse', '--show-toplevel'], absoluteRoot).trim();
    prefix = toPosix(git(['rev-parse', '--show-prefix'], absoluteRoot).trim());
  } catch {
    throw new Error(`--diff needs a git repository. No git repository found at ${absoluteRoot}.`);
  }

  const inRoot = (p) => (prefix ? p.startsWith(prefix) : true);
  const toRel = (p) => (prefix ? p.slice(prefix.length) : p);

  const pathspec = prefix ? `${prefix}/` : '.';
  const names = new Set();
  let diffOutput = '';
  try {
    // Run from the repository root with a POSIX pathspec so Windows path
    // separators cannot change how Git matches files.
    diffOutput = git(['diff', '--name-only', '--diff-filter=ACMR', ref, '--', pathspec], top);
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`git diff failed for ref "${ref}". ${detail}`);
  }
  for (const line of diffOutput.split(/\r?\n/)) {
    if (!line) continue;
    const p = toPosix(line);
    if (inRoot(p)) names.add(toRel(p));
  }

  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', pathspec], top);
  for (const line of untracked.split(/\r?\n/)) {
    if (!line) continue;
    const p = toPosix(line);
    if (inRoot(p)) names.add(toRel(p));
  }

  return names;
}

/** Render the selected files as an ASCII directory tree. */
export function fileTree(paths) {
  const root = {};
  for (const filePath of paths) {
    const parts = filePath.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (i === parts.length - 1) {
        node[part] = null;
      } else {
        if (!node[part] || typeof node[part] !== 'object') node[part] = {};
        node = node[part];
      }
    }
  }

  const lines = [];
  function render(node, prefix) {
    const entries = Object.entries(node).sort(([a], [b]) => a.localeCompare(b, 'en'));
    entries.forEach(([name, child], index) => {
      const last = index === entries.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${name}`);
      if (child) render(child, `${prefix}${last ? '    ' : '│   '}`);
    });
  }
  render(root, '');
  return lines.join('\n');
}

function scoreFile(rel, depth, focus, changed) {
  let score = 0;
  if (changed && changed.has(rel)) score += 20000;
  if (matchesAny(rel, focus)) score += 10000;

  const ext = path.extname(rel).toLowerCase();
  if (CODE_EXT.has(ext)) score += 100;
  else if (DOC_EXT.has(ext)) score += 70;
  else if (CONFIG_EXT.has(ext)) score += 60;
  else score += 10;

  const base = path.basename(rel).toLowerCase();
  if (SPECIAL_NAMES.has(base)) score += 120;
  if (/(^|[-_.])(test|spec|fixture|snapshot)([-_.]|$)/.test(base)) score -= 40;

  return score - depth * 3;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'how', 'why',
  'what', 'fix', 'help', 'make', 'work', 'use', 'using', 'please', 'about',
]);

export function taskTerms(task) {
  if (!task) return [];
  return [...new Set(String(task).toLowerCase().match(/[a-z_][\w-]{2,}/g) || [])]
    .filter((word) => !STOPWORDS.has(word));
}

function taskRelevance(item, terms) {
  if (terms.length === 0) return 0;
  const haystack = `${item.rel}\n${item.content}`.toLowerCase();
  const hits = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
  return Math.min(1500, hits * 60);
}

const DEFINE_LINE = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:class|function|def|interface|type|struct|enum|impl|trait|module|namespace|func|const|let|var)\b|^\s*(?:pub|public|private|protected|static|final)\s+|^export\s+|^module\.exports\b/i;
const IMPORT_LINE = /^\s*(?:import|from|require|using|package|#include)\b/i;
const HEADING_LINE = /^#{1,6}\s+\S/;
const MARKER_LINE = /^\s*(?:TODO|FIXME|NOTE|HACK)\b/i;

/** How useful a line is when we can only show a skeleton of the file. */
function outlineScore(line, index, terms) {
  const text = line.trim();
  if (!text) return 0;
  const lower = text.toLowerCase();
  if (terms.some((term) => lower.includes(term))) return 7;
  if (HEADING_LINE.test(text) || DEFINE_LINE.test(text)) return 6;
  if (IMPORT_LINE.test(text)) return 5;
  if (MARKER_LINE.test(text)) return 4;
  if (index < 8 && (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*'))) return 3;
  return 1;
}

/**
 * Produce a compact structural skeleton of a file: imports, definitions,
 * headings and task-relevant lines. This is a dependency-free approximation
 * of a repo map. It is never claimed to be lossless.
 */
export function buildOutline(text, terms = [], capTokens = Infinity) {
  const lines = String(text).split(/\r?\n/);
  const scored = lines.map((line, index) => ({
    line,
    index,
    score: outlineScore(line, index, terms),
  }));

  let kept = scored.filter((item) => item.score >= 5 || item.index < 3);
  if (kept.length === 0) kept = scored.filter((item) => item.line.trim()).slice(0, 10);
  if (kept.length === 0) return null;

  const marker = `\n… [outline only: ${lines.length} lines, run with --max-file-tokens 0 for the full file]`;
  const render = (picked) => {
    const ordered = [...picked].sort((a, b) => a.index - b.index).map((item) => item.line);
    return `${ordered.join('\n')}${marker}`;
  };

  let outline = render(kept);
  while (estimateTokens(outline) > capTokens && kept.length > 1) {
    const removable = kept
      .filter((item) => item.index >= 3)
      .sort((a, b) => a.score - b.score || b.index - a.index)[0];
    if (!removable) break;
    kept = kept.filter((item) => item !== removable);
    outline = render(kept);
  }

  if (estimateTokens(outline) > capTokens) return null;
  return outline;
}

/**
 * Build the context object. It is pure data: formatting lives in cli.js so the
 * core can be imported by other tools.
 */
export function buildContext(root, options = {}) {
  const {
    budget = DEFAULT_BUDGET,
    focus = [],
    include = [],
    exclude = [],
    respectGitignore = true,
    redact = true,
    maxLines = DEFAULT_MAX_LINES,
    maxBytes = DEFAULT_MAX_BYTES,
    maxFiles = DEFAULT_MAX_FILES,
    diff = undefined,
    date = true,
    task = '',
    reserve,
    maxFileTokens,
    noOutline = false,
    ask = '',
  } = options;

  if (!Number.isFinite(budget) || budget < 0) throw new Error('budget must be a non-negative number');
  if (!Number.isInteger(maxLines) || maxLines < 1) throw new Error('maxLines must be a positive integer');
  if (reserve !== undefined && (!Number.isFinite(reserve) || reserve < 0)) throw new Error('reserve must be a non-negative number');
  if (maxFileTokens !== undefined && (!Number.isFinite(maxFileTokens) || maxFileTokens < 0)) {
    throw new Error('maxFileTokens must be a non-negative number');
  }

  const headroom = budget === 0
    ? 0
    : reserve === undefined
      ? Math.min(Math.round(budget * DEFAULT_RESERVE_RATIO), DEFAULT_RESERVE_MAX)
      : Math.min(reserve, budget);
  const askTokens = ask ? estimateTokens(`## Question\n\n${ask}`) : 0;
  const reserved = budget === 0 ? 0 : Math.min(budget, headroom + askTokens);
  const usable = budget === 0 ? 0 : Math.max(0, budget - reserved);
  const fileCap = maxFileTokens === undefined
    ? (budget === 0 ? 0 : Math.max(1, Math.floor(usable * DEFAULT_FILE_CAP_RATIO)))
    : maxFileTokens;
  const terms = taskTerms(task);
  const changed = diff === undefined ? null : changedFiles(root, diff || 'HEAD');
  let files = collectFiles(root, { include, exclude, respectGitignore, maxBytes, maxFiles });
  if (changed) {
    files = files.filter((file) => changed.has(file.rel));
    if (files.length === 0) {
      throw new Error('No changed text files found. Nothing to pack.');
    }
  }

  const items = files.map((file) => {
    let content = fs.readFileSync(file.abs, 'utf8');
    const originalLines = countLines(content);
    if (maxLines && originalLines > maxLines) {
      const kept = content.split('\n').slice(0, maxLines).join('\n');
      content = `${kept}\n… [${originalLines - maxLines} more lines omitted by contextpack]`;
    }
    content = redactSecrets(content, redact);
    return {
      rel: file.rel,
      content,
      tokens: estimateTokens(content),
      lines: Math.min(originalLines, maxLines || originalLines),
      depth: file.rel.split('/').length - 1,
    };
  });

  for (const item of items) item.taskScore = taskRelevance(item, terms);

  items.sort((a, b) => {
    const sa = scoreFile(a.rel, a.depth, focus, changed) + a.taskScore;
    const sb = scoreFile(b.rel, b.depth, focus, changed) + b.taskScore;
    return sb - sa || a.tokens - b.tokens || a.rel.localeCompare(b.rel, 'en');
  });

  const selected = [];
  const skipped = [];
  let used = 0;
  let outlined = 0;

  for (const item of items) {
    const fullFits = (budget === 0 || used + item.tokens <= usable)
      && (fileCap === 0 || item.tokens <= fileCap);

    if (fullFits) {
      selected.push(item);
      used += item.tokens;
      continue;
    }

    // Keep one file even when the budget is tiny, so the output is never empty.
    if (selected.length === 0) {
      const content = fileCap > 0 && !noOutline
        ? buildOutline(item.content, terms, fileCap) || item.content
        : item.content;
      const tokens = estimateTokens(content);
      selected.push({ ...item, content, tokens, outlined: content !== item.content, originalTokens: item.tokens });
      if (content !== item.content) outlined += 1;
      used += tokens;
      continue;
    }

    if (fileCap > 0 && !noOutline) {
      const room = usable - used;
      if (room > 0) {
        const outline = buildOutline(item.content, terms, Math.min(fileCap, room));
        if (outline) {
          const tokens = estimateTokens(outline);
          selected.push({ ...item, content: outline, tokens, outlined: true, originalTokens: item.tokens });
          outlined += 1;
          used += tokens;
          continue;
        }
      }
    }

    skipped.push({
      ...item,
      reason: fileCap > 0 && item.tokens > fileCap ? 'over per-file cap' : 'budget',
    });
  }

  return {
    meta: {
      root: path.basename(path.resolve(root)),
      generated: date ? new Date().toISOString() : null,
      structure: fileTree(selected.map((item) => item.rel)),
      budget,
      reserved,
      askTokens,
      usable,
      maxFileTokens: fileCap,
      usedTokens: used,
      totalTokens: items.reduce((sum, item) => sum + item.tokens, 0),
      candidates: items.length,
      included: selected.length,
      outlined,
      omitted: skipped.length,
      omittedByReason: skipped.reduce((acc, file) => {
        acc[file.reason] = (acc[file.reason] || 0) + 1;
        return acc;
      }, {}),
      mode: changed ? 'diff' : 'full',
      task: task || null,
      ask: ask || null,
    },
    files: selected,
    skipped,
  };
}
