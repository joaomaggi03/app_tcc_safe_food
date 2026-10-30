/**
 * db/reincidencia.ts
 * ---------------------------------------------------------------
 * REINCIDÊNCIA: o item que já saiu inadequado nas inspeções ANTERIORES
 * da mesma trilha. Ampliação de escopo pedida pelo autor (29/10/2026).
 *
 * Responde "isto já falhou antes?" na hora de responder o item, e é o
 * que liga a rotina diária ao plano de ação: um item que falha todo dia
 * mostra que o "Corrigi na hora" não está resolvendo, e que o problema
 * pede uma ação corretiva de verdade.
 *
 * As regras, decididas com o autor:
 *  - Diária: conta as últimas 7 diárias (`JANELA_DIARIA`), uma semana de
 *    expediente. Periódica e semestral: só a anterior — contar "3 das
 *    últimas 7" numa auditoria mensal cobriria meio ano.
 *  - "Corrigido na hora" CONTA como inadequado: o item estava inadequado,
 *    e a repetição é justamente o sinal de que a correção imediata não
 *    resolve.
 *  - É DERIVADA, nunca gravada (a regra de sempre). E olha só as
 *    inspeções ANTERIORES à que está sendo vista, então o uso normal do
 *    app não muda o selo de uma inspeção antiga nem o PDF dela. Muda se
 *    inspeções anteriores forem criadas ou apagadas depois — o que só as
 *    ferramentas de teste fazem ("Gerar histórico", "Apagar dados de
 *    teste").
 *  - Não entra no score: é informação a mais, como as pendências.
 *
 * Módulo PURO (padrão do `vencimento.ts`): recebe as inspeções anteriores
 * já lidas do banco (`reincidenciaDaInspecao`, em `db/consultas.ts`) e é
 * testado em `tests/reincidencia.test.js`.
 */

import type { FrequenciaCheck as Trilha } from '../data/rdc216';

/** Quantas diárias anteriores a contagem olha. */
export const JANELA_DIARIA = 7;

/** Quantas inspeções anteriores cada trilha olha. */
export function janelaDaTrilha(trilha: Trilha): number {
  return trilha === 'diario' ? JANELA_DIARIA : 1;
}

export interface Reincidencia {
  /** Em quantas das inspeções olhadas o item saiu inadequado. */
  vezes: number;
  /** Quantas inspeções anteriores foram olhadas (pode ser menos que a janela). */
  de: number;
  /** Saiu inadequado na inspeção IMEDIATAMENTE anterior. */
  naUltima: boolean;
}

/**
 * A reincidência de cada item, a partir das inspeções anteriores.
 *
 * `anteriores` vem da MAIS RECENTE para a mais antiga, cada uma com os ids
 * dos itens que saíram inadequados nela. Só as `janela` primeiras contam.
 * Só aparecem no resultado os itens que falharam ao menos uma vez.
 */
export function reincidencias(
  anteriores: string[][],
  janela: number,
): Record<string, Reincidencia> {
  const olhadas = anteriores.slice(0, Math.max(0, janela));
  const resultado: Record<string, Reincidencia> = {};

  olhadas.forEach((inadequados, posicao) => {
    // Um item repetido na mesma inspeção conta uma vez só.
    for (const itemId of new Set(inadequados)) {
      const atual = resultado[itemId] ?? { vezes: 0, de: olhadas.length, naUltima: false };
      atual.vezes += 1;
      if (posicao === 0) atual.naUltima = true;
      resultado[itemId] = atual;
    }
  });

  return resultado;
}

/**
 * A reincidência de um GRUPO de itens — a verificação da rotina guiada,
 * que cobre vários itens. Vale a do item que mais falhou; no empate, a
 * que falhou na última. Null se nenhum item do grupo falhou.
 */
export function reincidenciaDoGrupo(
  itemIds: string[],
  porItem: Record<string, Reincidencia>,
): Reincidencia | null {
  let pior: Reincidencia | null = null;
  for (const itemId of itemIds) {
    const r = porItem[itemId];
    if (!r) continue;
    if (
      !pior ||
      r.vezes > pior.vezes ||
      (r.vezes === pior.vezes && r.naUltima && !pior.naUltima)
    ) {
      pior = r;
    }
  }
  return pior;
}
