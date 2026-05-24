export type ParsedSetInput =
  | {
      ok: true;
      value: number | null;
    }
  | {
      ok: false;
    };

const WEIGHT_INPUT_RE = /^[0-9]+([.,][0-9])?$/;
const REPS_INPUT_RE = /^[0-9]+$/;

export function parseWeightInput(input: string): ParsedSetInput {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (!WEIGHT_INPUT_RE.test(trimmed)) return { ok: false };

  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > 999.9) return { ok: false };

  return { ok: true, value };
}

export function parseRepsInput(input: string): ParsedSetInput {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (!REPS_INPUT_RE.test(trimmed)) return { ok: false };

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 0 || value > 999) return { ok: false };

  return { ok: true, value };
}

export function formatWeightInputValue(value: number | null): string {
  if (value === null) return '';
  return value % 1 === 0 ? String(Math.trunc(value)) : value.toFixed(1).replace('.', ',');
}

export function formatRepsInputValue(value: number | null): string {
  return value === null ? '' : String(value);
}
