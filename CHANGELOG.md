# Changelog

All notable changes to this project are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
