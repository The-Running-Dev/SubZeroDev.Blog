import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import Table from '../lib/Table';
import { formatDate } from '../lib/formatDate';

interface PrDetails {
  state: string;
  mergeable: string;
  headRefOid: string;
  url: string;
}

interface PrListItem {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  url: string;
  updatedAt: string;
}

export default function PrStatusView() {
  const [searchParams] = useSearchParams();
  const [prNumber, setPrNumber] = useState(searchParams.get('pr') ?? '');
  const [details, setDetails] = useState<PrDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prs, setPrs] = useState<PrListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function lookup(pr: string) {
    setError(null);
    setDetails(null);
    if (!pr) return;
    try {
      const data = await api<PrDetails>(`/api/pr/${encodeURIComponent(pr)}`);
      setDetails(data.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    const pr = searchParams.get('pr');
    if (pr) void lookup(pr);
    // eslint rules aside: intentionally only re-checking when the URL's own ?pr= changes, not on every render
  }, [searchParams]);

  // Best-effort, like the slug/tag prefetch in Compose -- a failed list
  // fetch shouldn't block the number-based lookup below, which works
  // independently.
  useEffect(() => {
    api<{ prs: PrListItem[] }>('/api/prs')
      .then((data) => setPrs(data.data?.prs ?? []))
      .catch((err: unknown) => setListError(err instanceof Error ? err.message : String(err)));
  }, []);

  function lookupFromRow(pr: number) {
    const value = String(pr);
    setPrNumber(value);
    void lookup(value);
  }

  return (
    <>
      <h2>PR Status</h2>
      {listError && <p className="error">{listError}</p>}
      {prs && (
        <Table
          headers={['#', 'Title', 'State', 'Branch', 'Updated']}
          rows={prs.map((p) => [
            <button key="number" type="button" onClick={() => lookupFromRow(p.number)} title={`Look up PR #${p.number}`}>
              #{p.number}
            </button>,
            <a key="title" href={p.url} target="_blank" rel="noopener noreferrer">
              {p.title}
            </a>,
            `${p.state}${p.isDraft ? ' (draft)' : ''}`,
            p.headRefName,
            formatDate(p.updatedAt)
          ])}
        />
      )}
      <div className="compose-actions">
        <input type="number" placeholder="PR number" value={prNumber} onChange={(event) => setPrNumber(event.target.value)} />
        <button type="button" className="primary" onClick={() => void lookup(prNumber)}>
          Look up
        </button>
      </div>
      <div className="panel">
        {error && <p className="error">{error}</p>}
        {details && (
          <>
            <p>State: {details.state}</p>
            <p>Mergeable: {details.mergeable}</p>
            <p>Head SHA: {details.headRefOid}</p>
            <p>URL: {details.url}</p>
          </>
        )}
      </div>
    </>
  );
}
