# Contributing

Thanks for helping improve contextpack.

## Setup

```bash
git clone https://github.com/fadiuniv1/contextpack.git
cd contextpack
npm test
```

Node 18+ is required. There are no runtime dependencies and no build step.

## Ground rules

- **Keep it dependency-free.** That is a core feature.
- **Add a test for every behavior change.** `npm test` must pass on Windows, macOS and Linux.
- **Never upload user code.** Network calls are not acceptable in the core.
- **Do not weaken secret redaction** without a clear reason and a test.
- **Keep the documentation honest.** If a flag changes, update the README tutorial and the option table.

## Documentation

The README is the main product surface. It contains a full tutorial, recipes and troubleshooting, so treat it as part of the code:

- new or changed flags belong in the **Command reference** table,
- new failure modes belong in **Troubleshooting**,
- new use cases belong in **Recipes**,
- notable changes belong in `CHANGELOG.md`.

Avoid claiming exact tokenizer counts or guaranteed secret removal. Token counts are local estimates and redaction is a best-effort safety net.

## Commit messages

Use short, imperative messages: `Add clipboard output`, `Fix nested gitignore negation`.

## Pull requests

1. Open an issue first for larger changes so we can agree on scope.
2. Keep PRs focused on one thing.
3. Update `README.md` and `CHANGELOG.md` when behavior changes.
4. Explain how you tested it, including the OS and Node version.

## Reporting bugs

Please include your OS, Node version, the exact command you ran, the expected result and the actual result. If the bug involves a specific repository shape (e.g. nested gitignore files), include a minimal reproduction.

By contributing you agree that your contributions will be licensed under the MIT License.
