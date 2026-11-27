<div align="center">

# contextpack

**Pack a repository into a token-budgeted Markdown file you can paste into any LLM or coding agent.**

[![npm](https://img.shields.io/npm/v/contextpack-cli?style=for-the-badge)](https://www.npmjs.com/package/contextpack-cli)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

</div>

No API keys. No uploads. No runtime dependencies. One command.

Filling a context window to the last token produces a prompt the model cannot answer. contextpack reserves headroom, caps oversized files, and shows their structure instead of silently dropping them.

---

## Contents

- [Why contextpack](#why-contextpack)
- [Quick start](#quick-start)
- [Tutorial: from zero to a ready-to-paste context file](#tutorial-from-zero-to-a-ready-to-paste-context-file)
- [Headroom, file caps and outlines](#headroom-file-caps-and-outlines)
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
- burning the context window on lockfiles, build output and dependencies,
- accidentally including an .env file with real secrets,
- redoing all of it every time the code changes.

contextpack does that work locally. It walks the tree, respects .gitignore, ranks files by usefulness, redacts common secrets, reserves space for your question and the answer, and emits one Markdown document sized to your token budget.

---

## Quick start

Requirements: **Node.js 18+**. Nothing else. Git is only needed for the --diff option.

~~~bash
# Run it without installing anything
npx contextpack-cli .

# Write a ready-to-paste file, with your question included
npx contextpack-cli . --budget 8000 --ask "Where is the bug?" -o context.md
~~~

The npm package is named **contextpack-cli** because the plain name was taken. The command you run is still **contextpack** if you install it globally:

~~~bash
npm install -g contextpack-cli
contextpack --version
contextpack .
~~~

### A verified run

Real terminal output on Windows (Node 18+):

~~~text
PS C:\Users\fadiu\OneDrive\Desktop\New folder> npx contextpack-cli . --budget 8000 -o context.md
Wrote context.md — 47 files, ~7,998 tokens
~~~

That was version 0.1.5: the file used the entire budget. Version 0.2.0 reports the same project like this:

~~~text
Wrote context.md — 18 files, ~7,033 tokens, 960 reserved, 5 outlines
~~~

The generated file now starts with:

~~~text
- Estimated tokens: 7,033 / 8,000
- Reserved: ~960 tokens for your question and the answer
- Files: 18 of 21 (5 as outlines) (3 omitted: 1 over per-file cap, 2 budget)
~~~

---

## Tutorial: from zero to a ready-to-paste context file

### Step 1: Check your Node version

~~~bash
node --version
~~~

You need v18 or newer. If the command is not found, install Node from nodejs.org.

### Step 2: Run it on a repository

~~~bash
cd /path/to/your/project
npx contextpack-cli .
~~~

The first run downloads the package once, then prints a document with a header, a directory tree of selected files, a contents list, and each file inside a fenced code block.

Read the header first. It tells you how many candidate files were found, how many made it in, how many are outlines, and roughly how many tokens you will spend.

### Step 3: Save it and add your question

~~~bash
npx contextpack-cli . -o context.md
npx contextpack-cli . --ask "Explain the auth flow and suggest a fix" -o context.md
~~~

With --ask, the generated file ends with a Question section. You can paste the whole file into ChatGPT, Claude, Gemini or a coding agent without typing your question again. The question's estimated tokens are counted in the reserve, which leaves room for the answer.

### Step 4: Inspect the candidate list before packing

~~~bash
npx contextpack-cli . --list
~~~

This prints every candidate file with its token cost, line count and status: yes, outline or no. It is the fastest way to answer "why was my file left out?".

### Step 5: Set a budget that matches your model

~~~bash
# A small, focused prompt
npx contextpack-cli . --budget 4000 -o context.md

# Model-sized presets
npx contextpack-cli . --profile 32k -o context.md

# No limit (careful: this can be very large)
npx contextpack-cli . --budget 0 -o context.md
~~~

Presets are 8k, 32k, 128k and 200k. The default is 8000. Files are added until the usable budget is full; low-priority files are dropped or outlined rather than truncating your important ones mid-function. One file is always included even if it alone exceeds the budget, so you never get an empty result.

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

# Boost files about a specific task
npx contextpack-cli . --task "fix auth token refresh" -o context.md
~~~

Glob rules: patterns without a slash match at any depth, so *.py behaves like a gitignore pattern. Patterns with a slash are anchored to the repository root. Asterisks, double asterisks, question marks and character classes are supported. --task keywords also influence which lines survive in an outline.

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
npx contextpack-cli . --format markdown -o context.md
npx contextpack-cli . --format plain -o context.txt
npx contextpack-cli . --format json -o context.json
~~~

Markdown is the default and includes headings, fenced code blocks and the question section. Plain text uses one section per file. JSON includes meta, files (path, tokens, lines, content, outlined, originalTokens) and omitted files with a reason.

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
import { buildContext } from 'contextpack';
import { formatMarkdown } from 'contextpack/cli';

const ctx = buildContext('.', {
  budget: 8000,
  focus: ['src/**'],
  reserve: 960,
  maxFileTokens: 1760,
  ask: 'Where is the bug?',
});
console.log(formatMarkdown(ctx));
~~~

buildContext returns plain data, so you can pass it to your own formatter or agent.

---

## Headroom, file caps and outlines

### Headroom

By default, 12% of the budget (up to 4000 tokens) is left unused for your question and the model's answer. For an 8k budget that is 960 tokens. This is deliberate: a prompt that consumes the entire window gives the model nowhere to think. When `--ask` is used, its estimated tokens are added to the reserved amount, so the pasted question does not eat into the space left for the answer.

~~~bash
npx contextpack-cli . --reserve 2000 -o context.md
npx contextpack-cli . --no-reserve -o context.md
~~~

### Per-file cap

A single huge file can otherwise swallow the entire budget. By default, no file may use more than 25% of the usable budget. Files above the cap are not dropped outright — they are replaced by a structural outline containing imports, definitions, headings, task-relevant lines and a clear marker.

~~~bash
npx contextpack-cli . --max-file-tokens 500 -o context.md
npx contextpack-cli . --max-file-tokens 0 -o context.md
npx contextpack-cli . --no-outline -o context.md
~~~

Setting the cap to 0 disables it. --no-outline skips oversized files instead of outlining them. Outlines are an approximation, not a lossless compression: when an outline is shown, the output says so and tells you how to get the full file.

### Why this combination works

This follows the same idea as aider's repository map: give the model a compact structural view first, then let it ask for the files it needs. Headroom, caps and outlines together mean the generated document is a usable prompt rather than a full window of raw text.

---

## Command reference

| Option | Meaning |
| --- | --- |
| path (positional) | Directory to pack. Defaults to the current directory. |
| -o, --out FILE | Write to a file instead of stdout. |
| -b, --budget N | Token budget. 0 means unlimited. Default 8000. |
| --reserve N | Tokens left for the question and answer. Default 12%, max 4000. |
| --no-reserve | Use the whole budget for files (not recommended). |
| --max-file-tokens N | Cap each file. 0 disables the cap. Default 25% of usable budget. |
| --no-outline | Skip oversized files instead of showing an outline. |
| --ask TEXT | Append a ready-to-paste Question section. Its estimated tokens are included in the reserved budget. |
| --profile NAME | Preset budget: 8k, 32k, 128k or 200k. |
| --task TEXT | Boost files and outline lines relevant to a task. |
| -f, --focus GLOB | Prioritize matching files. Repeatable. |
| -i, --include GLOB | Only consider matching files. Repeatable. |
| -e, --exclude GLOB | Skip matching files. Repeatable. |
| --diff [REF] | Pack only changed files. Defaults to HEAD. Accepts --diff=REF. |
| --format FMT | markdown, plain or json. Default markdown. |
| --list | List candidates with token costs and status instead of packing. |
| --max-lines N | Truncate files longer than N lines. Default 2000. |
| --no-gitignore | Ignore .gitignore and .ignore rules. |
| --no-redact | Disable secret redaction. |
| --no-date | Omit the timestamp for reproducible output. |
| -v, --version | Print the version. |
| -h, --help | Print help. |

---

## How files are selected

Files are scored, sorted by score and then by size, and processed in that order.

1. Changed files from --diff and --focus matches get the highest priority.
2. Source code ranks above documentation, then configuration, then everything else.
3. Root-level README.md, AGENTS.md, CLAUDE.md, package.json, Dockerfile, Makefile and similar files get a bonus.
4. Test, fixture and snapshot files rank slightly lower.
5. Shallower files rank above deeply nested ones; smaller files win ties.
6. --task keyword matches add up to 1500 points and influence outline line selection.

Each file then follows this path:

- If it fits the remaining usable budget and the per-file cap, include it in full.
- If it is too large but an outline fits, include the outline and mark it as such.
- Otherwise omit it and record the reason: "over per-file cap" or "budget".

Automatically skipped: .git, node_modules, dist, build, coverage, .next, virtualenvs, lockfiles, binary files, images, archives and anything matched by .gitignore or .ignore, including nested ignore files. Hidden files are skipped except .env.example and .env.sample. Files larger than 512 KB and more than 3000 candidate files are also excluded.

---

## Recipes

~~~bash
# Whole repo, ready to paste, with headroom
npx contextpack-cli . -o context.md

# Ready-to-paste prompt with a question
npx contextpack-cli . --ask "Where is the bug?" -o context.md

# Only what changed in this branch, for a review prompt
npx contextpack-cli . --diff main --focus 'src/**' -o pr-context.md

# Only Python source, hard budget, no outlines
npx contextpack-cli ./src --include '*.py' --budget 4000 --no-outline -o context.md

# Full files, no cap, no reserve
npx contextpack-cli . --max-file-tokens 0 --no-reserve -o context.md

# See what would be included before committing
npx contextpack-cli . --list

# Machine-readable output with omission reasons
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

**My file became an outline** — it exceeded the per-file cap. Use --max-file-tokens 0 to include full files, or --focus that file so it ranks higher.

**Almost everything is omitted** — lower the reserve with --reserve, raise the budget, or use --include to narrow the candidate set.

**A secret was still included** — redaction is pattern-based. Review the output and remove anything sensitive manually before sharing.

**My token count differs from the model** — estimates are local and approximate. The default reserve absorbs most of that error, but leave headroom for long answers.

---

## How it compares

repomix is the mature general-purpose tool: exact tokenizer counts, compression, MCP, remote repos and many output styles. Use it when you want the whole repository.

contextpack is deliberately narrower:

| | contextpack | repomix |
| --- | --- | --- |
| Runtime dependencies | none | several |
| Reserves output headroom | yes, configurable | no |
| Fits output to a token budget | yes, omits or outlines low-priority files | guard only, fails if over budget |
| Only changed files | yes, --diff | adds diffs to the full tree |
| File relevance ranking | yes, plus task keywords | sorts by git change frequency |
| Structural outlines | yes, dependency-free | compression available |
| Exact tokenizer counts | no, local estimate | yes, tiktoken |
| Output styles | Markdown, plain, JSON | XML, Markdown, JSON, plain and more |
| Setup | npx contextpack-cli . | npx repomix |

gitingest and code2prompt are also good options if you prefer their ecosystems or templating.

---

## Roadmap

- [x] Profile presets for common models
- [x] Deterministic generation mode
- [x] .ignore file support
- [x] Task-aware ranking and outlines
- [ ] Exact local tokenizer adapters
- [ ] Git-aware relevance scoring from commit history
- [ ] Clipboard output

Ideas and pull requests are welcome. Open an issue first for anything large.

---

## Contributing and license

See CONTRIBUTING.md for setup and ground rules. MIT licensed — see LICENSE.

If this saved you time, a star helps other developers find it.
