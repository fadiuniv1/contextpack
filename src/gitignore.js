import { compileGlob, toPosix } from './glob.js';

/**
 * Parse a .gitignore file into ordered rules. Last matching rule wins, which
 * is what makes `!keep-me` re-include files ignored by an earlier pattern.
 */
export function parseIgnoreFile(text, base = '') {
  const rules = [];
  const normalizedBase = toPosix(base).replace(/^\/+|\/+$/g, '');

  for (const rawLine of String(text).split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    let negated = false;
    if (line.startsWith('!')) {
      negated = true;
      line = line.slice(1);
    } else if (line.startsWith('\\#') || line.startsWith('\\!')) {
      line = line.slice(1);
    }

    const anchored = line.startsWith('/');
    if (anchored) line = line.slice(1);

    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    if (!line) continue;

    const pattern = normalizedBase ? `${normalizedBase}/${line}` : line;
    const compiled = compileGlob(pattern, { forceAnchored: anchored });

    rules.push({
      pattern,
      negated,
      dirOnly: dirOnly || compiled.dirOnly,
      regex: compiled.regex,
    });
  }

  return rules;
}

export function isIgnored(relPath, isDir, rules = []) {
  const target = toPosix(relPath);
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.regex.test(target)) ignored = !rule.negated;
  }
  return ignored;
}
