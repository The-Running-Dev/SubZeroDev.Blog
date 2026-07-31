import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Health {
  branch: string;
  baseBranch: string;
  dirty: boolean;
  parked: boolean;
  ahead: number;
  behind: number;
}

export default function HealthView() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Health>('/api/repo/health')
      .then((data) => setHealth(data.data ?? null))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!health) return <h2>Repo Health</h2>;

  return (
    <>
      <h2>Repo Health</h2>
      <div className="panel">
        <p>
          Branch: {health.branch} (base: {health.baseBranch})
        </p>
        <p>Dirty: {String(health.dirty)}</p>
        <p>Parked off base: {String(health.parked)}</p>
        <p>
          Ahead/behind vs base: {health.ahead}/{health.behind}
        </p>
      </div>
    </>
  );
}
