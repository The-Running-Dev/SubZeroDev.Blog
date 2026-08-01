import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Table from '../lib/Table';
import { formatDate } from '../lib/formatDate';
import { useRepoOwner } from '../lib/useRepoOwner';

interface Commit {
  sha: string;
  authorName: string;
  authorDate: string;
  subject: string;
}

export default function LogView() {
  const [ref, setRef] = useState('');
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { owner, repo } = useRepoOwner();

  useEffect(() => {
    api<{ ref: string; commits: Commit[] }>('/api/log?limit=30')
      .then((data) => {
        setRef(data.data?.ref ?? '');
        setCommits(data.data?.commits ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!commits) return <h2>Log</h2>;

  return (
    <>
      <h2>Log ({ref})</h2>
      <Table
        headers={['SHA', 'Author', 'Date', 'Message']}
        rows={commits.map((c) => [
          owner && repo ? (
            <a key="sha" href={`https://github.com/${owner}/${repo}/commit/${c.sha}`} target="_blank" rel="noopener noreferrer">
              {c.sha.slice(0, 10)}
            </a>
          ) : (
            c.sha.slice(0, 10)
          ),
          c.authorName,
          formatDate(c.authorDate),
          c.subject
        ])}
      />
    </>
  );
}
