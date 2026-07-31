import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Table from '../lib/Table';

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
        headers={['SHA', 'Author', 'Date', 'Subject']}
        rows={commits.map((c) => [c.sha.slice(0, 10), c.authorName, c.authorDate, c.subject])}
      />
    </>
  );
}
