/**
 * DataTable Component
 * Standardized responsive table layout container for all CRM modules.
 * Ensures consistent padding, border styling, header structure, internal horizontal scrolling,
 * sticky action columns, loading skeletons, and empty state placeholders.
 */
export default function DataTable({
  children,
  headers = [],
  loading = false,
  error = null,
  emptyMessage = "No records found",
  minWidth = "min-w-[900px]",
  hasActions = false,
}) {
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl shadow-sm text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
        <table className={`w-full text-sm text-left border-collapse ${minWidth}`}>
          {headers.length > 0 && (
            <thead className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 select-none">
              <tr>
                {headers.map((header, idx) => {
                  const isAction = hasActions && idx === headers.length - 1;
                  return (
                    <th
                      key={header.key || idx}
                      className={`p-3.5 text-xs uppercase tracking-wider font-semibold text-slate-600 ${
                        isAction
                          ? "sticky right-0 bg-slate-100 z-10 w-[140px] text-right pr-4 shadow-[-4px_0px_8px_rgba(0,0,0,0.03)]"
                          : header.className || ""
                      }`}
                      style={header.width ? { width: header.width } : undefined}
                    >
                      {header.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
          )}

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr key={rIdx} className="animate-pulse">
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                    </td>
                  ))}
                </tr>
              ))
            ) : children && Array.isArray(children) && children.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length || 1}
                  className="p-10 text-center text-slate-400 text-sm font-medium"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
