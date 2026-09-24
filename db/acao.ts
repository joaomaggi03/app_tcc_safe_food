/**
 * db/acao.ts
 * ---------------------------------------------------------------
 * A REGRA DO PLANO DE AÇÃO CORRETIVA (RF07), pura — sem banco, sem
 * React, sem relógio. Mesmo arranjo do `vencimento.ts`: recebe o "hoje"
 * por parâmetro e devolve a resposta, para poder ser testada fora do
 * aparelho. Quem lê o banco é o `db/consultas.ts`.
 *
 * QUEM CRIA A AÇÃO É O APP: ao concluir a inspeção, cada item
 * inadequado sem ação aberta ganha uma, com o texto de `descricaoGerada`
 * e o prazo de `prazoPadraoEmDias`. O usuário ajusta depois.
 *
 * O QUE É GRAVADO E O QUE É DERIVADO
 * A ação é conteúdo do usuário — o que ele vai fazer e até quando —,
 * então vai para a tabela `acao`. Já a SITUAÇÃO (atrasada, vence hoje,
 * no prazo) nunca é gravada: sai do prazo e do dia de hoje, como o
 * vencimento das trilhas. Uma coluna "atrasada" ficaria errada à meia-noite.
 */

import { diferencaEmDias, somarDias } from './datas';
import { proximoDiaAberto } from './funcionamento';

export type StatusAcao = 'aberta' | 'concluida';

export type SituacaoAcao = 'concluida' | 'atrasada' | 'vence_hoje' | 'no_prazo';

/**
 * Prazo sugerido quando a ação é criada, em dias a partir de hoje.
 * DECISÃO DO APP — a RDC 216 não fixa prazo de correção.
 *
 * O item crítico sugere HOJE porque é, por definição, risco direto à
 * saúde (temperatura de cozimento, lavagem de mãos): não é o tipo de
 * coisa que espera uma semana. Os demais sugerem 7 dias. É só a
 * sugestão inicial; o usuário troca com um toque.
 */
export const PRAZO_PADRAO_CRITICO = 0;
export const PRAZO_PADRAO = 7;

/** Os atalhos de prazo do formulário, em dias a partir de hoje. */
export const ATALHOS_PRAZO = [0, 7, 30] as const;

export function prazoPadraoEmDias(critico: boolean): number {
  return critico ? PRAZO_PADRAO_CRITICO : PRAZO_PADRAO;
}

/**
 * O dia do prazo para um atalho ("em 7 dias").
 *
 * Empurrado para o próximo dia ABERTO, pela mesma regra do vencimento
 * das trilhas: a feirante que abre só aos sábados não deve receber um
 * prazo numa terça, em que não estará na banca para resolver nada.
 */
export function prazoDoAtalho(
  hoje: string,
  dias: number,
  diasFuncionamento: string | null,
): string {
  return proximoDiaAberto(somarDias(hoje, dias), diasFuncionamento);
}

/**
 * Só a DIÁRIA oferece "corrigi na hora".
 *
 * A diária roda com o estabelecimento aberto, e o que falha nela costuma
 * ser do momento (touca, bancada, temperatura de um balcão). A auditoria
 * periódica e a semestral são estruturais — piso, parede, reservatório,
 * documentação — e o que falha nelas raramente se resolve na hora.
 */
export function aceitaCorrecaoNaHora(trilha: 'diario' | 'periodico' | 'semestral'): boolean {
  return trilha === 'diario';
}

/**
 * Este item inadequado precisa de AÇÃO no plano?
 *
 * Não, se foi corrigido na hora — e só a diária aceita essa marca. Na
 * periódica e na semestral, todo inadequado vira ação, mesmo que a marca
 * tenha ficado gravada por algum caminho: a regra não confia na tela.
 */
export function precisaDeAcao(item: {
  trilha: 'diario' | 'periodico' | 'semestral';
  corrigidoNaHora: boolean;
}): boolean {
  return !(aceitaCorrecaoNaHora(item.trilha) && item.corrigidoNaHora);
}

/**
 * O texto da ação que o APP GERA ao concluir a inspeção.
 *
 * Diz O QUE precisa ser atingido — a exigência, com os tópicos do item —
 * e não COMO consertar. O "como" depende do caso (trocar a borracha,
 * chamar o técnico, treinar o funcionário) e não está na norma;
 * escrevê-lo seria inventar conteúdo técnico (regra 4 do CLAUDE.md). O
 * usuário edita o texto para acrescentar o que vai fazer.
 *
 * Os tópicos são o resumo curto que o checklist já mostra; o texto
 * integral da norma seria longo demais para uma linha de plano.
 */
export function descricaoGerada(item: { codigo_rdc: string; topicos: string[] }): string {
  const exigencia = item.topicos.join(' ').trim();
  return exigencia.length > 0
    ? `Adequar ao item ${item.codigo_rdc} da RDC 216: ${exigencia}`
    : `Adequar ao item ${item.codigo_rdc} da RDC 216.`;
}

export interface CalculoAcao {
  situacao: SituacaoAcao;
  /** Negativo quando atrasada; null quando concluída (não há mais prazo a correr). */
  diasParaPrazo: number | null;
}

/** Em que situação a ação está hoje. */
export function situacaoAcao(
  acao: { status: StatusAcao; prazo: string },
  hoje: string,
): CalculoAcao {
  if (acao.status === 'concluida') return { situacao: 'concluida', diasParaPrazo: null };

  const dias = diferencaEmDias(hoje, acao.prazo);
  if (dias < 0) return { situacao: 'atrasada', diasParaPrazo: dias };
  if (dias === 0) return { situacao: 'vence_hoje', diasParaPrazo: 0 };
  return { situacao: 'no_prazo', diasParaPrazo: dias };
}

/** O mínimo que a ordenação precisa saber de uma ação. */
export interface AcaoOrdenavel {
  status: StatusAcao;
  prazo: string;
  critico: number;
  concluida_em: string | null;
}

/**
 * A ordem do plano: o que precisa de atenção primeiro.
 *
 *  1. abertas antes de concluídas;
 *  2. entre as abertas, o prazo mais cedo primeiro — e a atrasada tem,
 *     por definição, o prazo mais antigo, então sobe sozinha;
 *  3. no mesmo prazo, o crítico primeiro;
 *  4. entre as concluídas, a mais recente primeiro.
 *
 * Devolve uma cópia: não mexe na lista recebida.
 */
export function ordenarAcoes<T extends AcaoOrdenavel>(acoes: T[]): T[] {
  return [...acoes].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'aberta' ? -1 : 1;

    if (a.status === 'concluida') {
      return (b.concluida_em ?? '').localeCompare(a.concluida_em ?? '');
    }

    if (a.prazo !== b.prazo) return a.prazo.localeCompare(b.prazo);
    return b.critico - a.critico;
  });
}
