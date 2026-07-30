import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../result.js';
import type { BlogConfig } from '../config.js';
import { parseMarkdown, type PostFrontMatter } from './frontmatter.js';
import { loadAuthors } from './authors.js';
import { loadTags, checkTagsYmlIntegrity, tagsYmlPath } from './tags.js';
import { readHubEntries } from './hubs.js';
import { git } from '../exec/git.js';

const REQUIRED_FIELDS = ['title', 'description', 'slug', 'authors', 'date', 'tags'] as const;
const FILENAME_PATTERN = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DATE_PATTERN_NO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const TEMPLATE_PLACEHOLDERS = ['replace-with-a-key-from-tags-yml', 'post-slug', 'YYYY-MM-DD', 'Clear, specific title'];

export function listPostFiles(repoRoot: string, blogDir: string): string[] {
  const dir = path.join(repoRoot, blogDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
    .map((name) => path.join(dir, name))
    .sort();
}

export interface LoadedPost {
  absolutePath: string;
  relativePath: string;
  filename: string;
  content: string;
  frontMatter: Record<string, unknown> | null;
  frontMatterPresent: boolean;
  body: string;
}

export function loadPost(repoRoot: string, absolutePath: string): LoadedPost {
  const content = fs.readFileSync(absolutePath, 'utf8');
  const parsed = parseMarkdown(content);
  return {
    absolutePath,
    relativePath: path.relative(repoRoot, absolutePath).split(path.sep).join('/'),
    filename: path.basename(absolutePath),
    content,
    frontMatter: parsed.frontMatter,
    frontMatterPresent: parsed.frontMatterPresent,
    body: parsed.body
  };
}

function fieldAsString(fm: Record<string, unknown>, key: string): string | undefined {
  const value = fm[key];
  return typeof value === 'string' ? value : undefined;
}

function fieldAsStringArray(fm: Record<string, unknown>, key: string): string[] | undefined {
  const value = fm[key];
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === 'string')) return undefined;
  return value as string[];
}

export interface ValidatePostOptions {
  allowSlugChange?: boolean;
}

/** Validates one already-loaded post against every single-file rule. Cross-post rules (SlugUnique) run separately in validateAllPosts. */
export async function validatePost(
  repoRoot: string,
  post: LoadedPost,
  knownAuthorKeys: Set<string>,
  knownTagKeys: Set<string>,
  options: ValidatePostOptions = {}
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const push = (rule: string, severity: 'error' | 'warning', message: string, line?: number) =>
    findings.push({ path: post.relativePath, ...(line !== undefined ? { line } : {}), severity, rule, message });

  const filenameMatch = FILENAME_PATTERN.exec(post.filename);
  if (!filenameMatch) {
    push('Filename', 'error', `Filename must match YYYY-MM-DD-slug.md, got '${post.filename}'.`);
  }

  if (!post.frontMatterPresent || post.frontMatter === null) {
    push('FrontMatterFields', 'error', 'Front matter fences (--- ... ---) were missing or the YAML inside failed to parse.');
    return findings;
  }

  const fm = post.frontMatter;
  const missing = REQUIRED_FIELDS.filter((field) => !(field in fm));
  if (missing.length > 0) {
    push('FrontMatterFields', 'error', `Missing required front matter field(s): ${missing.join(', ')}.`);
  }
  for (const key of Object.keys(fm)) {
    if (!(REQUIRED_FIELDS as readonly string[]).includes(key)) {
      push('FrontMatterFields', 'warning', `Unrecognized front matter field '${key}'.`);
    }
  }

  const title = fieldAsString(fm, 'title');
  if (title !== undefined && title.trim() === '') push('FrontMatterFields', 'error', "'title' must not be empty.");
  const description = fieldAsString(fm, 'description');
  if (description !== undefined && description.trim() === '') push('FrontMatterFields', 'error', "'description' must not be empty.");

  const slug = fieldAsString(fm, 'slug');
  if (slug !== undefined) {
    if (!SLUG_PATTERN.test(slug)) {
      push('Slug', 'error', `Slug '${slug}' must be lowercase kebab-case with no slashes.`);
    }
    if (filenameMatch && filenameMatch[2] !== slug) {
      push('SlugMatchesFilename', 'warning', `Slug '${slug}' does not match the filename's slug portion '${filenameMatch[2]}'.`);
    }
    if (filenameMatch?.[1] && dateHasMismatch(fm, filenameMatch[1])) {
      push('DateMatchesFilename', 'error', `Front matter date does not start with the filename's date prefix '${filenameMatch[1]}'.`);
    }

    const headSlug = await previousHeadSlug(repoRoot, post.relativePath);
    if (headSlug !== undefined && headSlug !== slug && !options.allowSlugChange) {
      push(
        'SlugImmutable',
        'error',
        `Slug changed from '${headSlug}' to '${slug}'. Slugs are permanent public routes; pass allowSlugChange to override.`
      );
    }
  }

  const date = fieldAsString(fm, 'date');
  if (date !== undefined) {
    if (DATE_PATTERN_Z.test(date)) {
      // matches every real post in the repo
    } else if (DATE_PATTERN_NO_Z.test(date)) {
      push('DateNoZ', 'warning', `Date '${date}' is missing the explicit UTC 'Z' suffix every published post uses.`);
    } else {
      push('Date', 'error', `Date '${date}' must match YYYY-MM-DDTHH:MM:SSZ.`);
    }
  }

  const authors = fieldAsStringArray(fm, 'authors');
  if (authors === undefined || authors.length === 0) {
    push('Authors', 'error', "'authors' must be a non-empty list.");
  } else {
    for (const author of authors) {
      if (!knownAuthorKeys.has(author)) {
        push('Authors', 'error', `Unknown author key '${author}'; not declared in docs/blog/authors.yml.`);
      }
    }
  }

  const tags = fieldAsStringArray(fm, 'tags');
  if (tags === undefined || tags.length === 0) {
    push('Tags', 'error', "'tags' must be a non-empty list.");
  } else {
    for (const tag of tags) {
      if (!knownTagKeys.has(tag)) {
        push('Tags', 'error', `Unknown tag key '${tag}'; not declared in docs/blog/tags.yml. The production build rejects it.`);
      }
    }
  }

  const truncateCount = (post.body.match(/<!-- truncate -->/g) ?? []).length;
  if (truncateCount === 0) {
    push('TruncateMarker', 'error', 'Missing the <!-- truncate --> marker.');
  } else if (truncateCount > 1) {
    push('TruncateMarker', 'error', `Found ${truncateCount} <!-- truncate --> markers; exactly one is required.`);
  } else {
    const bodyLines = post.body.split(/\r?\n/);
    const markerLineIndex = bodyLines.findIndex((line) => line.includes('<!-- truncate -->'));
    if (markerLineIndex !== -1 && bodyLines[markerLineIndex]?.trim() !== '<!-- truncate -->') {
      push('TruncateMarker', 'error', 'The <!-- truncate --> marker must be on its own line.', markerLineIndex + 1);
    }
  }

  // Scoped to the excerpt (before <!-- truncate -->), not the whole body: a
  // stray H1 only breaks rendering where it escapes .blog-post-page's H1
  // theming, which is the list/tag excerpt card -- exactly what PR #30
  // fixed. Headings after the marker (docs/blog/2026-07-30-lucifer-chronicles.md
  // has 10 of them, as section dividers) are themed normally on the full
  // post page and never appear in an excerpt.
  const truncateIndex = post.body.indexOf('<!-- truncate -->');
  const excerpt = truncateIndex === -1 ? post.body : post.body.slice(0, truncateIndex);
  const h1Count = (excerpt.match(/^# .+$/gm) ?? []).length;
  if (h1Count > 1) {
    push(
      'SingleH1',
      'error',
      `Found ${h1Count} top-level '# ' heading(s) before the <!-- truncate --> marker; an un-themed H1 in the excerpt renders oversized on list/tag pages (see PR #30).`
    );
  }

  for (const placeholder of TEMPLATE_PLACEHOLDERS) {
    if (post.content.includes(placeholder)) {
      push('TemplatePlaceholder', 'error', `Body still contains the template placeholder '${placeholder}'.`);
    }
  }

  if (post.content.includes('\r')) {
    push('LineEndings', 'warning', 'File contains CRLF line endings; this repo uses LF (.gitattributes: * text=auto eol=lf).');
  }
  if (post.content.length > 0 && !post.content.endsWith('\n')) {
    push('LineEndings', 'warning', 'File does not end with a trailing newline.');
  }

  return findings;
}

function dateHasMismatch(fm: Record<string, unknown>, filenameDatePrefix: string): boolean {
  const date = fieldAsString(fm, 'date');
  if (!date) return false;
  return !date.startsWith(filenameDatePrefix);
}

async function previousHeadSlug(repoRoot: string, relativePath: string): Promise<string | undefined> {
  const result = await git(['show', `HEAD:${relativePath}`], { repoRoot });
  if (result.exitCode !== 0) return undefined; // new file, not yet committed
  const parsed = parseMarkdown(result.stdout);
  const slug = parsed.frontMatter?.slug;
  return typeof slug === 'string' ? slug : undefined;
}

export interface ValidateAllPostsOptions extends ValidatePostOptions {
  /** Restrict validation to these absolute paths; defaults to every post in blogDir. */
  paths?: string[];
}

export async function validateAllPosts(repoRoot: string, config: BlogConfig, options: ValidateAllPostsOptions = {}): Promise<Finding[]> {
  const findings: Finding[] = [];

  const authorKeys = new Set(loadAuthors(repoRoot, config.blogDir).map((a) => a.key));
  const tagKeys = new Set(loadTags(repoRoot, config.blogDir).map((t) => t.key));

  const tagsPath = tagsYmlPath(repoRoot, config.blogDir);
  if (fs.existsSync(tagsPath)) {
    const tagsRelative = path.relative(repoRoot, tagsPath).split(path.sep).join('/');
    findings.push(...checkTagsYmlIntegrity(fs.readFileSync(tagsPath, 'utf8'), tagsRelative));
  }

  const targetPaths = options.paths ?? listPostFiles(repoRoot, config.blogDir);
  const posts = targetPaths.map((p) => loadPost(repoRoot, p));

  const slugToFiles = new Map<string, string[]>();
  for (const post of posts) {
    findings.push(...(await validatePost(repoRoot, post, authorKeys, tagKeys, options)));
    const slug = typeof post.frontMatter?.slug === 'string' ? post.frontMatter.slug : undefined;
    if (slug) {
      const existing = slugToFiles.get(slug) ?? [];
      existing.push(post.relativePath);
      slugToFiles.set(slug, existing);
    }
  }

  for (const [slug, files] of slugToFiles) {
    if (files.length > 1) {
      for (const file of files) {
        findings.push({
          path: file,
          severity: 'error',
          rule: 'SlugUnique',
          message: `Slug '${slug}' is used by ${files.length} posts: ${files.join(', ')}.`
        });
      }
    }
  }

  return findings;
}

// ---- Hub validation -------------------------------------------------------

export interface HubValidationContext {
  slug: string;
  tags: string[];
}

export function validateHubs(repoRoot: string, config: BlogConfig, posts: HubValidationContext[]): Finding[] {
  const findings: Finding[] = [];
  const knownRoutes = new Set<string>([
    '/archive/',
    '/tags/',
    '/docs/',
    '/projects/game-engine/',
    '/series/lucifer-chronicles/',
    '/series/ai-assisted-engineering/',
    '/series/state-of-dev/'
  ]);
  for (const post of posts) knownRoutes.add(`/${post.slug}/`);

  for (const hub of config.hubs) {
    const hubPath = path.join(repoRoot, hub.path);
    const hubRelative = path.relative(repoRoot, hubPath).split(path.sep).join('/');

    if (!fs.existsSync(hubPath)) {
      findings.push({ path: hubRelative, severity: 'error', rule: 'HubRequiredRoutes', message: `Hub file '${hub.path}' does not exist.` });
      continue;
    }

    const sourceText = fs.readFileSync(hubPath, 'utf8');
    let entries;
    try {
      entries = readHubEntries(sourceText, hubPath);
    } catch (err) {
      findings.push({
        path: hubRelative,
        severity: 'error',
        rule: 'HubRequiredRoutes',
        message: err instanceof Error ? err.message : String(err)
      });
      continue;
    }

    const seenHref = new Set<string>();
    for (const entry of entries) {
      if (seenHref.has(entry.href)) {
        findings.push({ path: hubRelative, severity: 'error', rule: 'HubDuplicateHref', message: `Duplicate href '${entry.href}' in ${hub.id}.` });
      }
      seenHref.add(entry.href);

      if (!knownRoutes.has(entry.href)) {
        findings.push({
          path: hubRelative,
          severity: 'error',
          rule: 'HubHrefResolves',
          message: `href '${entry.href}' in ${hub.id} does not match any known post slug or site route.`
        });
      }
    }

    const coveredSlugs = new Set(entries.map((e) => e.href.replace(/^\/|\/$/g, '')));
    for (const post of posts) {
      const matches =
        (hub.match.tags && hub.match.tags.some((tag) => post.tags.includes(tag))) ||
        (hub.match.slugPrefix !== undefined && post.slug.startsWith(hub.match.slugPrefix));
      if (matches && !coveredSlugs.has(post.slug)) {
        findings.push({
          path: hubRelative,
          severity: 'warning',
          rule: 'HubCoverage',
          message: `Post '${post.slug}' matches ${hub.id}'s inclusion rule but is not listed on the hub.`
        });
      }
    }
  }

  return findings;
}
