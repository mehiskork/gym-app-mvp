import { parseTimestampMs } from './timestamp';

export function formatDateTime(iso: string): string {
  const parsedMs = parseTimestampMs(iso);
  if (parsedMs === null) return iso;
  return new Date(parsedMs).toLocaleString();
}

export function durationSeconds(startIso: string, endIso: string | null): number | null {
  if (!endIso) return null;
  const s = parseTimestampMs(startIso);
  const e = parseTimestampMs(endIso);
  if (s === null || e === null) return null;
  const sec = Math.max(0, Math.floor((e - s) / 1000));
  return sec;
}

export function formatDurationSeconds(sec: number | null): string {
  if (sec === null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function formatNumber(n: number, decimals = 2): string {
  return n % 1 === 0 ? String(Math.trunc(n)) : n.toFixed(decimals);
}

export function formatOptionalNumber(n: number | null, decimals = 2): string {
  if (n === null) return '';
  return formatNumber(n, decimals);
}

export function formatKg(n: number): string {
  return formatNumber(n, 1);
}

export function formatVolume(n: number): string {
  return Math.round(n).toLocaleString();
}

export function formatWeekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return `Week of ${d.toLocaleDateString()}`;
}

export function secondsElapsed(startAt: string | null): number {
  if (!startAt) return 0;
  const startMs = parseTimestampMs(startAt);
  if (startMs === null || !Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
}

export function getRemainingSeconds(endAt: string | null): number {
  if (!endAt) return 0;
  const endMs = parseTimestampMs(endAt);
  if (endMs === null || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
}

export function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatRestCountdown(totalSeconds: number): string {
  return formatMMSS(Math.max(0, totalSeconds));
}
