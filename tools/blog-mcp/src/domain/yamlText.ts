/** Quotes a scalar only when it contains characters that would otherwise change YAML's parse, matching the minimal-quoting style already used throughout docs/blog/tags.yml and docs/blog/authors.yml. */
export function escapeYamlScalar(value: string): string {
  if (/^[a-zA-Z0-9 .,'()-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `new-topic` -> `New Topic`; the deterministic minimal label/name generated for an auto-created tag or author when the caller supplies only a key. */
export function titleCaseKey(key: string): string {
  return key
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}
