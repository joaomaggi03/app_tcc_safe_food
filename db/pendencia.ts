/**
 * db/pendencia.ts
 * ---------------------------------------------------------------
 * AS PENDÊNCIAS DA DIÁRIA — puro, sem banco.
 *
 * Pedido do orientador (20/10/2026), entrega 2. Com as janelas de
 * horário (`db/janela.ts`), um item da diária pode ficar SEM RESPOSTA e
 * sem chance de ser respondido: a etapa dele encerrou. Isso é uma
 * pendência — uma verificação que não foi feita a tempo.
 *
 * A REGRA: um item previsto na diária é pendência quando não tem
 * resposta E a etapa dele está encerrada. A etapa encerra de três jeitos:
 *  - a inspeção foi CONCLUÍDA: quem conclui declara o dia fechado, e o
 *    que ficou sem resposta não vai mais ser verificado;
 *  - o DIA passou: a diária de ontem, largada aberta, não volta;
 *  - a JANELA da etapa fechou (só com horário cadastrado).
 * Sem horário, então, só há pendência no fim: na conclusão ou na virada
 * do dia — e é o mesmo comportamento de antes das janelas.
 *
 * O QUE PENDÊNCIA NÃO É
 *  - "Não observado": esse é uma RESPOSTA — alguém olhou e não conseguiu
 *    observar. Pendência é não ter olhado.
 *  - Inadequado: pendência não entra no score. Não verificar e verificar
 *    e achar errado são perguntas diferentes, como já é com a sequência
 *    de dias (adesão ≠ conformidade). Misturar as duas no mesmo número
 *    esconderia as duas.
 *
 * É DERIVADA, NUNCA GRAVADA, como o score e o vencimento. Os fatos que
 * ela precisa ficam congelados na inspeção (schema v12), desde a
 * ABERTURA: os itens previstos e o horário daquele dia. Por isso mudar o
 * horário ou ocultar um item hoje não reescreve as pendências de
 * setembro — nem as de uma diária largada aberta.
 */

import type { MomentoDia } from '../data/rdc216';
import { situacaoDaEtapa, type Horarios } from './janela';

export type PorEtapa = Record<MomentoDia, number>;

export interface Pendencias {
  total: number;
  porEtapa: PorEtapa;
}

/** Um item que a diária tinha, com a etapa em que ele é verificado. */
export interface ItemPrevisto {
  id: string;
  momento: MomentoDia;
}

export interface EntradaPendencias {
  previstos: ItemPrevisto[];
  /** Ids dos itens com resposta (qualquer uma das quatro). */
  respondidos: ReadonlySet<string>;
  concluida: boolean;
  /** O horário congelado na inspeção; null = sem janela. */
  horarios: Horarios | null;
  /** O dia a que a inspeção pertence ('AAAA-MM-DD'). */
  dia: string;
  /** Hoje e o minuto de agora, no fuso do aparelho. */
  hoje: string;
  minuto: number;
}

export function semPendencias(): Pendencias {
  return { total: 0, porEtapa: { abertura: 0, servico: 0, fechamento: 0 } };
}

/** A etapa já não aceita resposta nesta inspeção? */
export function etapaEncerrada(
  momento: MomentoDia,
  entrada: Pick<EntradaPendencias, 'concluida' | 'horarios' | 'dia' | 'hoje' | 'minuto'>,
): boolean {
  if (entrada.concluida) return true;
  if (entrada.dia < entrada.hoje) return true;
  return (
    situacaoDaEtapa(momento, entrada.horarios, entrada.dia, entrada.hoje, entrada.minuto) ===
    'encerrada'
  );
}

/** As pendências de uma diária, no total e por etapa. */
export function contarPendencias(entrada: EntradaPendencias): Pendencias {
  const resultado = semPendencias();
  for (const item of entrada.previstos) {
    if (entrada.respondidos.has(item.id)) continue;
    if (!etapaEncerrada(item.momento, entrada)) continue;
    resultado.porEtapa[item.momento] += 1;
    resultado.total += 1;
  }
  return resultado;
}

/**
 * As etapas COMPLETAS: todos os itens previstos delas respondidos.
 * Etapa sem item previsto conta como completa — não há o que fazer.
 *
 * Uma regra só para a tela (reagendar quando uma etapa completa) e o
 * banco (`etapasFeitasHoje`, que decide quais alertas tocam). Antes eram
 * duas versões que coincidiam só por causa do dado (achado do `fiscal`).
 */
export function etapasCompletas(
  previstos: ItemPrevisto[],
  respondidos: ReadonlySet<string>,
): Set<MomentoDia> {
  const completas = new Set<MomentoDia>(['abertura', 'servico', 'fechamento']);
  for (const item of previstos) {
    if (!respondidos.has(item.id)) completas.delete(item.momento);
  }
  return completas;
}

/** Soma as pendências de várias diárias — o total do mês. */
export function somarPendencias(lista: Pendencias[]): Pendencias {
  const soma = semPendencias();
  for (const pendencias of lista) {
    soma.total += pendencias.total;
    for (const momento of Object.keys(soma.porEtapa) as MomentoDia[]) {
      soma.porEtapa[momento] += pendencias.porEtapa[momento];
    }
  }
  return soma;
}
