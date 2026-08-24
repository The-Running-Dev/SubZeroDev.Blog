import { useEffect, useState } from 'react';
import type { ConsoleViewProps } from '@subzerodev-git/console';
import { commit, deletePost, listPosts, openPullRequest, prepareBranch, push, type PostSummary } from './lib/tool-api.ts';
import Table from './lib/Table.tsx';
import { formatDate } from './lib/format-date.ts';

/**
 * Ported from `tools/blog-mcp/ui/src/views/PostsView.tsx` (S37.1). Every
 * request carries `declarationId` (S37.3) via the tool-dispatch route's URL
 * path; nothing here assumes the blog is the only declaration selected.
 *
 * `react-router-dom`'s `Link`/`useNavigate` are dropped: `ConsoleViewProps`
 * carries only `declarationId` (`console/src/view-registry.ts`), so there is
 * no route to jump into Compose with a slug prefilled. "Edit" instead tells
 * the author to load the slug from Compose's own existing-slug picker.
 */
export default function BlogPostsView({ declarationId }: ConsoleViewProps) {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [lastPr, setLastPr] = useState<{ number: number; url: string } | null>(null);

  async function load() {
    try {
      const { posts: loaded } = await listPosts(declarationId);
      setPosts([...loaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    setPosts(null);
    setError(null);
    void load();
    // eslint rules aside: re-loads whenever the selected declaration changes.
  }, [declarationId]);

  async function handleDelete(slug: string) {
    if (!window.confirm(`Delete '${slug}'? This opens a PR removing it -- enabling auto-merge is still a separate step.`)) {
      return;
    }
    setDeleting(slug);
    setError(null);
    try {
      const branchResult = await prepareBranch(declarationId, `blog/${slug}`);
      // delete_post runs `git rm -f`, which deletes and stages the removal in one step -- staging it
      // again here would fail (`git add` on a path already removed from the index and working tree).
      await deletePost(declarationId, slug);
      const commitResult = await commit(declarationId, `chore(blog): remove ${slug}`);
      const pushResult = await push(declarationId, commitResult.branch ?? branchResult.branch);
      const { ref } = await openPullRequest(declarationId, `Remove ${slug}`, 'Deletion published via the console.', pushResult.branch);
      setLastPr({ number: ref.number, url: ref.url });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(null);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!posts) return <h2>Posts</h2>;

  return (
    <>
      <h2>Posts</h2>
      <p className="muted">
        Use Compose to add or edit a post -- Compose&apos;s own slug field lists every existing slug to load. &quot;Delete&quot; opens a
        PR that removes the post -- it does not merge or take the post down by itself; that still needs a separate, explicit
        auto-merge or manual merge on the PR it opens.
      </p>
      {lastPr && (
        <p className="muted">
          Opened{' '}
          <a href={lastPr.url} target="_blank" rel="noopener noreferrer">
            PR #{lastPr.number}
          </a>
          .
        </p>
      )}
      <Table
        headers={['Date', 'Title', 'Slug', 'Tags', 'Actions']}
        rows={posts.map((p) => [
          formatDate(p.date),
          p.canonicalUrl ? (
            <a
              key="title"
              href={p.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Computed canonical URL -- not a confirmation this post is deployed"
            >
              {p.title}
            </a>
          ) : (
            p.title
          ),
          p.slug,
          p.tags.join(', '),
          <span key="actions" className="compose-actions">
            <button type="button" disabled={deleting === p.slug} onClick={() => void handleDelete(p.slug)}>
              Delete
            </button>
          </span>,
        ])}
      />
    </>
  );
}
