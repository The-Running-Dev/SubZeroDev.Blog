import { useCallback, useEffect, useState } from 'react';
import type { ConsoleViewProps } from '@subzerodev-git/console';
import {
  ToolCallError,
  addAuthor,
  addTag,
  commit,
  createPost,
  enableAutoMerge,
  getPost,
  listAuthors,
  listPosts,
  listTags,
  openPullRequest,
  parseMarkdown,
  prepareBranch,
  push,
  stagePaths,
  updatePost,
  type AuthorRecord,
  type PostWriteResult,
  type TagRecord,
} from './lib/tool-api.ts';
import { isoToDatetimeLocal } from './lib/format-date.ts';
import { usePrWatcher } from './lib/use-pr-watcher.ts';

interface LogLine {
  text: string;
  isError: boolean;
}

const NO_TAG_VOCAB_MESSAGE =
  "Could not load a tag vocabulary -- falling back to a free-text tags field. A typo'd tag name will only be caught at publish time.";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Matches a leading markdown H1 ("# Heading", optionally with a blank line after it) at the very start of pasted content.
const LEADING_HEADING_RE = /^#[ \t]+(.+?)[ \t]*\n+([\s\S]*)$/;
const DATE_HEADING_RE = /^(?:[A-Za-z]+day,\s*)?[A-Za-z]+\s+\d{1,2},\s*\d{4}$/;

function extractLeadingHeading(markdown: string): { heading: string; rest: string } | null {
  const match = LEADING_HEADING_RE.exec(markdown.trimStart());
  if (!match) return null;
  return { heading: match[1] as string, rest: match[2] as string };
}

function titleCaseFromKey(key: string): string {
  return key
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Ported from `tools/blog-mcp/ui/src/views/ComposeView.tsx` (S37.1). Every
 * request carries `declarationId` (S37.3). The publish pipeline is
 * reassembled from the base's own separate tools -- there is no single
 * composite bundling branch->write->stage->commit->push->PR->auto-merge
 * (`production-declarations.ts`'s composites section covers only
 * `prepare_branch` and post-merge `reconcile_after_merge`) -- so
 * `handlePublish` below calls `prepare_branch`, `create_post`/`update_post`,
 * `git_stage`, `git_commit`, `git_push`, `pr_open` and, optionally,
 * `pr_enable_auto_merge` as six or seven separate dispatch calls, in the
 * same order blog-mcp's own `/api/*` sequence used.
 *
 * Dropped from the original: the `/compose/:slug` route prefill (no router
 * -- `ConsoleViewProps` carries only `declarationId`) and the cross-check
 * `headSha` on auto-merge (`pr_enable_auto_merge`'s input is `{ number }`
 * only, `production-declarations.ts:732-744` -- the base tool has no
 * equivalent of blog-mcp's own expected-SHA guard).
 */
export default function BlogComposeView({ declarationId }: ConsoleViewProps) {
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);
  const [existingTags, setExistingTags] = useState<TagRecord[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [existingAuthors, setExistingAuthors] = useState<AuthorRecord[]>([]);
  const [authorsLoaded, setAuthorsLoaded] = useState(false);

  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState('');
  const [checkedTags, setCheckedTagsState] = useState<Set<string>>(new Set());
  const [tagsFallback, setTagsFallback] = useState('');
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [creatingTag, setCreatingTag] = useState<string | null>(null);
  const [checkedAuthors, setCheckedAuthorsState] = useState<Set<string>>(new Set());
  const [authorsFallback, setAuthorsFallback] = useState('');
  const [pendingAuthors, setPendingAuthors] = useState<string[]>([]);
  const [creatingAuthor, setCreatingAuthor] = useState<string | null>(null);
  const [extraStagedPaths, setExtraStagedPaths] = useState<string[]>([]);

  const [mode, setMode] = useState<'compose' | 'markdown'>('compose');
  const [rawMarkdown, setRawMarkdown] = useState('');

  const [exists, setExists] = useState(false);
  const [pr, setPr] = useState<number | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [autoMerge, setAutoMerge] = useState(true);

  const hasTagVocab = existingTags.length > 0;
  const hasAuthorVocab = existingAuthors.length > 0;
  const metadataCreationInProgress = creatingTag !== null || creatingAuthor !== null;

  const logLine = useCallback((text: string, isError = false) => {
    setLog((prev) => [...prev, { text, isError }]);
  }, []);

  const onPrMerged = useCallback(() => {
    logLine('Merged. Nothing further to reconcile from this screen.');
  }, [logLine]);
  usePrWatcher(declarationId, pr, logLine, onPrMerged);

  const dismissLog = useCallback((index: number) => {
    setLog((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const logError = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logLine(message, true);
      if (err instanceof ToolCallError && err.findings) {
        for (const f of err.findings) {
          logLine(`  - [${f.rule}] ${f.message}`, true);
        }
      }
    },
    [logLine],
  );

  const setCheckedTags = useCallback(
    (tags: readonly string[] | undefined) => {
      if (hasTagVocab) {
        const known = new Set(existingTags.map((t) => t.key));
        const wanted = tags ?? [];
        const kept = wanted.filter((t) => known.has(t));
        const dropped = wanted.filter((t) => !known.has(t));
        setCheckedTagsState(new Set(kept));
        setPendingTags(dropped);
        if (dropped.length > 0) {
          logLine(`Dropped tag(s) not in the vocabulary: ${dropped.join(', ')}. Create them below or pick from the checklist instead.`, true);
        }
      } else {
        setTagsFallback((tags ?? []).join(', '));
      }
    },
    [hasTagVocab, existingTags, logLine],
  );

  const setCheckedAuthors = useCallback(
    (authors: readonly string[] | undefined) => {
      if (hasAuthorVocab) {
        const known = new Set(existingAuthors.map((a) => a.key));
        const wanted = authors ?? [];
        const kept = wanted.filter((a) => known.has(a));
        const dropped = wanted.filter((a) => !known.has(a));
        setCheckedAuthorsState(new Set(kept));
        setPendingAuthors(dropped);
        if (dropped.length > 0) {
          logLine(`Dropped author(s) not in the vocabulary: ${dropped.join(', ')}. Create them below or pick from the checklist instead.`, true);
        }
      } else {
        setAuthorsFallback((authors ?? []).join(', '));
      }
    },
    [hasAuthorVocab, existingAuthors, logLine],
  );

  async function createPendingTag(key: string) {
    setCreatingTag(key);
    try {
      const label = titleCaseFromKey(key);
      const result = await addTag(declarationId, key, label, `Posts related to ${label}.`);
      setExistingTags((prev) => [...prev, { key, label, permalink: result.permalink, description: `Posts related to ${label}.`, postCount: 0 }]);
      setCheckedTagsState((prev) => new Set(prev).add(key));
      setPendingTags((prev) => prev.filter((t) => t !== key));
      setExtraStagedPaths((prev) => [...prev, result.path]);
      logLine(`Created tag '${key}' and checked it.`);
    } catch (err) {
      logError(err);
    } finally {
      setCreatingTag(null);
    }
  }

  async function createPendingAuthor(key: string) {
    setCreatingAuthor(key);
    try {
      const name = titleCaseFromKey(key);
      const result = await addAuthor(declarationId, key, name);
      setExistingAuthors((prev) => [...prev, { key, name, url: result.url }]);
      setCheckedAuthorsState((prev) => new Set(prev).add(key));
      setPendingAuthors((prev) => prev.filter((a) => a !== key));
      setExtraStagedPaths((prev) => [...prev, result.path]);
      logLine(`Created author '${key}' and checked it.`);
    } catch (err) {
      logError(err);
    } finally {
      setCreatingAuthor(null);
    }
  }

  function tagList(): string[] {
    if (hasTagVocab) return [...checkedTags];
    return tagsFallback
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function authorList(): string[] {
    if (hasAuthorVocab) return [...checkedAuthors];
    return authorsFallback
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
  }

  useEffect(() => {
    if (exists || slugTouched) return;
    setSlug(slugify(title));
  }, [title, exists, slugTouched]);

  const loadExisting = useCallback(
    async (targetSlug: string) => {
      setLog([]);
      try {
        const data = await getPost(declarationId, targetSlug);
        const fm = data.frontMatter ?? {};
        setTitle(fm.title ?? '');
        setDescription(fm.description ?? '');
        setCheckedTags(fm.tags);
        setCheckedAuthors(fm.authors);
        setBody(data.body ?? '');
        setDate(fm.date ? isoToDatetimeLocal(fm.date) : '');
        setExists(true);
        logLine(`Loaded existing post '${targetSlug}'.`);
      } catch (err) {
        setExists(false);
        const message = err instanceof Error ? err.message : String(err);
        logLine(`No existing post found for '${targetSlug}' -- Publish will create a new one. (${message})`);
      }
      if (!hasTagVocab) logLine(NO_TAG_VOCAB_MESSAGE);
    },
    [declarationId, hasTagVocab, setCheckedTags, setCheckedAuthors, logLine],
  );

  useEffect(() => {
    setExistingSlugs([]);
    setExistingTags([]);
    setTagsLoaded(false);
    setExistingAuthors([]);
    setAuthorsLoaded(false);

    listPosts(declarationId)
      .then((data) => setExistingSlugs(data.posts.map((p) => p.slug)))
      .catch(() => undefined);
    listTags(declarationId)
      .then((data) => setExistingTags([...data.tags]))
      .catch(() => undefined)
      .finally(() => setTagsLoaded(true));
    listAuthors(declarationId)
      .then((data) => setExistingAuthors([...data.authors]))
      .catch(() => undefined)
      .finally(() => setAuthorsLoaded(true));
    // eslint rules aside: re-loads whenever the selected declaration changes.
  }, [declarationId]);

  useEffect(() => {
    if (!tagsLoaded || !hasTagVocab || !tagsFallback.trim()) return;
    setCheckedTags(
      tagsFallback
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
    setTagsFallback('');
  }, [tagsLoaded, hasTagVocab, tagsFallback, setCheckedTags]);

  useEffect(() => {
    if (!authorsLoaded || !hasAuthorVocab || !authorsFallback.trim()) return;
    setCheckedAuthors(
      authorsFallback
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean),
    );
    setAuthorsFallback('');
  }, [authorsLoaded, hasAuthorVocab, authorsFallback, setCheckedAuthors]);

  async function handleParseRawMarkdown() {
    setLog([]);
    if (!rawMarkdown.trim()) {
      logLine('Paste some markdown first.', true);
      return;
    }
    try {
      const result = await parseMarkdown(declarationId, rawMarkdown);
      const { frontMatter, frontMatterPresent, body: parsedBody } = result;
      if (!frontMatterPresent) {
        const extracted = extractLeadingHeading(rawMarkdown);
        if (extracted && DATE_HEADING_RE.test(extracted.heading) && !Number.isNaN(Date.parse(extracted.heading))) {
          setDate(isoToDatetimeLocal(new Date(extracted.heading).toISOString()));
          setBody(extracted.rest);
          logLine(`No front matter found -- read "${extracted.heading}" as the post date and used the rest as Body. Title/Slug/Tags still need filling in.`);
        } else if (extracted) {
          setTitle(extracted.heading);
          setBody(rawMarkdown);
          logLine(
            `No front matter found -- read "${extracted.heading}" as the title (Slug auto-fills from it) and used the whole input as Body. Description and Tags still need filling in before Publish.`,
          );
        } else {
          setBody(rawMarkdown);
          logLine('No "---" front matter fences found and no leading heading to salvage a title from -- pasted the whole input into Body as-is.');
        }
        setMode('compose');
        return;
      }
      if (!frontMatter) {
        logLine('Front matter fences were present but the YAML inside failed to parse -- fix it and try again.', true);
        return;
      }
      const fm = frontMatter as { title?: string; description?: string; date?: string; slug?: string; tags?: string[]; authors?: string[] };
      if (typeof fm.slug === 'string') {
        setSlug(fm.slug);
        setSlugTouched(true);
      }
      if (typeof fm.title === 'string') setTitle(fm.title);
      if (typeof fm.description === 'string') setDescription(fm.description);
      if (typeof fm.date === 'string') setDate(isoToDatetimeLocal(fm.date));
      setCheckedTags(Array.isArray(fm.tags) ? fm.tags : []);
      setCheckedAuthors(Array.isArray(fm.authors) ? fm.authors : []);
      setBody(parsedBody);
      logLine('Parsed front matter and body from the pasted markdown.');
      setMode('compose');
    } catch (err) {
      logError(err);
    }
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugTouched(true);
  }

  function handleSlugBlurOrChange() {
    const trimmed = slug.trim();
    if (trimmed && existingSlugs.includes(trimmed)) void loadExisting(trimmed);
  }

  function resetForm() {
    setSlug('');
    setSlugTouched(false);
    setTitle('');
    setDescription('');
    setBody('');
    setDate('');
    setCheckedTagsState(new Set());
    setTagsFallback('');
    setPendingTags([]);
    setCheckedAuthorsState(new Set());
    setAuthorsFallback('');
    setPendingAuthors([]);
    setExtraStagedPaths([]);
    setExists(false);
    setRawMarkdown('');
  }

  async function handlePublish() {
    setLog([]);
    if (metadataCreationInProgress) {
      logLine('Wait for the pending tag or author creation to finish before publishing.', true);
      return;
    }
    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
      logLine('Slug is required.', true);
      return;
    }
    if (!exists && existingSlugs.includes(trimmedSlug)) {
      logLine(`A post with slug '${trimmedSlug}' already exists -- click "Load existing" to edit it instead of creating a new one.`, true);
      return;
    }

    const isoDate = date.trim() || undefined;
    const authors = authorList();
    const authorsPayload = authors.length > 0 ? authors : undefined;

    setIsPublishing(true);
    try {
      logLine(`Preparing branch 'blog/${trimmedSlug}'...`);
      const branchResult = await prepareBranch(declarationId, `blog/${trimmedSlug}`);
      logLine(`On branch '${branchResult.branch}'.`);

      let newPath: string;
      let writeData: PostWriteResult;
      if (exists) {
        logLine('Updating post...');
        writeData = await updatePost(declarationId, {
          slug: trimmedSlug,
          body,
          frontMatter: { title, description, tags: tagList(), authors: authorsPayload, date: isoDate },
        });
        newPath = writeData.path;
      } else {
        logLine('Creating post...');
        writeData = await createPost(declarationId, {
          title,
          description,
          slug: trimmedSlug,
          body,
          tags: tagList(),
          authors: authorsPayload,
          date: isoDate,
        });
        newPath = writeData.path;
        setExists(true);
      }
      logLine(`Wrote ${newPath}.`);

      for (const created of writeData.createdAuthors) {
        logLine(`Created author '${created.key}' (name: ${created.name}).`);
      }
      for (const created of writeData.createdTags) {
        logLine(`Created tag '${created.key}' (label: ${created.label}).`);
      }
      if (writeData.defaultAuthorUsed) {
        logLine('No author selected; used the configured default author.');
      }

      logLine('Staging...');
      const stagePathList = Array.from(new Set([...(writeData.changedPaths.length > 0 ? writeData.changedPaths : [newPath]), ...extraStagedPaths]));
      await stagePaths(declarationId, stagePathList);

      logLine('Committing...');
      const commitResult = await commit(declarationId, `feat(blog): ${exists ? 'update' : 'add'} ${trimmedSlug}`);

      logLine('Pushing...');
      const pushResult = await push(declarationId, commitResult.branch);

      logLine('Opening pull request...');
      const { ref } = await openPullRequest(declarationId, `${exists ? 'Update' : 'Add'} ${title || trimmedSlug}`, 'Published via the console.', pushResult.branch);
      setPr(ref.number);
      logLine(`Opened PR #${ref.number}: ${ref.url}`);

      if (autoMerge) {
        logLine('Enabling auto-merge...');
        const autoMergeResult = await enableAutoMerge(declarationId, ref.number);
        logLine(`Auto-merge enabled: ${autoMergeResult.autoMergeEnabled}`);
      }

      resetForm();
    } catch (err) {
      logError(err);
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <>
      <div className="view-header">
        <button
          type="button"
          className={`view-header-toggle${mode === 'compose' ? ' active' : ''}`}
          onClick={() => setMode('compose')}
          disabled={isPublishing}
          title="Fill in the slug/title/description/tags/body fields directly"
        >
          Compose
        </button>
        <button
          type="button"
          className={`view-header-toggle${mode === 'markdown' ? ' active' : ''}`}
          onClick={() => setMode('markdown')}
          disabled={isPublishing}
          title="Paste a whole markdown file (front matter + body) and derive every field from it in one step"
        >
          Markdown
        </button>
      </div>
      <p className="muted">
        Create a new post or load an existing one by slug, then publish: branch -&gt; write -&gt; stage -&gt; commit -&gt; push -&gt; open
        PR. With &quot;Auto-Merge&quot; checked, that PR is also enabled to merge automatically once its required checks pass -- uncheck
        it to leave the PR open for a manual review/merge instead. Nothing merges before the PR is actually opened.
      </p>
      <div className="compose-form">
        <datalist id="existing-slugs">
          {existingSlugs.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <fieldset className="compose-fieldset" disabled={isPublishing || metadataCreationInProgress}>
          {mode === 'compose' && (
            <>
              <div className="field">
                <span className="field-label">Slug</span>
                <div className="slug-row">
                  <input
                    type="text"
                    placeholder="slug (e.g. my-post)"
                    list="existing-slugs"
                    value={slug}
                    onChange={(event) => handleSlugChange(event.target.value)}
                    onBlur={handleSlugBlurOrChange}
                  />
                  <button
                    type="button"
                    disabled={!slug.trim()}
                    onClick={() => slug.trim() && void loadExisting(slug.trim())}
                    title={slug.trim() ? `Load '${slug.trim()}' into the fields below` : 'Type or pick an existing slug first'}
                  >
                    Load existing
                  </button>
                </div>
                <span className="muted">
                  Typing shows matching existing slugs to pick from. For a new post, this auto-fills from Title until you type here
                  yourself; leave it blank (and Title empty) and Publish will create a brand-new post instead.
                </span>
              </div>

              <div className="field">
                <span className="field-label">Title</span>
                <input type="text" placeholder="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>

              <div className="field">
                <span className="field-label">Description</span>
                <input type="text" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>

              <div className="field">
                <span className="field-label">Date</span>
                <input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} />
                <span className="muted">Optional -- leave blank to default to now.</span>
              </div>

              <div className="field">
                <span className="field-label">Tags</span>
                {hasTagVocab ? (
                  <div className="tag-checklist">
                    {existingTags.map((tag) => (
                      <label key={tag.key} className="tag-chip" htmlFor={`tag-${tag.key}`}>
                        <input
                          type="checkbox"
                          id={`tag-${tag.key}`}
                          checked={checkedTags.has(tag.key)}
                          onChange={(event) => {
                            setCheckedTagsState((prev) => {
                              const next = new Set(prev);
                              if (event.target.checked) next.add(tag.key);
                              else next.delete(tag.key);
                              return next;
                            });
                          }}
                        />
                        {tag.label || tag.key}
                      </label>
                    ))}
                  </div>
                ) : (
                  <input type="text" placeholder="tags (comma-separated)" value={tagsFallback} onChange={(event) => setTagsFallback(event.target.value)} />
                )}
                {hasTagVocab && pendingTags.length > 0 && (
                  <div className="tag-checklist pending-tags">
                    {pendingTags.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className="tag-chip pending-tag-chip"
                        disabled={creatingTag === key}
                        onClick={() => void createPendingTag(key)}
                        title={`'${key}' isn't in the tag vocabulary yet -- add it with a default label/description`}
                      >
                        {creatingTag === key ? `Creating '${key}'...` : `+ Create '${key}'`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="field">
                <span className="field-label">Authors</span>
                {hasAuthorVocab ? (
                  <div className="tag-checklist">
                    {existingAuthors.map((author) => (
                      <label key={author.key} className="tag-chip" htmlFor={`author-${author.key}`}>
                        <input
                          type="checkbox"
                          id={`author-${author.key}`}
                          checked={checkedAuthors.has(author.key)}
                          onChange={(event) => {
                            setCheckedAuthorsState((prev) => {
                              const next = new Set(prev);
                              if (event.target.checked) next.add(author.key);
                              else next.delete(author.key);
                              return next;
                            });
                          }}
                        />
                        {author.name || author.key}
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="authors (comma-separated)"
                    value={authorsFallback}
                    onChange={(event) => setAuthorsFallback(event.target.value)}
                  />
                )}
                {hasAuthorVocab && pendingAuthors.length > 0 && (
                  <div className="tag-checklist pending-tags">
                    {pendingAuthors.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className="tag-chip pending-tag-chip"
                        disabled={creatingAuthor === key}
                        onClick={() => void createPendingAuthor(key)}
                        title={`'${key}' isn't in the author vocabulary yet -- add it with a default name`}
                      >
                        {creatingAuthor === key ? `Creating '${key}'...` : `+ Create '${key}'`}
                      </button>
                    ))}
                  </div>
                )}
                <span className="muted">Optional -- leave everything unchecked to use the configured default author.</span>
              </div>

              <div className="field">
                <span className="field-label">Body</span>
                <textarea
                  rows={12}
                  placeholder="Body (markdown, include <!-- truncate --> when updating)"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </div>
            </>
          )}

          {mode === 'markdown' && (
            <div className="field raw-markdown-panel">
              <span className="field-label">Raw markdown</span>
              <textarea
                rows={16}
                placeholder={'--- \ntitle: "..."\ndescription: "..."\nslug: ...\n...\n---\n\nBody...'}
                value={rawMarkdown}
                onChange={(event) => setRawMarkdown(event.target.value)}
              />
              <button type="button" onClick={() => void handleParseRawMarkdown()}>
                Parse
              </button>
            </div>
          )}

          <div className="compose-actions">
            <button type="button" className="primary" disabled={metadataCreationInProgress} onClick={() => void handlePublish()}>
              {isPublishing ? 'Publishing...' : 'Create/update & open PR'}
            </button>
            <label
              className="tag-chip"
              title="When checked, the opened PR is told to merge automatically once its required checks pass -- it still doesn't merge immediately"
            >
              <input type="checkbox" checked={autoMerge} onChange={(event) => setAutoMerge(event.target.checked)} />
              Auto-Merge
            </label>
          </div>
        </fieldset>
      </div>

      <ul className="compose-log">
        {log.map((line, i) => (
          <li key={i} className={line.isError ? 'error' : undefined}>
            <span className="toast-text">{line.text}</span>
            <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={() => dismissLog(i)}>
              &times;
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
