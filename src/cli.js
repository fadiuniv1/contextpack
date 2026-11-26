import fs from 'node:fs';
import path from 'node:path';
import { buildContext, DEFAULT_BUDGET, DEFAULT_MAX_LINES } from './pack.js';
import { languageOf } from './pack.js';

const VERSION = '0.1.3';

const PROFILES = { '8k': 8000, '32k': 32000, '128k': 128000, '200k': 200000 };

const HELP = `contextpack — pack a repository into a token-budgeted Markdown file for LLMs

Usage:
  contextpack [path] [options]

Options:
  -o, --out <file>       Write to a file instead of stdout
  -b, --budget <n>       Token budget, 0 = unlimited (default: ${DEFAULT_BUDGET})
      --profile <name>   8k | 32k | 128k | 200k preset budget
  -f, --focus <glob>     Prioritize matching files (repeatable)
  -i, --include <glob>   Only consider matching files (repeatable)
  -e, --exclude <glob>   Skip matching files (repeatable)
      --diff [ref]       Only pack changed files; compares to HEAD by default
      --format <fmt>     markdown | plain | json (default: markdown)
      --list             List candidate files with token costs instead of packing
      --max-lines <n>    Truncate files above n lines (default: ${DEFAULT_MAX_LINES})
      --no-gitignore     Do not apply .gitignore rules
      --no-redact        Do not redact secrets
      --no-date          Omit the timestamp for reproducible output
  -v, --version          Print version
  -h, --help             Show this help

Examples:
  contextpack .
  contextpack ./src --budget 4000 --focus 'src/api/**'
  contextpack . --diff main --format json -o context.json
  contextpack . --list --include '*.py'
`;

class UsageError extends Error {}

function number(value, name, { min = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) throw new UsageError(`Invalid ${name}: "${value}"`);
  return parsed;
}

export function parseArgs(argv) {
  const options = {
    path: '.',
    out: null,
    budget: DEFAULT_BUDGET,
    focus: [],
    include: [],
    exclude: [],
    diff: undefined,
    format: 'markdown',
    list: false,
    maxLines: DEFAULT_MAX_LINES,
    respectGitignore: true,
    redact: true,
    date: true,
    profile: null,
    budgetExplicit: false,
    help: false,
    version: false,
  };

  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);

    const take = () => {
      if (inline !== undefined) return inline;
      const next = argv[++i];
      if (next === undefined) throw new UsageError(`Missing value for ${flag}`);
      return next;
    };

    switch (flag) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-v':
      case '--version':
        options.version = true;
        break;
      case '-o':
      case '--out':
        options.out = take();
        break;
      case '-b':
      case '--budget':
        options.budget = number(take(), 'budget');
        options.budgetExplicit = true;
        break;
      case '--profile': {
        const name = take().toLowerCase();
        if (!PROFILES[name]) throw new UsageError(`Unknown profile "${name}". Use 8k, 32k, 128k or 200k.`);
        options.profile = name;
        break;
      }
      case '--no-date':
        options.date = false;
        break;
      case '-f':
      case '--focus':
        options.focus.push(take());
        break;
      case '-i':
      case '--include':
        options.include.push(take());
        break;
      case '-e':
      case '--exclude':
        options.exclude.push(take());
        break;
      case '--diff': {
        if (inline !== undefined && inline !== '') {
          options.diff = inline;
        } else {
          const next = argv[i + 1];
          if (next && !next.startsWith('-')) {
            options.diff = next;
            i += 1;
          } else {
            options.diff = 'HEAD';
          }
        }
        break;
      }
      case '--format':
        options.format = take().toLowerCase();
        if (!['markdown', 'plain', 'json'].includes(options.format)) {
          throw new UsageError(`Unknown format "${options.format}". Use markdown, plain or json.`);
        }
        break;
      case '--list':
        options.list = true;
        break;
      case '--max-lines':
        options.maxLines = number(take(), 'max-lines', { min: 1 });
        break;
      case '--no-gitignore':
        options.respectGitignore = false;
        break;
      case '--no-redact':
        options.redact = false;
        break;
      case '--':
        positional.push(...argv.slice(i + 1));
        i = argv.length;
        break;
      default:
        if (arg.startsWith('-')) throw new UsageError(`Unknown option: ${arg}`);
        positional.push(arg);
    }
  }

  if (positional.length > 1) throw new UsageError(`Expected at most one path, got: ${positional.join(', ')}`);
  if (positional.length === 1) options.path = positional[0];
  if (options.profile && !options.budgetExplicit) options.budget = PROFILES[options.profile];
  return options;
}

function fenceFor(content) {
  const runs = content.match(/`+/g) || [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function formatCount(n) {
  return Number(n).toLocaleString('en-US');
}

export function formatMarkdown(ctx) {
  const { meta, files } = ctx;
  const lines = [
    `# Context: ${meta.root}`,
    '',
    ...(meta.generated ? [`- Generated: ${meta.generated}`] : []),
    `- Mode: ${meta.mode}`,
    `- Estimated tokens: ${formatCount(meta.usedTokens)} / ${meta.budget === 0 ? 'unlimited' : formatCount(meta.budget)}`,
    `- Files: ${meta.included} of ${meta.candidates}${meta.omitted ? ` (${meta.omitted} omitted to fit the budget)` : ''}`,
    '',
    '> Token counts are local estimates. No code was uploaded.',
    '',
    '## Contents',
    '',
  ];

  for (const file of files) {
    lines.push(`- \`${file.rel}\` — ~${formatCount(file.tokens)} tokens`);
  }

  for (const file of files) {
    const fence = fenceFor(file.content);
    const lang = languageOf(file.rel);
    lines.push('', '---', '', `## \`${file.rel}\``, '');
    lines.push(`${fence}${lang}`, file.content.replace(/\s+$/, ''), fence);
  }

  return `${lines.join('\n')}\n`;
}

export function formatPlain(ctx) {
  const parts = ctx.files.map((file) => `===== ${file.rel} (~${file.tokens} tokens) =====\n${file.content.replace(/\s+$/, '')}`);
  return `${parts.join('\n\n')}\n`;
}

export function formatJson(ctx) {
  return `${JSON.stringify({
    meta: ctx.meta,
    files: ctx.files.map((file) => ({
      path: file.rel,
      tokens: file.tokens,
      lines: file.lines,
      content: file.content,
    })),
    omitted: ctx.skipped.map((file) => ({ path: file.rel, tokens: file.tokens })),
  }, null, 2)}\n`;
}

export function formatList(ctx) {
  const all = [...ctx.files, ...ctx.skipped].sort((a, b) => a.rel.localeCompare(b.rel, 'en'));
  const width = Math.min(60, Math.max(4, ...all.map((file) => file.rel.length)));
  const lines = [
    `${'FILE'.padEnd(width)}  ${'TOKENS'.padStart(7)}  ${'LINES'.padStart(6)}  INCLUDED`,
    '-'.repeat(width + 30),
  ];
  for (const file of all) {
    const included = ctx.files.includes(file) ? 'yes' : 'no ';
    lines.push(
      `${file.rel.padEnd(width)}  ${formatCount(file.tokens).padStart(7)}  ${String(file.lines).padStart(6)}  ${included}`,
    );
  }
  lines.push('', `Total: ${formatCount(ctx.meta.usedTokens)} tokens in ${ctx.meta.included} files`);
  return `${lines.join('\n')}\n`;
}

export function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`contextpack: ${error.message}\n\n${HELP}`);
    return 2;
  }

  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  try {
    const ctx = buildContext(options.path, {
      budget: options.budget,
      focus: options.focus,
      include: options.include,
      exclude: options.exclude,
      diff: options.diff,
      maxLines: options.maxLines,
      respectGitignore: options.respectGitignore,
      redact: options.redact,
    });

    const output = options.list
      ? formatList(ctx)
      : options.format === 'json'
        ? formatJson(ctx)
        : options.format === 'plain'
          ? formatPlain(ctx)
          : formatMarkdown(ctx);

    if (options.out) {
      fs.writeFileSync(path.resolve(options.out), output, 'utf8');
      process.stdout.write(`Wrote ${options.out} — ${ctx.meta.included} files, ~${formatCount(ctx.meta.usedTokens)} tokens\n`);
    } else {
      process.stdout.write(output);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`contextpack: ${error.message}\n`);
    return 1;
  }
}
