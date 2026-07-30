import { parse as parseYaml } from 'yaml';

export interface ParsedMarkdown {
  /** Parsed YAML front matter, or null if the fences were missing or the YAML failed to parse. */
  frontMatter: Record<string, unknown> | null;
  /** True as soon as opening/closing `---` fences were found, regardless of whether the YAML inside parsed. */
  frontMatterPresent: boolean;
  /** Raw text between the fences, for diagnostics. */
  frontMatterRaw: string | null;
  body: string;
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') {
    return { frontMatter: null, frontMatterPresent: false, frontMatterRaw: null, body: content };
  }

  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) {
    return { frontMatter: null, frontMatterPresent: false, frontMatterRaw: null, body: content };
  }

  const raw = lines.slice(1, endIndex).join('\n');
  const body = lines.slice(endIndex + 1).join('\n');

  let frontMatter: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = parseYaml(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      frontMatter = parsed as Record<string, unknown>;
    }
  } catch {
    frontMatter = null;
  }

  return { frontMatter, frontMatterPresent: true, frontMatterRaw: raw, body };
}

export interface PostFrontMatter {
  title: string;
  description: string;
  slug: string;
  authors: string[];
  date: string;
  tags: string[];
}

function quoteYamlScalar(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function yamlListBlock(key: string, items: string[]): string {
  return [`${key}:`, ...items.map((item) => `  - ${item}`)].join('\n');
}

/**
 * Renders front matter in the exact shape every real post in this repo
 * uses: title/description double-quoted, slug/date bare, authors/tags as a
 * block list. Always produces valid, re-parseable YAML.
 */
export function serializeFrontMatter(fm: PostFrontMatter): string {
  const lines = [
    '---',
    `title: ${quoteYamlScalar(fm.title)}`,
    `description: ${quoteYamlScalar(fm.description)}`,
    `slug: ${fm.slug}`,
    yamlListBlock('authors', fm.authors),
    `date: ${fm.date}`,
    yamlListBlock('tags', fm.tags),
    '---'
  ];
  return lines.join('\n');
}

export function assemblePost(fm: PostFrontMatter, body: string): string {
  const trimmedBody = body.replace(/^\s+/, '').replace(/\s+$/, '');
  return `${serializeFrontMatter(fm)}\n\n${trimmedBody}\n`;
}
