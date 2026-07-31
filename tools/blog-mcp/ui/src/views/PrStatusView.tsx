import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

interface PrDetails {
  state: string;
  mergeable: string;
  headRefOid: string;
  url: string;
}

export default function PrStatusView() {
  const [searchParams] = useSearchParams();
  const [prNumber, setPrNumber] = useState(searchParams.get('pr') ?? '');
  const [details, setDetails] = useState<PrDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Deep-linked here (e.g. `/pr?pr=99` after opening a PR from Compose or
  // deleting a post) -- look it up immediately rather than making the user
  // re-type the number they just saw.
  useEffect(() => {
    const pr = searchParams.get('pr');
    if (pr) void lookup(pr);
  }, [searchParams]);

  return (
    <>
      <h2>PR status</h2>
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
