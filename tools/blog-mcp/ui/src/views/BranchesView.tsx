import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Table from '../lib/Table';

interface Branch {
  name: string;
  current: boolean;
  ahead: number;
  behind: number;
}

export default function BranchesView() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ branches: Branch[] }>('/api/branches')
      .then((data) => setBranches(data.data?.branches ?? []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!branches) return <h2>Branches</h2>;

  return (
    <>
      <h2>Branches</h2>
      <Table
        headers={['Name', 'Current', 'Ahead', 'Behind']}
        rows={branches.map((b) => [b.name, b.current ? 'yes' : '', b.ahead, b.behind])}
      />
    </>
  );
}
