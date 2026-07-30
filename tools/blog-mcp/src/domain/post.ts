export function buildFilename(dateIso: string, slug: string): string {
  const day = dateIso.slice(0, 10);
  return `${day}-${slug}.md`;
}

export function canonicalUrl(canonicalBase: string, slug: string): string {
  return `${canonicalBase.replace(/\/$/, '')}/${slug}/`;
}

/**
 * Inserts `<!-- truncate -->` after the first occurrence of `afterText` in
 * the body, as its own block (blank line either side). No-op if the marker
 * is already present anywhere in the body -- validation reports duplicates
 * or a missing marker rather than this function silently fixing either.
 */
export function insertTruncateMarker(body: string, afterText: string): string {
  if (body.includes('<!-- truncate -->')) return body;
  const idx = body.indexOf(afterText);
  if (idx === -1) return body;
  const insertAt = idx + afterText.length;
  const before = body.slice(0, insertAt).replace(/\s+$/, '');
  const after = body.slice(insertAt).replace(/^\s+/, '');
  return `${before}\n\n<!-- truncate -->\n\n${after}`;
}
