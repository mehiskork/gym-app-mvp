const SQLITE_TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

export function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;

  if (!value.includes('T')) {
    const match = value.match(SQLITE_TIMESTAMP_REGEX);
    if (!match) return null;

    const parsed = Date.parse(`${match[1]}T${match[2]}Z`);
    return Number.isNaN(parsed) ? null : parsed;
  }

  const normalized = value;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatTimestampForDisplay(
  value: string | number | null | undefined,
  fallback = '—',
): string {
  if (!value) return fallback;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fallback;
    return new Date(value).toLocaleString();
  }
  const parsedMs = parseTimestampMs(value);
  if (parsedMs === null) return value;
  return new Date(parsedMs).toLocaleString();
}