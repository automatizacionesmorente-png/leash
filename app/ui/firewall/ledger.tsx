"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useRef, useState } from "react";
import { tool, VERDICT, type Action } from "./types";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "#8a4b22", backgroundColor: "#fffdf8", foregroundColor: "#15130f", borderColor: "#e3ddd0",
  headerBackgroundColor: "#f4f1ea", headerFontWeight: 600, fontFamily: "var(--font-sans), system-ui, sans-serif", fontSize: 13, wrapperBorderRadius: 16,
});

function Verdict({ value }: ICellRendererParams<Action, Action["status"]>) {
  if (!value) return null;
  const v = VERDICT[value];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${v.cls}`}>{v.label}</span>;
}

const COLUMNS: ColDef<Action>[] = [
  { field: "at", headerName: "When", width: 112, sort: "desc", valueFormatter: (p) => new Date(p.value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) },
  { field: "status", headerName: "Verdict", width: 140, cellRenderer: Verdict, filterValueGetter: (p) => VERDICT[p.data!.status].label },
  { field: "tool", headerName: "PayPal tool", width: 165, valueFormatter: (p) => tool(p.value) },
  { field: "amount", headerName: "Amount", width: 110, type: "rightAligned", cellClass: "font-mono" },
  { field: "reasons", headerName: "Why", flex: 1, minWidth: 320, tooltipValueGetter: (p) => p.data!.reasons.join(" "), valueFormatter: (p) => p.value.join(" "), equals: (a: string[], b: string[]) => a.join() === b.join() },
  { field: "customer", headerName: "On behalf of", width: 170 },
  { field: "agent", headerName: "Agent", width: 130 },
  { field: "target", headerName: "Target", width: 190, cellClass: "font-mono" },
  { field: "paypalRef", headerName: "PayPal ID", width: 190, cellClass: "font-mono" },
];

/** Every call any agent made, whether or not it ever reached PayPal. */
export function Ledger({ rows }: { rows: Action[] }) {
  const grid = useRef<AgGridReact<Action>>(null);
  const [search, setSearch] = useState("");
  const defaults = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true, enableCellChangeFlash: true }), []);
  const blocked = rows.filter((r) => r.status === "denied").length;
  return (
    <section className="rounded-3xl border border-line bg-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl">Every move your agents make</h2>
          <p className="mt-1 text-sm text-soft">{rows.length} calls recorded, {blocked} stopped before reaching PayPal.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search everything" aria-label="Search the log" className="rounded-full border border-line bg-paper px-4 py-2 text-sm" />
          <button onClick={() => grid.current?.api.exportDataAsCsv({ fileName: "leash-audit.csv" })} className="rounded-full border border-ink px-4 py-2 text-sm font-semibold">Export audit</button>
        </div>
      </div>
      <div className="mt-4" style={{ height: 380 }}>
        <AgGridReact ref={grid} theme={theme} rowData={rows} columnDefs={COLUMNS} defaultColDef={defaults} getRowId={(p) => p.data.id} quickFilterText={search} pagination paginationPageSize={8} paginationPageSizeSelector={[8, 20, 50]} overlayNoRowsTemplate="No agent has tried anything yet." />
      </div>
    </section>
  );
}
