/* Adaptador que faz o SQLite do Node falar a interface do Cloudflare D1.
   Assim os testes rodam o schema.sql de verdade e as mesmas consultas que
   vão para produção — não uma imitação do banco. */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function criarD1(schemaPath) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(readFileSync(schemaPath, "utf8"));

  return {
    _sqlite: sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let args = [];
      const api = {
        bind(...vals) { args = vals; return api; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { stmt.run(...args); return { success: true }; },
      };
      return api;
    },
  };
}
