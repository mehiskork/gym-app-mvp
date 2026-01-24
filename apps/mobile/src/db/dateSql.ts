/**
 * Returns a SQLite expression that computes the Monday week start (ISO-like) in UTC.
 * SQLite date/strftime functions operate in UTC unless a localtime modifier is applied.
 */
export const weekStartExpression = (column: string): string =>
    `date(${column}, '-' || ((CAST(strftime('%w', ${column}) AS INTEGER) + 6) % 7) || ' days')`;