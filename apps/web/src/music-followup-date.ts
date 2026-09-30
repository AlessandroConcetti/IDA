/** Browser-local wall time, rejected if JS silently normalizes a DST gap or invalid date. */
export function followupDueUtc(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== parts[0] ||
    date.getMonth() + 1 !== parts[1] ||
    date.getDate() !== parts[2] ||
    date.getHours() !== parts[3] ||
    date.getMinutes() !== parts[4]
  )
    return null;
  return date.toISOString();
}
