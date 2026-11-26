# contextpack

**Pack a repository into a clean, token-budgeted Markdown file you can paste into any LLM or coding agent.**

No API keys. No uploads. No dependencies. One command.

```bash
npx contextpack . --budget 8000 -o context.md
```

---

## Why?

You already paste code into ChatGPT, Claude, Gemini or a coding agent. Doing it by hand means:

- copying files one by one and losing the directory structure,
- blowing past the context window with `node_modules` and lockfiles,
- accidentally including an `.env` with real secrets,
- re-doing it every time the code changes.

`contextpack` does that work locally: it walks your repo, respects `.gitignore`, ranks files by usefulness, redacts common secrets, and emits one Markdown document sized to your token budget.

```
$ contextpack . --budget 900 --focus 'src/**'

# Context: contextpack

- Generated: 2026-11-26T16:35:16.860Z
- Mode: full
- Estimated tokens: 824 / 900
- Files: 4 of 13 (9 omitted to fit the budget)

> Token counts are local estimates. No code was uploaded.

## Contents

- `src/tokens.js` — ~203 tokens
- `src/redact.js` — ~333 tokens
- `package.json` — ~259 tokens
- `bin/contextpack.js` — ~29 tokens

---

## `src/tokens.js`

```js
export function estimateTokens(text) { ... }
```
```

## Install

Run it without installing:

```bash
npx contextpack .
```

Or install globally:

```bash
npm install -g contextpack
contextpack .
```

Requires Node.js 18+. Works on Windows, macOS and Linux.

## Usage

```
contextpack [path] [options]
```

| Option | Description |
| --- | --- |
| `-o, --out <file>` | Write to a file instead of stdout |
| `-b, --budget <n>` | Token budget, `0` = unlimited (default: `8000`) |
| `-f, --focus <glob>` | Prioritize matching files (repeatable) |
| `-i, --include <glob>` | Only consider matching files (repeatable) |
| `-e, --exclude <glob>` | Skip matching files (repeatable) |
| `--diff [ref]` | Pack only changed files; compares to `HEAD` by default |
| `--format <fmt>` | `markdown`, `plain` or `json` (default: `markdown`) |
| `--list` | Show every candidate file with its token cost |
| `--max-lines <n>` | Truncate files longer than *n* lines (default: `2000`) |
| `--no-gitignore` | Ignore `.gitignore` rules |
| `--no-redact` | Disable secret redaction |
| `-v, --version` | Print version |
| `-h, --help` | Show help |

## Recipes

**Whole repo, ready to paste**

```bash
contextpack . -o context.md
```

**Only what changed in this branch (great for code review prompts)**

```bash
contextpack . --diff main --focus 'src/**' -o pr-context.md
```

This includes modified, staged and untracked text files.

**Only Python source, with a hard budget**

```bash
contextpack ./src --include '*.py' --budget 4000 -o context.md
```

**See what would be included before you commit**

```bash
contextpack . --list
```

```
FILE                     TOKENS   LINES  INCLUDED
----------------------------------------------------
package.json                259      50  yes
src/cli.js                2,129     273  yes
src/pack.js               2,695     302  no
test/pack.test.js         1,330     141  no
...
```

**Machine-readable output for your own tooling**

```bash
contextpack . --format json -o context.json
```

```json
{
  "meta": { "root": "my-app", "budget": 8000, "usedTokens": 4210, "included": 17 },
  "files": [{ "path": "src/index.js", "tokens": 812, "lines": 96, "content": "..." }],
  "omitted": [{ "path": "package-lock.json", "tokens": 99999 }]
}
```

## How files are chosen

Files are scored, sorted by score (then by size), then added until the budget is full:

1. `--focus` matches and `--diff` files get top priority.
2. Source code (`.ts`, `.py`, `.go`, `.rs`, …) ranks above docs, then config files.
3. Root-level `README.md`, `AGENTS.md`, `package.json`, `Dockerfile`, etc. get a bonus.
4. Test, fixture and snapshot files rank slightly lower.
5. Shallower files rank above deeply nested ones; smaller files win ties.

Skipped automatically: `.git`, `node_modules`, `dist`, `build`, `coverage`, `.next`, virtualenvs, lockfiles, binary files, images, archives and anything matched by `.gitignore` (including nested `.gitignore` files).

## Token counts and privacy

Token counts are **local estimates** using a character/punctuation heuristic — roughly ±15% versus a real tokenizer. They never call an API, and no code leaves your machine.

Common secrets (`API_KEY=...`, `sk-...`, `ghp_...`, AWS keys, JWTs, bearer tokens, private key blocks) are redacted by default. Treat this as a safety net, not a guarantee: **review the output before sharing it**. Use `--no-redact` only when you are sure the repo has no secrets.

## Use as a library

```js
import { buildContext } from 'contextpack';
import { formatMarkdown } from 'contextpack/cli';

const ctx = buildContext('.', { budget: 4000, focus: ['src/**'] });
console.log(formatMarkdown(ctx));
```

## How it compares

[repomix](https://github.com/yamadashy/repomix) is the mature general-purpose tool: exact tokenizer counts, compression, MCP, remote repos, many output styles. Use it when you want the whole repository.

`contextpack` is deliberately narrower:

| | contextpack | repomix |
| --- | --- | --- |
| Runtime dependencies | **none** | several |
| Fits output to a token budget | **yes — omits low-priority files** | guard only: fails if output exceeds budget |
| Only changed files (`--diff`) | **yes** | adds diffs to the full tree |
| File relevance ranking | yes | sorts by git change frequency |
| Exact tokenizer counts | no (local estimate, ±15%) | yes (tiktoken) |
| Output styles | Markdown, plain, JSON | XML, Markdown, JSON, plain + more |
| Setup | `npx contextpack .` | `npx repomix` |

[gitingest](https://github.com/cyclotruc/gitingest) and [code2prompt](https://github.com/mrfearless/code2prompt) are also good options if you prefer their ecosystems or templating.

Use `contextpack` when you want a short, relevant, reviewable prompt and nothing else.

## Roadmap

- [ ] `--profile` presets for common models (8k / 32k / 200k)
- [ ] Token counting adapters for exact local tokenizers
- [ ] Git-aware relevance scoring using recent commit history
- [ ] `--output` copy to clipboard
- [ ] Deterministic generation mode (`--no-date`) for reproducible diffs

Ideas and PRs welcome — open an issue first for anything big.

## Contributing

```bash
git clone https://github.com/fadiuniv1/contextpack.git
cd contextpack
npm test
```

Please add a test for any behavior change. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © contextpack contributors

---

If this saved you time, a ⭐ helps other developers find it.
