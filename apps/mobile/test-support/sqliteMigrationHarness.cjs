// Run the production TypeScript DB/transaction/migration code against real Node
// SQLite. Only the Expo native bridge is substituted, including in crash workers.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

function createMigrationHarness(filename = ':memory:') {
  const native = new DatabaseSync(filename);
  let hook = () => {};
  const cache = new Map();
  const bridge = {
    execSync(sql) {
      hook(sql, [], 'before');
      native.exec(sql);
      hook(sql, [], 'after');
    },
    isInTransactionSync: () => native.isTransaction,
    prepareSync(sql) {
      const statement = native.prepare(sql);
      return {
        executeSync(params = []) {
          hook(sql, params, 'before');
          const rows = statement.columns().length
            ? statement.all(...params)
            : (statement.run(...params), []);
          hook(sql, params, 'after');
          return rows;
        },
        finalizeSync() {},
      };
    },
  };

  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = (id) => {
      if (id === 'expo-sqlite') return { openDatabaseSync: () => bridge };
      if (!id.startsWith('.')) throw new Error(`Unexpected migration dependency: ${id}`);
      const resolved = path.resolve(path.dirname(filename), id);
      return load(
        fs.existsSync(`${resolved}.ts`) ? `${resolved}.ts` : path.join(resolved, 'index.ts'),
      );
    };
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
    return module.exports;
  }

  const dbRoot = path.resolve(__dirname, '../src/db');
  const db = load(path.join(dbRoot, 'db.ts'));
  const migration = load(path.join(dbRoot, 'migrate.ts'));
  return {
    native,
    ...db,
    ...migration,
    setHook(nextHook) {
      hook = nextHook;
    },
    close() {
      native.close();
    },
  };
}

module.exports = { createMigrationHarness };
