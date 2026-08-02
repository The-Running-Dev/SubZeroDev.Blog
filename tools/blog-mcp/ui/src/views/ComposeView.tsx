import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, post, ApiError } from '../lib/api';
import { isoToDatetimeLocal } from '../lib/formatDate';
import { usePrWatcher } from '../lib/usePrWatcher';

interface Tag {
  key: string;
  label: string;
}

interface Author {
  key: string;
  name: string;
}

interface PostFrontMatter {
  title?: string;
  description?: string;
  tags?: string[];
  authors?: string[];
  date?: string;
}

/** Shared shape of blog_create_post/blog_update_post's result (src/domain/post.ts's PostWriteResult) that Compose actually reads. */
interface WriteResultData {
  path: string;
  changedPaths?: string[];
  createdAuthors?: Author[];
  createdTags?: Tag[];
  defaultAuthorUsed?: boolean;
}

interface LogLine {
  text: string;
  isError: boolean;
}

const NO_TAG_VOCAB_MESSAGE =
  'Could not load a tag vocabulary from /api/tags -- falling back to a free-text tags field. A typo’d tag name will only be caught at publish time.';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Matches a leading markdown H1 ("# Heading", optionally with a blank line
// after it) at the very start of pasted content -- used only when no `---`
// front matter fences were found, to salvage a title (or, if the heading
// itself reads as a date, a date) from otherwise unstructured prose.
const LEADING_HEADING_RE = /^#[ \t]+(.+?)[ \t]*\n+([\s\S]*)$/;

// Deliberately narrow (weekday?, Month Day, Year) rather than trusting
// Date.parse on arbitrary text -- Date.parse alone accepts too much
// ambiguous input (e.g. some bare numbers) to safely gate on by itself,
// but it's still the one doing the actual parsing once this shape matches.
const DATE_HEADING_RE = /^(?:[A-Za-z]+day,\s*)?[A-Za-z]+\s+\d{1,2},\s*\d{4}$/;

function extractLeadingHeading(markdown: string): { heading: string; rest: string } | null {
  const match = LEADING_HEADING_RE.exec(markdown.trimStart());
  if (!match) return null;
  return { heading: match[1] as string, rest: match[2] as string };
}

export default function ComposeView() {
  const { slug: prefillSlug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);
  const [existingTags, setExistingTags] = useState<Tag[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [existingAuthors, setExistingAuthors] = useState<Author[]>([]);
  const [authorsLoaded, setAuthorsLoaded] = useState(false);

  const [slug, setSlug] = useState(prefillSlug ?? '');
  // Tracks whether the user has typed into the Slug field directly -- until
  // then, Slug auto-follows Title (a fresh, not-yet-published post only;
  // never once an existing one is loaded, since blog_update_post refuses
  // slug changes without an explicit override).
  const [slugTouched, setSlugTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState('');
  const [checkedTags, setCheckedTagsState] = useState<Set<string>>(new Set());
  const [tagsFallback, setTagsFallback] = useState('');
  // Tags parsed from front matter that aren't in docs/blog/tags.yml yet --
  // offered as one-click "Create tag" buttons rather than only a log
  // warning, since the fix for an unknown tag is usually "yes, add it",
  // not "pick something else".
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [creatingTag, setCreatingTag] = useState<string | null>(null);
  const [checkedAuthors, setCheckedAuthorsState] = useState<Set<string>>(new Set());
  const [authorsFallback, setAuthorsFallback] = useState('');
  // Same "not in the vocabulary yet" pattern as pendingTags, mirrored for authors.
  const [pendingAuthors, setPendingAuthors] = useState<string[]>([]);
  const [creatingAuthor, setCreatingAuthor] = useState<string | null>(null);
  // Paths blog_add_tag/blog_add_author have actually touched this session,
  // beyond the post file itself -- neither tool stages/commits what it
  // writes, so without this Publish would leave a brand-new tag/author as an
  // uncommitted local change: the pushed post would reference metadata that
  // doesn't exist on the remote branch at all. Publish's own write result
  // (changedPaths) is the primary source of what to stage; this is a small
  // fallback specifically for files a separate pre-creation call touched.
  const [extraStagedPaths, setExtraStagedPaths] = useState<string[]>([]);

  // 'compose': the structured slug/title/description/tags/body fields.
  // 'markdown': a single raw-markdown textarea that Parses into those same
  // fields -- mutually exclusive with 'compose', not shown alongside it.
  const [mode, setMode] = useState<'compose' | 'markdown'>('compose');
  const [rawMarkdown, setRawMarkdown] = useState('');

  const [exists, setExists] = useState(false);
  const [pr, setPr] = useState<number | null>(null);
  // The SHA this session itself pushed for `pr` -- threaded into
  // blog_reconcile_after_merge's expectedHeadSha once the PR merges, same
  // cross-check reasoning as auto-merge's own headSha (see handlePublish).
  const [prHeadSha, setPrHeadSha] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  // True for the duration of handlePublish's whole branch->...->auto-merge
  // sequence -- disables the form so a double-click can't fire a second,
  // overlapping publish pipeline against the same branch.
  const [isPublishing, setIsPublishing] = useState(false);
  // On by default -- most publishes should just merge once checks pass,
  // without a separate manual step. Unchecking it leaves the PR open for a
  // manual review/merge instead.
  const [autoMerge, setAutoMerge] = useState(true);

  const hasTagVocab = existingTags.length > 0;
  const hasAuthorVocab = existingAuthors.length > 0;
  // Guards against re-running the prefill effect a second time if this
  // component re-renders for an unrelated reason (React Strict Mode's
  // double-invoke in dev, tagsLoaded flipping, etc.).
  const prefilledRef = useRef(false);

  const logLine = useCallback((text: string, isError = false) => {
    setLog((prev) => [...prev, { text, isError }]);
  }, []);

  // Starts watching the PR the moment `pr` is set (right after Publish opens
  // one) and posts a toast on every state change until it merges or closes.
  // Once merged, reconciles the checkout (fetch, fast-forward base,
  // force-delete the now-merged local branch) so the next publish starts
  // clean -- TODO-NEXT.md sec7.5's "deferred reconciliation," the
  // interactive-UI half of it.
  const onPrMerged = useCallback(() => {
    if (!pr) return;
    void post(`/api/pr/${pr}/reconcile`, { expectedHeadSha: prHeadSha }).then(
      (result) => logLine(`Reconciled after merge: ${result.summary ?? 'done'}.`),
      (err) => logLine(`Reconciliation after merge failed: ${err instanceof Error ? err.message : String(err)}`, true)
    );
  }, [pr, prHeadSha, logLine]);
  usePrWatcher(pr, logLine, onPrMerged);

  // Toasts stack in a fixed corner (position: fixed, not part of document
  // flow), so unlike an inline log they never clear themselves -- each one
  // is dismissed individually via its own close button.
  const dismissLog = useCallback((index: number) => {
    setLog((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Surfaces the specific validation rule(s) that failed, not just the
  // generic top-level summary ("FAILED: Not written: ...") -- without this,
  // a rejected publish (e.g. an empty Tags field) looks identical to every
  // other failure in the log, with no way to tell what to actually fix.
  const logError = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logLine(message, true);
      if (err instanceof ApiError && err.findings) {
        for (const f of err.findings) {
          if (f.severity !== 'error') continue;
          logLine(`  - [${f.rule}] ${f.message}`, true);
        }
      }
    },
    [logLine]
  );

  // Filters to known vocabulary keys when one exists -- the tag checklist
  // below only ever renders a checkbox per `existingTags` entry, so any tag
  // outside that list (e.g. from pasted front matter) would otherwise sit in
  // `checkedTags` with no checkbox to show or uncheck it: invisible in the
  // form, then only discovered as a generic "Unknown tag key" finding at
  // Publish time.
  const setCheckedTags = useCallback(
    (tags: string[] | undefined) => {
      if (hasTagVocab) {
        const known = new Set(existingTags.map((t) => t.key));
        const wanted = tags ?? [];
        const kept = wanted.filter((t) => known.has(t));
        const dropped = wanted.filter((t) => !known.has(t));
        setCheckedTagsState(new Set(kept));
        setPendingTags(dropped);
        if (dropped.length > 0) {
          logLine(`Dropped tag(s) not in docs/blog/tags.yml: ${dropped.join(', ')}. Create them below or pick from the checklist instead.`, true);
        }
      } else {
        setTagsFallback((tags ?? []).join(', '));
      }
    },
    [hasTagVocab, existingTags, logLine]
  );

  // Same known-vs-pending split as setCheckedTags, mirrored for authors.
  // Unlike tags, an empty result is completely normal here -- omitting
  // authors is valid (falls back to the configured default author
  // server-side), so there's no "at least one required" concern to log
  // about, only unknown keys.
  const setCheckedAuthors = useCallback(
    (authors: string[] | undefined) => {
      if (hasAuthorVocab) {
        const known = new Set(existingAuthors.map((a) => a.key));
        const wanted = authors ?? [];
        const kept = wanted.filter((a) => known.has(a));
        const dropped = wanted.filter((a) => !known.has(a));
        setCheckedAuthorsState(new Set(kept));
        setPendingAuthors(dropped);
        if (dropped.length > 0) {
          logLine(`Dropped author(s) not in docs/blog/authors.yml: ${dropped.join(', ')}. Create them below or pick from the checklist instead.`, true);
        }
      } else {
        setAuthorsFallback((authors ?? []).join(', '));
      }
    },
    [hasAuthorVocab, existingAuthors, logLine]
  );

  // Title-Cases a kebab-case key for a default label ("ai-assisted" ->
  // "Ai Assisted") -- a reasonable starting point, not a claim it's
  // grammatically perfect; the author can still hand-edit tags.yml.
  function titleCaseFromKey(key: string): string {
    return key
      .split('-')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async function createPendingTag(key: string) {
    setCreatingTag(key);
    try {
      const label = titleCaseFromKey(key);
      const result = await post<{ key: string; permalink: string; path: string }>('/api/tags', {
        key,
        label,
        description: `Posts related to ${label}.`
      });
      const created = { key, label };
      setExistingTags((prev) => [...prev, created]);
      setCheckedTagsState((prev) => new Set(prev).add(key));
      setPendingTags((prev) => prev.filter((t) => t !== key));
      if (result.data?.path) setExtraStagedPaths((prev) => [...prev, result.data?.path as string]);
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
      const result = await post<{ key: string; name: string; url: string; path: string }>('/api/authors', { key, name });
      const created = { key, name };
      setExistingAuthors((prev) => [...prev, created]);
      setCheckedAuthorsState((prev) => new Set(prev).add(key));
      setPendingAuthors((prev) => prev.filter((a) => a !== key));
      if (result.data?.path) setExtraStagedPaths((prev) => [...prev, result.data?.path as string]);
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

  // Keeps Slug in sync with Title for a not-yet-published post, right up
  // until the user types into Slug themselves (setSlugTouched below) or an
  // existing post gets loaded (blog_update_post refuses slug changes
  // without an explicit override, so this must never touch it afterward).
  useEffect(() => {
    if (exists || slugTouched) return;
    setSlug(slugify(title));
  }, [title, exists, slugTouched]);

  const loadExisting = useCallback(
    async (targetSlug: string) => {
      setLog([]);
      try {
        const data = await api<{ frontMatter: PostFrontMatter; body: string; path: string }>(`/api/posts/${encodeURIComponent(targetSlug)}`);
        const fm = data.data?.frontMatter ?? {};
        setTitle(fm.title ?? '');
        setDescription(fm.description ?? '');
        setCheckedTags(fm.tags);
        setCheckedAuthors(fm.authors);
        setBody(data.data?.body ?? '');
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
    [hasTagVocab, setCheckedTags, setCheckedAuthors, logLine]
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
    api<{ authors: Author[] }>('/api/authors')
      .then((data) => setExistingAuthors(data.data?.authors ?? []))
      .catch(() => undefined)
      .finally(() => setAuthorsLoaded(true));
  }, []);

  // Jumped here from the Posts table's Edit button (or a direct
  // /compose/:slug link) -- load it the same way typing the slug and
  // pressing "Load existing" would. Waits for the tags/authors fetches to
  // settle first so hasTagVocab/hasAuthorVocab are already correct before
  // setCheckedTags/setCheckedAuthors run.
  useEffect(() => {
    if (!prefillSlug || !tagsLoaded || !authorsLoaded || prefilledRef.current) return;
    prefilledRef.current = true;
    setSlug(prefillSlug);
    void loadExisting(prefillSlug);
    // eslint rules aside: intentionally only re-checking when these settle, not on every field change
  }, [prefillSlug, tagsLoaded, authorsLoaded, loadExisting]);

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
        // No front matter at all -- salvage what we can from a leading
        // markdown heading rather than dumping everything into Body
        // untouched. A date-shaped heading (e.g. "Monday, May 18, 2026")
        // becomes the post's Date and is stripped from Body (this blog
        // never repeats the date as a heading in body text); anything else
        // becomes the Title, left in place in Body too, matching how every
        // existing post repeats its own title as an H1.
        const extracted = extractLeadingHeading(rawMarkdown);
        if (extracted && DATE_HEADING_RE.test(extracted.heading) && !Number.isNaN(Date.parse(extracted.heading))) {
          setDate(isoToDatetimeLocal(new Date(extracted.heading).toISOString()));
          setBody(extracted.rest);
          logLine(`No front matter found -- read "${extracted.heading}" as the post date and used the rest as Body. Title/Slug/Tags still need filling in.`);
        } else if (extracted) {
          setTitle(extracted.heading);
          setBody(rawMarkdown);
          logLine(
            `No front matter found -- read "${extracted.heading}" as the title (Slug auto-fills from it) and used the whole input as Body. Description and Tags still need filling in before Publish.`
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
      const fm = frontMatter as PostFrontMatter & { slug?: string };
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

  // Fires once the user picks a suggestion from the datalist dropdown (or
  // types an exact existing slug and blurs/tabs away) -- picking from the
  // list is then enough on its own, "Load existing" stays around for
  // typing a slug from memory without opening the dropdown.
  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugTouched(true);
  }

  function handleSlugBlurOrChange() {
    const trimmed = slug.trim();
    if (trimmed && existingSlugs.includes(trimmed)) void loadExisting(trimmed);
  }

  // Clears every input field back to a blank "ready for the next post" form
  // after a successful publish. Deliberately leaves `log` and `pr` alone --
  // the toast confirming what was just published (and the PR-watch state
  // that follows it) is the whole point of not wiping the screen. If this
  // view was reached via /compose/:slug, also drops the URL back to the
  // bare /compose route so a refresh doesn't silently reload the
  // just-published post (prefilledRef only guards against re-running the
  // prefill effect within this same session, not across a reload).
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
    if (prefillSlug) navigate('/compose', { replace: true });
  }

  async function handlePublish() {
    setLog([]);
    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
      logLine('Slug is required.', true);
      return;
    }

    // Catches the case where Slug was never touched directly (it auto-fills
    // from Title, see the effect above) so handleSlugBlurOrChange's
    // existing-post check never ran -- without this, Publish would branch,
    // write, stage, and commit before blog_create_post's own existsSync
    // check finally rejected it, wasting the whole pipeline on a post that
    // was always going to fail.
    if (!exists && existingSlugs.includes(trimmedSlug)) {
      logLine(`A post with slug '${trimmedSlug}' already exists -- click "Load existing" to edit it instead of creating a new one.`, true);
      return;
    }

    // The server (blog_create_post/blog_update_post's canonical date
    // service, src/domain/dateService.ts) is the single source of truth for
    // what counts as a valid date -- Compose used to run its own
    // Date.parse-based validation/conversion here, which was a second,
    // divergent implementation of the same rule (TODO-NEXT.md sec6.1's
    // "which inputs are accepted depends on the calling interface"). An
    // unparseable date now surfaces as a normal ApiError/precondition
    // failure through the catch block below, same as any other tool
    // rejection.
    const isoDate = date.trim() || undefined;

    // Authors, unlike tags, is genuinely optional -- an empty selection must
    // send `undefined`, never `[]`, since resolveAuthors (Milestone 11
    // Phase 2) only treats a truly-omitted field as "use the configured
    // default"; an explicit empty array still fails the existing
    // non-empty-list validation.
    const authors = authorList();
    const authorsPayload = authors.length > 0 ? authors : undefined;

    setIsPublishing(true);
    try {
      logLine(`Preparing branch 'blog/${trimmedSlug}'...`);
      // blog_prepare_publish_branch (Milestone 11 Phase 4), not
      // blog_create_branch: preserves a clean local-only commit already on
      // the base branch by rebasing it onto this branch instead of
      // abandoning it -- the exact incident this milestone started from.
      const branchResult = await post<{ branch: string; action: string }>('/api/branch', { slug: trimmedSlug, kind: 'blog', checkoutExisting: true });
      const newBranch = branchResult.data?.branch ?? null;
      logLine(`On branch '${newBranch}'.`);

      let newPath: string | null;
      let writeData: WriteResultData | undefined;
      if (exists) {
        logLine('Updating post...');
        const updateResult = await post<WriteResultData>(`/api/posts/${encodeURIComponent(trimmedSlug)}`, {
          body,
          frontMatter: { title, description, tags: tagList(), authors: authorsPayload, date: isoDate }
        });
        writeData = updateResult.data;
        newPath = writeData?.path ?? null;
      } else {
        logLine('Creating post...');
        const createResult = await post<WriteResultData>('/api/posts', {
          title,
          description,
          slug: trimmedSlug,
          body,
          tags: tagList(),
          authors: authorsPayload,
          date: isoDate
        });
        writeData = createResult.data;
        newPath = writeData?.path ?? null;
        setExists(true);
      }
      logLine(`Wrote ${newPath}.`);

      // Metadata preview (TODO-NEXT.md sec10's Phase 5 deliverable): makes
      // an auto-created key or a silently-substituted default author
      // visible, instead of the caller having to notice by diffing
      // authors.yml/tags.yml themselves -- the exact UX gap bug 1 was about.
      for (const created of writeData?.createdAuthors ?? []) {
        logLine(`Created author '${created.key}' (name: ${created.name}).`);
      }
      for (const created of writeData?.createdTags ?? []) {
        logLine(`Created tag '${created.key}' (label: ${created.label}).`);
      }
      if (writeData?.defaultAuthorUsed) {
        logLine('No author selected; used the configured default author.');
      }

      logLine('Staging...');
      // changedPaths (the write's own result) is the primary source of what
      // to stage -- it already includes any authors.yml/tags.yml the write
      // itself auto-created. extraStagedPaths is unioned in as a fallback,
      // for files a separate blog_add_tag/blog_add_author pre-creation call
      // touched instead.
      const stagePaths = Array.from(new Set([...(writeData?.changedPaths ?? (newPath ? [newPath] : [])), ...extraStagedPaths]));
      await post('/api/stage', { paths: stagePaths });

      logLine('Committing...');
      await post('/api/commit', { type: 'feat', scope: 'blog', summary: `add ${trimmedSlug}` });

      logLine('Pushing...');
      const pushResult = await post<{ localSha: string }>('/api/push', {});
      const sha = pushResult.data?.localSha ?? null;

      logLine('Opening pull request...');
      const prResult = await post<{ pr: number; url: string }>('/api/pr', {
        title: `Add ${title || trimmedSlug}`,
        body: 'Published via blog-mcp’s UI.',
        head: newBranch
      });
      const newPr = prResult.data?.pr ?? null;
      setPr(newPr);
      setPrHeadSha(sha);
      logLine(`Opened PR #${newPr}: ${prResult.data?.url}`);

      if (autoMerge && newPr && sha) {
        logLine('Enabling auto-merge...');
        // Deliberately the SHA this session itself just pushed, not whatever
        // /api/pr/:number currently reports -- fetching the "expected" value
        // from the same place the check validates against would make the
        // cross-check tautological and defeat the reason blog_auto_merge
        // takes an explicit headSha at all: to catch the branch having moved
        // (someone else pushed) between the push above and enabling it here.
        const autoMergeResult = await post<Record<string, never>>(`/api/pr/${newPr}/auto-merge`, { headSha: sha });
        logLine(`Auto-merge enabled: ${autoMergeResult.summary ?? ''}`);
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
        Create a new post or load an existing one by slug, then publish: branch → write → stage → commit → push → open PR. With
        &quot;Auto-Merge&quot; checked, that PR is also enabled to merge automatically once its required checks pass -- uncheck it to
        leave the PR open for a manual review/merge instead. Nothing merges before the PR is actually opened.
      </p>
      <div className="compose-form">
        <datalist id="existing-slugs">
          {existingSlugs.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <fieldset className="compose-fieldset" disabled={isPublishing}>
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
                      title={`'${key}' isn't in docs/blog/tags.yml yet -- add it with a default label/description`}
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
                      title={`'${key}' isn't in docs/blog/authors.yml yet -- add it with a default name`}
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
              Parse
            </button>
          </div>
        )}

        <div className="compose-actions">
          <button type="button" className="primary" onClick={() => void handlePublish()}>
            {isPublishing ? 'Publishing…' : 'Create/update & open PR'}
          </button>
          <label
            className="tag-chip"
            title="When checked, the opened PR is told to merge automatically once its required checks pass -- it still doesn't merge immediately"
          >
            <input type="checkbox" checked={autoMerge} onChange={(event) => setAutoMerge(event.target.checked)} />
            Auto-Merge
          </label>
          {pr && (
            <button type="button" onClick={() => navigate(`/pr?pr=${pr}`)}>
              View PR status
            </button>
          )}
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
