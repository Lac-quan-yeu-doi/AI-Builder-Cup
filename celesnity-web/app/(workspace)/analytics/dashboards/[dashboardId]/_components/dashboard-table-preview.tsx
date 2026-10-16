import type { OutputColumn, ParameterValue } from '@/src/entities/models/canonical-chart';

export function DashboardTablePreview({
  columns,
  rows,
}: {
  readonly columns: readonly OutputColumn[];
  readonly rows: readonly (readonly ParameterValue[])[];
}) {
  return (
    <div className="h-full w-full min-w-0 overflow-auto rounded-md border border-border">
      <table className="w-full border-collapse text-body-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.name}
                scope="col"
                className="sticky top-0 border-b border-border bg-card p-2 text-left font-medium"
              >
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, columnIndex) => (
                <td
                  key={`${column.name}-${columnIndex}`}
                  className="border-b border-border p-2 whitespace-nowrap"
                >
                  {String(row[columnIndex] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
