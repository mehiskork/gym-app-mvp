export function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return { _parseError: true, raw: input };
  }
}
