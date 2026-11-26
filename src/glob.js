/**
 * Tiny glob matcher. Supports *, **, ?, [abc], [!abc], trailing / for
 * directories and gitignore-style basename matching for patterns without a /.
 * No dependencies, so the package stays installable anywhere.
 */

const cache = new Map();

export function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

export function compileGlob(pattern, { forceAnchored = false } = {}) {
  const key = `${String(pattern)}\u0000${forceAnchored}`;
  if (cache.has(key)) return cache.get(key);

  let p = toPosix(pattern).replace(/^\/+/, '');
  const dirOnlyInput = p.endsWith('/');
  if (dirOnlyInput) p = p.slice(0, -1);

  const hasSlash = p.includes('/') || forceAnchored;
  let source = '';
  let i = 0;

  while (i < p.length) {
    const ch = p[i];

    if (ch === '*') {
      if (p[i + 1] === '*') {
        if (p[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 3;
        } else {
          source += '.*';
          i += 2;
        }
      } else {
        source += '[^/]*';
        i += 1;
      }
      continue;
    }

    if (ch === '?') {
      source += '[^/]';
      i += 1;
      continue;
    }

    if (ch === '[') {
      const close = p.indexOf(']', i + 1);
      if (close === -1) {
        source += '\\[';
        i += 1;
        continue;
      }
      let cls = p.slice(i + 1, close);
      if (cls.startsWith('!')) cls = `^${cls.slice(1)}`;
      source += `[${cls.replace(/\\/g, '\\\\')}]`;
      i = close + 1;
      continue;
    }

    source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }

  // "*.log" should match at any depth, like gitignore does.
  const prefix = !hasSlash && !p.startsWith('**') ? '(?:.*/)?' : '';
  let expression = `^${prefix}${source}`;
  if (dirOnlyInput) expression += '(?:/.*)?';
  expression += '$';

  const compiled = { regex: new RegExp(expression), dirOnly: dirOnlyInput, pattern: p };
  cache.set(key, compiled);
  return compiled;
}

export function matchesGlob(filePath, pattern) {
  return compileGlob(pattern).regex.test(toPosix(filePath));
}

export function matchesAny(filePath, patterns = []) {
  if (!patterns || patterns.length === 0) return false;
  const target = toPosix(filePath);
  return patterns.some((pattern) => compileGlob(pattern).regex.test(target));
}
