export function newId(prefix: string) {
  // Simple local ID; later we can replace with UUID/ULID without changing callers.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
