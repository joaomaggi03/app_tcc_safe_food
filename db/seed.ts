/**
 * db/seed.ts
 * ---------------------------------------------------------------
 * Copia a norma (data/rdc216.ts) para dentro do SQLite.
 *
 * Por que copiar, se os dados já estão num arquivo TypeScript?
 * Porque a partir da Fase 2 o app precisa CRUZAR a norma com os dados
 * do usuário: "quais itens do perfil deste estabelecimento ainda não
 * foram respondidos nesta inspeção e não estão ocultos?". Isso é uma
 * consulta SQL com JOIN — só dá para fazer se tudo estiver no banco.
 *
 * QUANDO O SEED RODA
 * Guardamos VERSAO_SEED na tabela `meta`. O seed só roda se o número
 * gravado no aparelho for diferente do número deste arquivo. Ou seja:
 *  - primeira abertura do app  -> roda;
 *  - aberturas seguintes       -> pula (rápido);
 *  - você editou data/rdc216.ts e subiu a VERSAO_SEED -> roda de novo.
 *
 * IMPORTANTE: o seed só escreve nas tabelas de catálogo. Ele nunca
 * apaga `estabelecimento` nem (nas próximas fases) inspeções e
 * respostas. Recarregar a norma não faz o usuário perder o trabalho dele.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { CATEGORIAS, ITENS, PERFIS } from '../data/rdc216';

/** Suba este número sempre que editar o conteúdo de data/rdc216.ts. */
export const VERSAO_SEED = 1;

const CHAVE_META = 'versao_seed';

/** Converte booleano do TypeScript para o 0/1 do SQLite. */
function bit(valor: boolean | undefined): number {
  return valor ? 1 : 0;
}

export function precisaSemear(db: SQLiteDatabase): boolean {
  const linha = db.getFirstSync<{ valor: string }>(
    'SELECT valor FROM meta WHERE chave = ?',
    CHAVE_META,
  );
  return linha?.valor !== String(VERSAO_SEED);
}

/**
 * Popula perfis, categorias, itens e a tabela de aplicabilidade.
 *
 * Tudo acontece dentro de uma TRANSAÇÃO: ou grava o conjunto inteiro,
 * ou não grava nada. Sem isso, um erro no meio deixaria o banco pela
 * metade (categorias sim, itens não) e o checklist sairia quebrado.
 *
 * Usamos `INSERT OR REPLACE`: se a linha já existe, ela é substituída.
 * Assim o seed pode rodar de novo sem dar erro de chave duplicada — e
 * sem precisar apagar os perfis, que são referenciados por
 * `estabelecimento.perfil_id`.
 */
export function semear(db: SQLiteDatabase): void {
  db.withTransactionSync(() => {
    // A aplicabilidade é dado 100% derivado do seed, então é reconstruída
    // do zero — é a forma mais simples de refletir mudanças no campo
    // `perfis` de um item (inclusive remoções).
    db.runSync('DELETE FROM item_aplicabilidade');

    PERFIS.forEach((perfil, indice) => {
      db.runSync(
        `INSERT OR REPLACE INTO perfil
           (id, nome, descricao, periodicidade_auditoria_dias, ordem)
         VALUES (?, ?, ?, ?, ?)`,
        perfil.id,
        perfil.nome,
        perfil.descricao,
        perfil.periodicidadeAuditoriaDias,
        indice,
      );
    });

    CATEGORIAS.forEach((categoria, indice) => {
      db.runSync(
        `INSERT OR REPLACE INTO categoria
           (id, nome, codigo_rdc, pop_obrigatorio, ordem)
         VALUES (?, ?, ?, ?, ?)`,
        categoria.id,
        categoria.nome,
        categoria.codigoRdc,
        bit(categoria.popObrigatorio),
        indice,
      );
    });

    ITENS.forEach((item, indice) => {
      db.runSync(
        `INSERT OR REPLACE INTO item
           (id, categoria_id, codigo_rdc, texto, frequencia,
            critico, peso, periodicidade_dias, ordem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        item.categoriaId,
        item.codigoRdc,
        item.texto,
        item.frequencia,
        bit(item.critico),
        item.peso,
        // `?? null` porque só os itens semestrais têm esse campo.
        item.periodicidadeDias ?? null,
        indice,
      );

      // Aqui o array `perfis: ['restaurante', 'lanchonete', ...]` do seed
      // vira várias linhas na tabela de ligação — é isso que permite o
      // filtro por perfil (RF03) virar um simples WHERE no SQL.
      item.perfis.forEach((perfilId) => {
        db.runSync(
          'INSERT OR REPLACE INTO item_aplicabilidade (item_id, perfil_id) VALUES (?, ?)',
          item.id,
          perfilId,
        );
      });
    });

    db.runSync(
      'INSERT OR REPLACE INTO meta (chave, valor) VALUES (?, ?)',
      CHAVE_META,
      String(VERSAO_SEED),
    );
  });
}
