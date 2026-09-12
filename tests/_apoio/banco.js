/**
 * tests/_apoio/banco.js
 * ---------------------------------------------------------------
 * Um banco SQLite de verdade para os testes, com a MESMA interface que
 * o `expo-sqlite` oferece ao app.
 *
 * POR QUE ISSO EXISTE
 * O `db/schema.ts` e o `db/seed.ts` recebem a conexão como parâmetro e
 * chamam `execSync`, `runSync`, `getFirstSync` e `withTransactionSync`.
 * O `node:sqlite` (embutido no Node, sem instalar nada) tem as mesmas
 * capacidades com outros nomes. Este adaptador faz a ponte.
 *
 * O ganho é o que importa: os testes executam a função `migrar()` e a
 * função `semear()` REAIS, as mesmas que rodam no celular — em vez de
 * uma reimplementação no teste, que poderia divergir do app sem ninguém
 * perceber. Se a migração quebrar, o teste quebra junto.
 */

const { DatabaseSync } = require('node:sqlite');

/** Embrulha um DatabaseSync do Node na interface do expo-sqlite. */
function adaptar(db) {
  return {
    execSync: (sql) => db.exec(sql),

    runSync: (sql, ...parametros) => db.prepare(sql).run(...parametros),

    // O expo-sqlite devolve `null` quando não há linha; o node:sqlite
    // devolve `undefined`. A diferença importa: o código do app testa
    // `linha?.valor ?? padrao`.
    getFirstSync: (sql, ...parametros) => db.prepare(sql).get(...parametros) ?? null,

    getAllSync: (sql, ...parametros) => db.prepare(sql).all(...parametros),

    withTransactionSync: (fn) => {
      db.exec('BEGIN');
      try {
        fn();
        db.exec('COMMIT');
      } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
      }
    },

    /** Acesso ao banco cru, para os testes conferirem o que quiserem. */
    cru: db,
  };
}

/** Um banco em memória, vazio, com as chaves estrangeiras ligadas. */
function bancoVazio() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return adaptar(db);
}

module.exports = { adaptar, bancoVazio };
