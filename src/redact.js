/**
 * Best-effort secret scrubbing before content leaves the machine. This is a
 * safety net, not a guarantee: review the output before sharing it.
 */

const KEY_VALUE = /\b((?:api[_-]?key|apikey|secret|token|password|passwd|private[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*["'`]?)([^\s"'`,;#]+)/gi;
const PROVIDER_KEYS = /\b(?:sk-(?:proj-)?|rk-|pk_live_|sk_live_|xox[baprs]-|AIza)[A-Za-z0-9_-]{12,}\b/g;
const GITHUB_TOKEN = /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g;
const AWS_KEY = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;
const BEARER = /\b(Bearer\s+)([A-Za-z0-9._~-]{12,})\b/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export function redactSecrets(text, enabled = true) {
  if (!enabled || !text) return text;

  return String(text)
    .replace(KEY_VALUE, (_match, prefix, value) => `${prefix}[REDACTED]`)
    .replace(PROVIDER_KEYS, '[REDACTED]')
    .replace(GITHUB_TOKEN, '[REDACTED]')
    .replace(AWS_KEY, '[REDACTED]')
    .replace(BEARER, (_match, prefix) => `${prefix}[REDACTED]`)
    .replace(JWT, '[REDACTED]')
    .replace(PRIVATE_KEY, '[REDACTED PRIVATE KEY]');
}
