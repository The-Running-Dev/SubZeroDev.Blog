import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatDate';

interface DeployRun {
  status: string;
  conclusion: string | null;
  createdAt: string;
  url: string;
}

interface GithubHealth {
  openPrCount: number;
  lastDeployRun: DeployRun | null;
  requiredCheckPassRate: { sampled: number; passed: number };
}

interface Health {
  branch: string;
  baseBranch: string;
  dirty: boolean;
  parked: boolean;
  ahead: number;
  behind: number;
  commitsLast7Days: number;
  daysSinceLastCommit: number | null;
  staleBranches: { count: number; names: string[] };
  github: GithubHealth | null;
  githubNote?: string;
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
        <p>Commits in the last 7 days: {health.commitsLast7Days}</p>
        <p>Days since last commit: {health.daysSinceLastCommit ?? 'unknown'}</p>
        <p>
          Stale branches (30+ days): {health.staleBranches.count}
          {health.staleBranches.count > 0 && ` (${health.staleBranches.names.join(', ')})`}
        </p>
      </div>
      <div className="panel">
        {health.github ? (
          <>
            <p>Open pull requests: {health.github.openPrCount}</p>
            <p>
              Last Docs Deploy run:{' '}
              {health.github.lastDeployRun ? (
                <a href={health.github.lastDeployRun.url} target="_blank" rel="noopener noreferrer">
                  {health.github.lastDeployRun.status}
                  {health.github.lastDeployRun.conclusion ? ` (${health.github.lastDeployRun.conclusion})` : ''} --{' '}
                  {formatDate(health.github.lastDeployRun.createdAt)}
                </a>
              ) : (
                'none found'
              )}
            </p>
            <p>
              Required-check pass rate (last {health.github.requiredCheckPassRate.sampled} commits): {health.github.requiredCheckPassRate.passed}/
              {health.github.requiredCheckPassRate.sampled}
            </p>
          </>
        ) : (
          <p className="muted">{health.githubNote ?? 'GitHub-derived fields unavailable.'}</p>
        )}
      </div>
    </>
  );
}
