import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('gym_app.db');

// Split a SQL string into statements (simple, good enough for our migrations).
function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Execute SQL (supports multiple statements separated by ';').
// Params are only supported for single-statement SQL.
export function exec(sql: string, params: SQLite.SQLiteBindValue[] = []) {
  const statements = splitStatements(sql);

  if (statements.length === 0) return;

  if (statements.length > 1 && params.length > 0) {
    throw new Error('exec: params are not supported for multi-statement SQL.');
  }

  for (const stmtSql of statements) {
    if (params.length > 0) {
      const stmt = db.prepareSync(stmtSql);
      try {
        stmt.executeSync(params);
      } finally {
        stmt.finalizeSync();
      }
    } else {
      // For no-params statements, execSync is fine
      db.execSync(stmtSql);
    }
  }
}

export function query<T extends Record<string, unknown>>(
  sql: string,
  params: SQLite.SQLiteBindValue[] = [],
): T[] {
  const stmt = db.prepareSync(sql);
  try {
    const result = stmt.executeSync(params);
    const rows: T[] = [];
    for (const row of result) rows.push(row as T);
    return rows;
  } finally {
    stmt.finalizeSync();
  }
}
