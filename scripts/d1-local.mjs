// ==========================================================================
// d1-local.mjs — base D1 simulée avec SQLite (node:sqlite, même SQL que D1),
// pour faire tourner les fonctions Cloudflare dans Node : serveur de test
// (scripts/serve.mjs : API du profil joueur en local) et tests
// (scripts/tester-profil.mjs). Rien n'est écrit sur le disque.
// ==========================================================================

import { DatabaseSync } from 'node:sqlite';

/** Base D1 en mémoire : prepare(sql).bind(…).first() / all() / run(), batch([…]). */
export function baseD1() {
  const db = new DatabaseSync(':memory:');
  const instruction = (sql, valeurs = []) => ({
    bind: (...v) => instruction(sql, v),
    first: async () => db.prepare(sql).get(...valeurs) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...valeurs) }),
    run: async () => { const r = db.prepare(sql).run(...valeurs); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return {
    sqlite: db,
    prepare: (sql) => instruction(sql),
    batch: async (liste) => {
      db.exec('BEGIN');
      try {
        const r = [];
        for (const i of liste) r.push(await i.run());
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
