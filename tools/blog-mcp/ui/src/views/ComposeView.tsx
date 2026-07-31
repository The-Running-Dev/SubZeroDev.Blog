import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, post } from '../lib/api';

interface Tag {
  key: string;
  label: string;
}

interface PostFrontMatter {
  title?: string;
  description?: string;
  tags?: string[];
}

interface LogLine {
  text: string;
  isError: boolean;
}

const NO_TAG_VOCAB_MESSAGE =
  'Could not load a tag vocabulary from /api/tags -- falling back to a free-text tags field. A typo’d tag name will only be caught at publish time.';

export default function ComposeView() {
  const { slug: prefillSlug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);
  const [existingTags, setExistingTags] = useState<Tag[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);

  const [slug, setSlug] = useState(prefillSlug ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [checkedTags, setCheckedTagsState] = useState<Set<string>>(new Set());
  const [tagsFallback, setTagsFallback] = useState('');

  // 'compose': the structured slug/title/description/tags/body fields.
  // 'markdown': a single raw-markdown textarea that Parses into those same
  // fields -- mutually exclusive with 'compose', not shown alongside it.
  const [mode, setMode] = useState<'compose' | 'markdown'>('compose');
  const [rawMarkdown, setRawMarkdown] = useState('');

  const [exists, setExists] = useState(false);
  const [pushedSha, setPushedSha] = useState<string | null>(null);
  const [pr, setPr] = useState<number | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);

  const hasTagVocab = existingTags.length > 0;
  // Guards against re-running the prefill effect a second time if this
  // component re-renders for an unrelated reason (React Strict Mode's
  // double-invoke in dev, tagsLoaded flipping, etc.).
  const prefilledRef = useRef(false);

  const logLine = useCallback((text: string, isError = false) => {
    setLog((prev) => [...prev, { text, isError }]);
  }, []);

  const setCheckedTags = useCallback(
    (tags: string[] | undefined) => {
      if (hasTagVocab) {
        setCheckedTagsState(new Set(tags ?? []));
      } else {
        setTagsFallback((tags ?? []).join(', '));
      }
    },
    [hasTagVocab]
  );

  function tagList(): string[] {
    if (hasTagVocab) return [...checkedTags];
    return tagsFallback
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const loadExisting = useCallback(
    async (targetSlug: string) => {
      setLog([]);
      try {
        const data = await api<{ frontMatter: PostFrontMatter; body: string; path: string }>(`/api/posts/${encodeURIComponent(targetSlug)}`);
        const fm = data.data?.frontMatter ?? {};
        setTitle(fm.title ?? '');
        setDescription(fm.description ?? '');
        setCheckedTags(fm.tags);
        setBody(data.data?.body ?? '');
        setExists(true);
        logLine(`Loaded existing post '${targetSlug}'.`);
      } catch (err) {
        setExists(false);
        const message = err instanceof Error ? err.message : String(err);
        logLine(`No existing post found for '${targetSlug}' -- Publish will create a new one. (${message})`);
      }
      if (!hasTagVocab) logLine(NO_TAG_VOCAB_MESSAGE);
    },
    [hasTagVocab, setCheckedTags, logLine]
  );

  // Best-effort: a failure here just means no autocomplete/checkboxes,
  // never blocks the form from rendering.
  useEffect(() => {
    api<{ posts: Array<{ slug: string }> }>('/api/posts')
      .then((data) => setExistingSlugs((data.data?.posts ?? []).map((p) => p.slug)))
      .catch(() => undefined);
    api<{ tags: Tag[] }>('/api/tags')
      .then((data) => setExistingTags(data.data?.tags ?? []))
      .catch(() => undefined)
      .finally(() => setTagsLoaded(true));
  }, []);

  // Jumped here from the Posts table's Edit button (or a direct
  // /compose/:slug link) -- load it the same way typing the slug and
  // pressing "Load existing" would. Waits for the tags fetch to settle
  // first so hasTagVocab is already correct before setCheckedTags runs.
  useEffect(() => {
    if (!prefillSlug || !tagsLoaded || prefilledRef.current) return;
    prefilledRef.current = true;
    setSlug(prefillSlug);
    void loadExisting(prefillSlug);
    // eslint rules aside: intentionally only re-checking when these settle, not on every field change
  }, [prefillSlug, tagsLoaded, loadExisting]);

  async function handleParseRawMarkdown() {
    setLog([]);
    if (!rawMarkdown.trim()) {
      logLine('Paste some markdown first.', true);
      return;
    }
    try {
      const result = await post<{ frontMatter: PostFrontMatter | null; frontMatterPresent: boolean; body: string }>('/api/parse-markdown', {
        content: rawMarkdown
      });
      const { frontMatter, frontMatterPresent, body: parsedBody } = result.data ?? { frontMatter: null, frontMatterPresent: false, body: '' };
      if (!frontMatterPresent) {
        logLine('No "---" front matter fences found -- pasted the whole input into Body as-is.');
        setBody(rawMarkdown);
        setMode('compose');
        return;
      }
      if (!frontMatter) {
        logLine('Front matter fences were present but the YAML inside failed to parse -- fix it and try again.', true);
        return;
      }
      const fm = frontMatter as PostFrontMatter & { slug?: string };
      if (typeof fm.slug === 'string') setSlug(fm.slug);
      if (typeof fm.title === 'string') setTitle(fm.title);
      if (typeof fm.description === 'string') setDescription(fm.description);
      setCheckedTags(Array.isArray(fm.tags) ? fm.tags : []);
      setBody(parsedBody);
      logLine('Parsed front matter and body from the pasted markdown.');
      setMode('compose');
    } catch (err) {
      logLine(err instanceof Error ? err.message : String(err), true);
    }
  }

  // Fires once the user picks a suggestion from the datalist dropdown (or
  // types an exact existing slug and blurs/tabs away) -- picking from the
  // list is then enough on its own, "Load existing" stays around for
  // typing a slug from memory without opening the dropdown.
  function handleSlugChange(value: string) {
    setSlug(value);
  }

  function handleSlugBlurOrChange() {
    const trimmed = slug.trim();
    if (trimmed && existingSlugs.includes(trimmed)) void loadExisting(trimmed);
  }

  async function handlePublish() {
    setLog([]);
    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
      logLine('Slug is required.', true);
      return;
    }

    try {
      logLine(`Creating/switching to branch 'blog/${trimmedSlug}'...`);
      const branchResult = await post<{ branch: string }>('/api/branch', { slug: trimmedSlug, kind: 'blog', checkoutExisting: true });
      const newBranch = branchResult.data?.branch ?? null;
      logLine(`On branch '${newBranch}'.`);

      let newPath: string | null;
      if (exists) {
        logLine('Updating post...');
        const updateResult = await post<{ path: string }>(`/api/posts/${encodeURIComponent(trimmedSlug)}`, {
          body,
          frontMatter: { title, description, tags: tagList() }
        });
        newPath = updateResult.data?.path ?? null;
      } else {
        logLine('Creating post...');
        const createResult = await post<{ path: string }>('/api/posts', {
          title,
          description,
          slug: trimmedSlug,
          body,
          tags: tagList()
        });
        newPath = createResult.data?.path ?? null;
        setExists(true);
      }
      logLine(`Wrote ${newPath}.`);

      logLine('Staging...');
      await post('/api/stage', { paths: [newPath] });

      logLine('Committing...');
      await post('/api/commit', { type: 'feat', scope: 'blog', summary: `add ${trimmedSlug}` });

      logLine('Pushing...');
      const pushResult = await post<{ localSha: string }>('/api/push', {});
      const sha = pushResult.data?.localSha ?? null;
      setPushedSha(sha);

      logLine('Opening pull request...');
      const prResult = await post<{ pr: number; url: string }>('/api/pr', {
        title: `Add ${title || trimmedSlug}`,
        body: 'Published via blog-mcp’s UI.',
        head: newBranch
      });
      setPr(prResult.data?.pr ?? null);
      logLine(`Opened PR #${prResult.data?.pr}: ${prResult.data?.url}`);
    } catch (err) {
      logLine(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function handleArm() {
    if (!pr) return;
    if (!pushedSha) {
      logLine('No known-good pushed SHA to validate against -- publish first.', true);
      return;
    }
    try {
      // Deliberately the SHA this session itself just pushed, not whatever
      // /api/pr/:number currently reports -- fetching the "expected" value
      // from the same place the check validates against would make the
      // cross-check tautological and defeat the reason blog_arm_auto_merge
      // takes an explicit headSha at all: to catch the branch having moved
      // (someone else pushed) between publish and arming.
      const armResult = await post<Record<string, never>>(`/api/pr/${pr}/merge`, { headSha: pushedSha });
      logLine(`Auto-merge armed: ${armResult.summary ?? ''}`);
    } catch (err) {
      logLine(err instanceof Error ? err.message : String(err), true);
    }
  }

  return (
    <>
      <div className="view-header">
        <button
          type="button"
          className={`view-header-toggle${mode === 'compose' ? ' active' : ''}`}
          onClick={() => setMode('compose')}
          title="Fill in the slug/title/description/tags/body fields directly"
        >
          Compose
        </button>
        <button
          type="button"
          className={`view-header-toggle${mode === 'markdown' ? ' active' : ''}`}
          onClick={() => setMode('markdown')}
          title="Paste a whole markdown file (front matter + body) and derive every field from it in one step"
        >
          Markdown
        </button>
      </div>
      <p className="muted">
        Create a new post or load an existing one by slug, then publish: branch → write → stage → commit → push → open PR. Opening
        the PR does not merge anything by itself -- click &quot;Arm auto-merge&quot; afterward to tell GitHub to merge that PR
        automatically once its required checks pass. Nothing merges before then.
      </p>
      <div className="compose-form">
        <datalist id="existing-slugs">
          {existingSlugs.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

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
                Typing shows matching existing slugs to pick from. Leave this blank and Publish will create a brand-new post instead.
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

        {/* Switched to via the "Markdown" tab up in the view header, and back
            to 'compose' automatically once parsing succeeds so the result can
            be reviewed/edited. Parsing happens server-side (POST
            /api/parse-markdown -> blog_parse_markdown -> the same
            domain/frontmatter.ts parser every other tool uses), not with a
            hand-rolled client-side YAML parser that could silently disagree
            with what publish actually does. */}
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
              Parse into fields
            </button>
          </div>
        )}

        <div className="compose-actions">
          <button type="button" className="primary" onClick={() => void handlePublish()}>
            Create/update &amp; open PR
          </button>
          <button
            type="button"
            className="primary"
            disabled={!pr}
            onClick={() => void handleArm()}
            title="Tells GitHub to merge this PR automatically once its required checks pass -- does not merge it immediately"
          >
            Arm auto-merge
          </button>
          {pr && (
            <button type="button" onClick={() => navigate(`/pr?pr=${pr}`)}>
              View PR status
            </button>
          )}
        </div>
      </div>

      <ul className="compose-log">
        {log.map((line, i) => (
          <li key={i} className={line.isError ? 'error' : undefined}>
            {line.text}
          </li>
        ))}
      </ul>
    </>
  );
}
