import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, post } from '../lib/api';
import Table from '../lib/Table';

interface Post {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  canonicalUrl?: string;
}

export default function PostsView() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    try {
      const data = await api<{ posts: Post[] }>('/api/posts');
      setPosts(data.data?.posts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDelete(slug: string) {
    // Deleting a *published, live* post is more consequential than the
    // create/update flow this UI already gates behind a separate,
    // explicit arm-auto-merge step (broken inbound links, RSS/Atom
    // entries, search indexing) -- confirm before driving the same
    // guided branch -> delete -> stage -> commit -> push -> PR pipeline.
    if (!window.confirm(`Delete '${slug}'? This opens a PR removing it -- arming auto-merge is still a separate step.`)) {
      return;
    }
    setDeleting(slug);
    try {
      const branchResult = await post<{ branch: string }>('/api/branch', { slug, kind: 'blog', checkoutExisting: true });
      const branch = branchResult.data?.branch as string;

      // blog_delete_post stages the removal itself via `git rm -f`, so
      // there's no separate /api/stage call here, unlike create/update
      // (which write the file, then stage it as its own explicit step).
      await post(`/api/posts/${encodeURIComponent(slug)}/delete`, {});
      await post('/api/commit', { type: 'chore', scope: 'blog', summary: `remove ${slug}` });
      const pushResult = await post<{ branch: string }>('/api/push', {});
      const prResult = await post<{ pr: number; url: string }>('/api/pr', {
        title: `Remove ${slug}`,
        body: 'Deletion published via blog-mcp’s UI.',
        head: pushResult.data?.branch ?? branch
      });
      navigate(`/pr?pr=${prResult.data?.pr}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(null);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!posts) return <h2>Posts</h2>;

  return (
    <>
      <h2>Posts</h2>
      <Table
        headers={['Date', 'Title', 'Slug', 'Tags', 'Actions']}
        rows={posts.map((p) => [
          p.date,
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
            <Link to={`/compose/${encodeURIComponent(p.slug)}`}>
              <button type="button">Edit</button>
            </Link>
            <button type="button" disabled={deleting === p.slug} onClick={() => void handleDelete(p.slug)}>
              Delete
            </button>
          </span>
        ])}
      />
    </>
  );
}
