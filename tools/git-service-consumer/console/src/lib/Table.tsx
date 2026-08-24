import type { ReactNode } from 'react';

interface TableProps {
  headers: string[];
  rows: ReactNode[][];
}

/** Ported unchanged from `tools/blog-mcp/ui/src/lib/Table.tsx`. */
export default function Table({ headers, rows }: TableProps) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
