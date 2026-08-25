// Deterministic CSV serialisation — RFC-4180-ish. No dependencies.
export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

function escapeCell(raw: string | number | null | undefined): string {
  const s = raw === null || raw === undefined ? "" : String(raw);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(","));
  return [head, ...body].join("\r\n") + "\r\n";
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
