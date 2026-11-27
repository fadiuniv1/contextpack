# Changelog

All notable changes to this project are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `--ask` text now counts toward the reserved budget, so a long question cannot push the generated prompt past its token budget.
- `--diff` now resolves aliases and symlinks in the repository path and supports subdirectory roots when computing which files changed.

## [0.2.0] - 2026-11-27

### Added

- Headroom by default: 12% of the budget (max 4000 tokens) is reserved for the question and the answer. Configure with \`--reserve\` or disable with \`--no-reserve\`.
- Per-file token cap (25% of the usable budget) with dependency-free structural outlines for oversized files. Configure with \`--max-file-tokens\`, disable outlines with \`--no-outline\`.
- \`--ask TEXT\` appends a ready-to-paste Question section to the output.
- JSON output now records \`outlined\`, \`originalTokens\` and the reason each file was omitted.
- Markdown header reports reserved tokens, outlines and omission reasons.

### Changed

- The CLI summary now reports used, reserved and outlined tokens instead of a bare token count.

## [0.1.5] - 2026-11-27

### Added

- `--task` keyword-aware ranking to prioritize files relevant to a specific task.

### Changed

- README rewritten as a step-by-step tutorial with a full option reference, recipes and troubleshooting.
- CONTRIBUTING updated to require documentation changes alongside behavior changes.

## [0.1.4] - 2026-11-26

### Added

- `--profile` presets for 8k / 32k / 128k / 200k budgets.
- `--no-date` for reproducible output.
- ASCII directory tree of selected files in Markdown and JSON output.
- Support for `.ignore` files alongside `.gitignore`.

### Changed

- npm package is published as `contextpack-cli`; the command remains `contextpack`.

### Fixed

- `--diff=<ref>` now uses the inline ref instead of falling back to `HEAD`.

## [0.1.0] - 2026-11-26

### Added

- First release.
- Repository walking with nested `.gitignore` support.
- Token-budgeted file selection with relevance ranking and `--focus`.
- `--diff` mode for changed and untracked files.
- `--include`, `--exclude`, `--list`, `--max-lines` and `--no-gitignore`.
- Markdown, plain text and JSON output formats.
- Secret redaction for common key formats and private key blocks.
- Zero runtime dependencies and a Node.js test suite.
