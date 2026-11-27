<div align="center">

# contextpack

**Pack a repository into a token-budgeted Markdown file you can paste into any LLM or coding agent.**

[![npm](https://img.shields.io/npm/v/contextpack-cli?style=for-the-badge)](https://www.npmjs.com/package/contextpack-cli)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

</div>

No API keys. No uploads. No runtime dependencies. One command.

---

## Contents

- [Why contextpack](#why-contextpack)
- [Quick start](#quick-start)
- [Tutorial: from zero to a ready-to-paste context file](#tutorial-from-zero-to-a-ready-to-paste-context-file)
- [Command reference](#command-reference)
- [How files are selected](#how-files-are-selected)
- [Recipes](#recipes)
- [Use it as a library](#use-it-as-a-library)
- [Privacy and secrets](#privacy-and-secrets)
- [Troubleshooting](#troubleshooting)
- [How it compares](#how-it-compares)
- [Roadmap](#roadmap)

---

## Why contextpack

Pasting a repository into an LLM by hand means:

- copying files one by one and losing the directory structure,
- burning your context window on lockfiles, build output and dependencies,
- accidentally including an .env file with real secrets,
- redoing all of it every time the code changes.

contextpack does that work locally. It walks the tree, respects .gitignore, ranks files by usefulness, redacts common secrets, and emits one Markdown document sized to your token budget.

---

## Quick start

Requirements: **Node.js 18+**. Nothing else. Git is only needed for the --diff option.

~~~bash
# Run it without installing anything
npx contextpack-cli .

# Or write the result to a file you can paste into your AI tool
npx contextpack-cli . -o context.md
~~~

The npm package is named **contextpack-cli** because the plain name was taken. The command you run is still **contextpack** if you install it globally:

~~~bash
npm install -g contextpack-cli
contextpack --version
contextpack .
~~~

### A verified run

Here is a real terminal session on Windows after installing Node 18+:

~~~text
PS C:\Users\fadiu\OneDrive\Desktop\New folder> npx contextpack-cli . --budget 8000 -o context.md
npm notice run npx
npm notice run contextpack . --budget 8000 -o context.md
Wrote context.md — 47 files, ~7,998 tokens
PS C:\Users\fadiu\OneDrive\Desktop\New folder>
~~~

The budget was respected: 47 candidate files were selected at about 7,998 tokens against an 8,000 token budget. The tool writes the file and reports a one-line summary, which makes it easy to script.

---

## Tutorial: from zero to a ready-to-paste context file

### Step 1: Check your Node version

~~~bash
node --version
~~~

You need v18 or newer. If the command is not found, install Node from nodejs.org.

### Step 2: Run it on a repository

Change into the project you want to explain to an AI, then run:

~~~bash
cd /path/to/your/project
npx contextpack-cli .
~~~

The first run downloads the package once, then prints a document like this:

~~~text
# Context: my-app

- Generated: 2026-11-26T16:35:16.860Z
- Mode: full
- Estimated tokens: 824 / 8000
- Files: 4 of 13 (9 omitted to fit the budget)

> Token counts are local estimates. No code was uploaded.

## Structure
...
## Contents

- src/tokens.js — ~203 tokens
- src/redact.js — ~333 tokens
- package.json — ~259 tokens
- bin/contextpack.js — ~29 tokens
~~~

Then each selected file is printed inside a fenced code block with its relative path as the heading.

**Read the header first.** It tells you how many candidate files were found, how many made it in, and roughly how many tokens you will spend.

### Step 3: Save it instead of printing it

~~~bash
npx contextpack-cli . -o context.md
~~~

The file is written to your current directory. Open it, skim the Contents list, and paste it into ChatGPT, Claude, Gemini or your coding agent. Add your question after the pasted document.

### Step 4: Inspect the candidate list before packing

~~~bash
npx contextpack-cli . --list
~~~

This prints every candidate file with its token cost, line count and whether it was included. It is the fastest way to answer "why was my file left out?" or "why is this huge file in here?".

### Step 5: Set a budget that matches your model

~~~bash
# A small, focused prompt
npx contextpack-cli . --budget 4000 -o context.md

# Model-sized presets
npx contextpack-cli . --profile 32k -o context.md

# No limit (careful: this can be very large)
npx contextpack-cli . --budget 0 -o context.md
~~~

Presets are 8k, 32k, 128k and 200k. The default is 8000. Files are added until the budget is full; low-priority files are dropped rather than truncated mid-function. One file is always included even if it alone exceeds the budget, so you never get an empty result.

Token counts are **local estimates** from a character and punctuation heuristic, roughly plus or minus 15 percent versus a real tokenizer. They never call an API.

### Step 6: Tell it what matters

~~~bash
# Prioritize a directory
npx contextpack-cli . --focus 'src/**' -o context.md

# Several focus patterns
npx contextpack-cli . --focus 'src/api/**' --focus 'lib/auth/**' -o context.md

# Only Python files, nothing else
npx contextpack-cli . --include '*.py' -o context.md

# Skip generated files
npx contextpack-cli . --exclude 'generated/**' -o context.md
~~~

Glob rules: patterns without a slash match at any depth, so *.py behaves like a gitignore pattern. Patterns with a slash are anchored to the repository root. Asterisks, double asterisks, question marks and character classes are supported.

There is also a task-aware ranking option (available from version 0.1.5):

~~~bash
npx contextpack-cli . --task "fix auth token refresh" -o context.md
~~~

It boosts files whose path or contents mention the keywords.

### Step 7: Pack only your changes

This is the most useful mode for code-review prompts.

~~~bash
# Changed files compared with HEAD (the default)
npx contextpack-cli . --diff -o changed.md

# Changed files compared with a branch
npx contextpack-cli . --diff main --focus 'src/**' -o pr-context.md

# Inline ref form
npx contextpack-cli . --diff=main -o pr-context.md
~~~

"Changed" includes modified, staged and untracked text files. The output header switches to Mode: diff. This option requires a git repository; it will fail clearly if you run it outside one.

### Step 8: Choose an output format

~~~bash
# Default: Markdown with headings and fenced code blocks
npx contextpack-cli . --format markdown -o context.md

# Plain text, one section per file
npx contextpack-cli . --format plain -o context.txt

# Machine-readable JSON for your own tooling
npx contextpack-cli . --format json -o context.json
~~~

JSON includes meta, files (path, tokens, lines, content) and omitted (path, tokens).

### Step 9: Check secret redaction

Redaction is on by default. It masks key-value secrets such as API_KEY values, provider tokens, GitHub tokens, AWS keys, bearer tokens, JWTs and private key blocks.

~~~bash
# Only for repositories you know are clean
npx contextpack-cli . --no-redact -o context.md
~~~

This is a safety net, not a guarantee. Always review the output before sharing it with any external service.

### Step 10: Make output reproducible

~~~bash
npx contextpack-cli . --no-date -o context.md
~~~

This removes the timestamp so two runs on unchanged code produce identical files, which is useful for diffs and tests.

### Step 11: Use it from JavaScript

~~~bash
npm install contextpack-cli
~~~

~~~js
import { buildContext, DEFAULT_BUDGET } from 'contextpack';
import { formatMarkdown } from 'contextpack/cli';

const ctx = buildContext('.', {
  budget: DEFAULT_BUDGET,
  focus: ['src/**'],
  diff: 'main',
});
console.log(formatMarkdown(ctx));
~~~

buildContext returns plain data, so you can pass it to your own formatter or agent.

---

## Command reference

| Option | Meaning |
| --- | --- |
| path (positional) | Directory to pack. Defaults to the current directory. |
| -o, --out FILE | Write to a file instead of stdout. |
| -b, --budget N | Token budget. 0 means unlimited. Default 8000. |
| --profile NAME | Preset budget: 8k, 32k, 128k or 200k. |
| --task TEXT | Boost files relevant to a task (0.1.5+). |
| -f, --focus GLOB | Prioritize matching files. Repeatable. |
| -i, --include GLOB | Only consider matching files. Repeatable. |
| -e, --exclude GLOB | Skip matching files. Repeatable. |
| --diff [REF] | Pack only changed files. Defaults to HEAD. Accepts --diff=REF. |
| --format FMT | markdown, plain or json. Default markdown. |
| --list | List candidate files and token costs instead of packing. |
| --max-lines N | Truncate files longer than N lines. Default 2000. |
| --no-gitignore | Ignore .gitignore and .ignore rules. |
| --no-redact | Disable secret redaction. |
| --no-date | Omit the timestamp for reproducible output. |
| -v, --version | Print the version. |
| -h, --help | Print help. |

---

## How files are selected

Files are scored, sorted by score and then by size, and added until the budget is full.

1. Changed files from --diff and --focus matches get the highest priority.
2. Source code ranks above documentation, then configuration, then everything else.
3. Root-level README.md, AGENTS.md, CLAUDE.md, package.json, Dockerfile, Makefile and similar files get a bonus.
4. Test, fixture and snapshot files rank slightly lower.
5. Shallower files rank above deeply nested ones; smaller files win ties.
6. With --task, keyword matches in path or contents add up to 1500 points.

Automatically skipped: .git, node_modules, dist, build, coverage, .next, virtualenvs, lockfiles, binary files, images, archives and anything matched by .gitignore or .ignore, including nested ignore files. Hidden files are skipped except .env.example and .env.sample. Files larger than 512 KB and more than 3000 candidate files are also excluded.

---

## Recipes

~~~bash
# Whole repo, ready to paste
npx contextpack-cli . -o context.md

# Only what changed in this branch, for a review prompt
npx contextpack-cli . --diff main --focus 'src/**' -o pr-context.md

# Only Python source, hard budget
npx contextpack-cli ./src --include '*.py' --budget 4000 -o context.md

# See what would be included before committing
npx contextpack-cli . --list

# Machine-readable output
npx contextpack-cli . --format json -o context.json

# Reproducible, no timestamp
npx contextpack-cli . --no-date -o context.md
~~~

---

## Troubleshooting

**contextpack: Not a directory** — the path argument must point to an existing directory, not a file.

**--diff needs a git repository** — run the command inside a git repository, or drop --diff.

**git diff failed for ref X** — the ref does not exist. Check the branch or commit name, for example with git branch -a.

**No changed text files found** — --diff only includes text files that are modified, staged or untracked. Commit or stage something first, or use a full pack.

**Everything is included but the file is huge** — use --budget or --profile, and check --list to see which big files are winning.

**A secret was still included** — redaction is pattern-based. Review the output and remove anything sensitive manually before sharing.

**My token count differs from the model** — estimates are local and approximate. Leave headroom for the answer, especially with small budgets.

---

## How it compares

repomix is the mature general-purpose tool: exact tokenizer counts, compression, MCP, remote repos and many output styles. Use it when you want the whole repository.

contextpack is deliberately narrower:

| | contextpack | repomix |
| --- | --- | --- |
| Runtime dependencies | none | several |
| Fits output to a token budget | yes, omits low-priority files | guard only, fails if over budget |
| Only changed files | yes, --diff | adds diffs to the full tree |
| File relevance ranking | yes | sorts by git change frequency |
| Exact tokenizer counts | no, local estimate | yes, tiktoken |
| Output styles | Markdown, plain, JSON | XML, Markdown, JSON, plain and more |
| Setup | npx contextpack-cli . | npx repomix |

gitingest and code2prompt are also good options if you prefer their ecosystems or templating.

---

## Roadmap

- [x] Profile presets for common models
- [x] Deterministic generation mode
- [x] .ignore file support
- [ ] Exact local tokenizer adapters
- [ ] Git-aware relevance scoring from commit history
- [ ] Clipboard output

Ideas and pull requests are welcome. Open an issue first for anything large.

---

## Contributing and license

See CONTRIBUTING.md for setup and ground rules. MIT licensed — see LICENSE.

If this saved you time, a star helps other developers find it.
