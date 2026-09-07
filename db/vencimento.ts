/**
 * db/vencimento.ts
 * ---------------------------------------------------------------
 * A REGRA DE VENCIMENTO, pura — sem banco, sem React, sem relógio.
 *
 * Recebe tudo de que precisa como parâmetro (inclusive o "hoje") e
 * devolve o status. Estar separada assim tem um motivo prático: esta é a
 * regra que a Fase 5 inteira apoia, e é a que mais tem casos de borda —
 * nunca feita, vence hoje, vencida há dias, no limite da antecedência.
 * Sem banco no meio, ela pode ser compilada e testada fora do aparelho.
 *
 * O `db/periodicidade.ts` é quem lê o banco e chama isto aqui.
 */

import { diferencaEmDias, somarDias } from './datas';

export type SituacaoTrilha = 'nunca_feita' | 'vencida' | 'vence_em_breve' | 'em_dia';

export interface CalculoVencimento {
  /** Dia local em que vence — sempre calculado, nunca gravado. */
  proximoVencimento: string;
  /** Negativo = já venceu há N dias. Zero = vence hoje. */
  diasParaVencer: number;
  situacao: SituacaoTrilha;
}

export interface EntradaVencimento {
  /** Dia local da última conclusão, ou null se nunca foi feita. */
  ultimaConclusao: string | null;
  /** Base quando nunca foi feita: a data de cadastro do estabelecimento. */
  dataCadastro: string;
  intervaloDias: number;
  antecedenciaDias: number;
  hoje: string;
}

/**
 * Quando vence, e em que situação está.
 *
 * REGRA DE BORDA que vale entender: quando a trilha nunca foi feita, o
 * prazo conta a partir da data de CADASTRO do estabelecimento. O efeito
 * é que ela nasce vencida (ou quase), e é de propósito — é o que empurra
 * o usuário a fazer o primeiro check, em vez de o app exibir três
 * trilhas "em dia" que nunca foram verificadas.
 *
 * A ordem dos testes importa: "vencida" vem antes de "nunca feita",
 * porque quem nunca fez E já passou do prazo está atrasado de verdade —
 * dizer só "nunca realizada" esconderia o atraso.
 */
export function calcularVencimento(entrada: EntradaVencimento): CalculoVencimento {
  const base = entrada.ultimaConclusao ?? entrada.dataCadastro;
  const proximoVencimento = somarDias(base, entrada.intervaloDias);
  const diasParaVencer = diferencaEmDias(entrada.hoje, proximoVencimento);

  let situacao: SituacaoTrilha;
  if (diasParaVencer < 0) {
    situacao = 'vencida';
  } else if (entrada.ultimaConclusao === null) {
    // Nunca feita e ainda dentro do prazo: não é atraso, mas também não
    // é "em dia" — nada foi verificado ainda.
    situacao = 'nunca_feita';
  } else if (diasParaVencer <= entrada.antecedenciaDias) {
    situacao = 'vence_em_breve';
  } else {
    situacao = 'em_dia';
  }

  return { proximoVencimento, diasParaVencer, situacao };
}
