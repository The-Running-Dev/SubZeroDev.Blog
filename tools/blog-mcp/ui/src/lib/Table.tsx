import type { ReactNode } from 'react';

interface TableProps {
  headers: string[];
  rows: ReactNode[][];
}

/** Ported from the vanilla UI's table() helper -- same card-wrapped, zebra-striped table.css treatment. */
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
          {/* Index as key: rows have no stable id of their own, and this table is never reordered in place. */}
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
