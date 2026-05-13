import { useEffect, useMemo, useRef, useState } from 'react';

import { parseTimestampMs } from '../../utils/timestamp';

export function getDurationMinutes(startedAt: string | null | undefined, nowMs: number): number {
  if (!startedAt) return 0;
  const startTime = parseTimestampMs(startedAt);
  if (startTime === null) return 0;
  const diffMs = Math.max(0, nowMs - startTime);
  return Math.round(diffMs / 60000);
}

export function useSessionTick(startedAt: string | null | undefined): {
  tick: number;
  durationMinutes: number;
} {
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // lightweight timer tick for countdown UI (DB remains source of truth)
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, []);

  const durationMinutes = useMemo(
    () => getDurationMinutes(startedAt, Date.now()),
    [startedAt, tick],
  );

  return { tick, durationMinutes };
}
