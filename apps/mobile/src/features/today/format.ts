const DAY_MS = 1000 * 60 * 60 * 24;

export function formatDate(date: Date): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / DAY_MS);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatVolume(volume: number): string {
  const safeValue = Number.isFinite(volume) ? volume : 0;
  if (safeValue >= 1000) {
    return `${(safeValue / 1000).toFixed(1)}k`;
  }
  return Math.round(safeValue).toString();
}
