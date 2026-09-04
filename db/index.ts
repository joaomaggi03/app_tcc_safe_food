/**
 * db/index.ts
 * ---------------------------------------------------------------
 * A PORTA DE ENTRADA do banco. Todo o resto do app pega a conexão
 * chamando `obterBanco()` — ninguém abre o SQLite por conta própria.
 *
 * O truque das três linhas abaixo: a conexão é aberta uma vez só e
 * guardada na variável `banco`. Na primeira chamada, o banco é aberto,
 * migrado (cria as tabelas) e semeado (carrega a norma). Da segunda
 * chamada em diante, devolve a conexão que já existe.
 *
 * Usamos a API SÍNCRONA do expo-sqlite (`openDatabaseSync`, `runSync`,
 * `getAllSync`). É mais simples de ler para quem está começando — sem
 * async/await — e é rápida o bastante: são ~80 itens, não milhares.
 */

import * as SQLite from 'expo-sqlite';
import { migrar } from './schema';
import { precisaSemear, semear } from './seed';

/** Nome do arquivo do banco dentro do app, no aparelho. */
const NOME_BANCO = 'rdc216.db';

let banco: SQLite.SQLiteDatabase | null = null;

export function obterBanco(): SQLite.SQLiteDatabase {
  if (banco) return banco;

  banco = SQLite.openDatabaseSync(NOME_BANCO);

  // WAL deixa leitura e escrita mais rápidas em apps móveis.
  // foreign_keys = ON faz o SQLite realmente cobrar as chaves
  // estrangeiras (por padrão, ele as ignora!).
  banco.execSync('PRAGMA journal_mode = WAL');
  banco.execSync('PRAGMA foreign_keys = ON');

  migrar(banco);

  if (precisaSemear(banco)) {
    semear(banco);
  }

  return banco;
}

/**
 * Apaga o banco inteiro e recria do zero.
 * Só para desenvolvimento — útil quando você mexe no schema e quer
 * começar limpo sem precisar desinstalar o app.
 */
export function resetarBanco(): void {
  banco?.closeSync();
  banco = null;
  SQLite.deleteDatabaseSync(NOME_BANCO);
  obterBanco();
}
