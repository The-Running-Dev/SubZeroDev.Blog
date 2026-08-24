/** Ported unchanged from `tools/blog-mcp/ui/src/lib/formatDate.ts`. Renders an ISO date string (UTC) in the viewer's own local time/timezone as "YYYY.MM.DD @ h:mm AM/PM TZ". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  const timePart = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
  return `${datePart} @ ${timePart}`;
}

/** Converts an ISO date string (UTC) to the "YYYY-MM-DDTHH:mm" shape `<input type="datetime-local">` expects, in the viewer's local timezone. Empty/invalid input yields ''. */
export function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
