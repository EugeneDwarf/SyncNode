export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

export function formatLocalTime(date: Date): string {
  const h = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${h}:${min}`;
}
