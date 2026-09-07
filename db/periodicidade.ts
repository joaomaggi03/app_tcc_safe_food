/**
 * db/periodicidade.ts
 * ---------------------------------------------------------------
 * A PERIODICIDADE DAS TRILHAS (RF05) — Fase 5.
 *
 * Responde a três perguntas, por trilha: quando vence, se já venceu, e
 * quantos dias faltam. Tudo é conta de data sobre o que já está gravado;
 * este arquivo não sabe o que é temperatura nem higiene.
 *
 * POR QUE NÃO HÁ TABELA NOVA
 * O plano previa uma tabela `status_trilha` guardando a última conclusão
 * e o intervalo de cada trilha. Ela não é mais necessária, porque as
 * fases anteriores já gravam as duas coisas:
 *
 *  - a última conclusão está em `inspecao.dia_local` das inspeções
 *    concluídas (Fase 3/4);
 *  - o intervalo da auditoria periódica está em
 *    `estabelecimento.periodicidade_auditoria_dias`, que a Fase 2 já
 *    gravou e deixou editável.
 *
 * Guardar de novo criaria duas fontes para o mesmo fato — e a chance de
 * elas discordarem quando uma inspeção for apagada ou uma gravação
 * falhar no meio. Vencimento é DERIVADO, nunca armazenado; assim ele
 * nunca fica velho.
 *
 * DE ONDE VEM CADA INTERVALO
 * Só um dos três é exigência legal. A RDC 216 quase não fixa frequência
 * de verificação: a única explícita é a da água (180 dias, gravada no
 * próprio item pelo seed). Os outros dois são decisão do app, assumida
 * como boa prática — e é isso que precisa ser justificado no TCC, não a
 * norma.
 */

import { listarInspecoes, TRILHAS, type Estabelecimento, type Trilha } from './consultas';
import { diaLocalISO } from './datas';
import { obterBanco } from './index';
import { calcularVencimento, type SituacaoTrilha } from './vencimento';

// A regra de vencimento em si mora em `db/vencimento.ts`, pura, para
// poder ser testada fora do aparelho. Reexportada porque as telas já
// importam o resto daqui.
export type { SituacaoTrilha };

/**
 * Intervalo da trilha DIÁRIA, em dias. Decisão do app.
 *
 * 1 dia é o óbvio para uma rotina diária, mas vale registrar o limite:
 * quem não abre todos os dias (feirante, ambulante) vai ver a trilha
 * vencida em dia de folga. Tratar isso exigiria saber os dias de
 * funcionamento do estabelecimento — informação que o cadastro não pede
 * hoje, e que fica como trabalho futuro.
 */
export const INTERVALO_DIARIO = 1;

/**
 * Intervalo da trilha SEMESTRAL, em dias. Vem da norma (seção 4.4):
 * laudo de potabilidade e higienização do reservatório a cada 6 meses.
 * É o único valor daqui que o usuário não pode mudar.
 */
export const INTERVALO_SEMESTRAL = 180;

/**
 * Com quantos dias de antecedência avisar, por trilha.
 *
 * O critério é o tempo que a pessoa precisa para AGIR. A diária se
 * resolve no mesmo dia, então avisa no dia. A auditoria periódica pede
 * algumas horas de trabalho, então avisa na semana. O laudo da água
 * depende de terceiros — coletar amostra, laboratório, empresa de
 * limpeza de caixa d'água —, então avisa com um mês.
 */
export const ANTECEDENCIA_DIAS: Record<Trilha, number> = {
  diario: 0,
  periodico: 7,
  semestral: 30,
};

/**
 * A que horas lembrar, em hora local.
 *
 * A diária é concluída no FECHAMENTO (ver `momento` no data/rdc216.ts),
 * então o lembrete dela é no fim do expediente. As outras são tarefas
 * de planejamento, e chegam de manhã.
 */
export const HORA_LEMBRETE: Record<Trilha, number> = {
  diario: 18,
  periodico: 9,
  semestral: 9,
};

export interface StatusTrilha {
  trilha: Trilha;
  intervaloDias: number;
  /** Dia local da última inspeção concluída, ou null se nunca houve. */
  ultimaConclusao: string | null;
  /** Dia local em que vence — sempre calculado, nunca gravado. */
  proximoVencimento: string;
  /** Negativo = já venceu há N dias. Zero = vence hoje. */
  diasParaVencer: number;
  situacao: SituacaoTrilha;
  /** Quantos dias antes do vencimento o alerta dispara. */
  antecedenciaDias: number;
}

// ---------------------------------------------------------------
// O STATUS DE CADA TRILHA
// ---------------------------------------------------------------

/**
 * O intervalo de uma trilha para um estabelecimento.
 *
 * A periódica é a única que vem do estabelecimento, porque é a única
 * que o usuário pode ajustar.
 */
export function intervaloDaTrilha(estabelecimento: Estabelecimento, trilha: Trilha): number {
  if (trilha === 'diario') return INTERVALO_DIARIO;
  if (trilha === 'semestral') return INTERVALO_SEMESTRAL;
  return estabelecimento.periodicidade_auditoria_dias;
}

/** O dia da última inspeção concluída de uma trilha, ou null. */
export function ultimaConclusao(estabelecimentoId: number, trilha: Trilha): string | null {
  const linha = obterBanco().getFirstSync<{ dia: string | null }>(
    `SELECT MAX(dia_local) AS dia
       FROM inspecao
      WHERE estabelecimento_id = ? AND trilha = ? AND status = 'concluida'`,
    estabelecimentoId,
    trilha,
  );
  return linha?.dia ?? null;
}

/**
 * O status de uma trilha: lê o banco e entrega à regra pura de
 * `db/vencimento.ts`, que é quem decide a situação.
 */
export function statusDaTrilha(
  estabelecimento: Estabelecimento,
  trilha: Trilha,
  hoje: string = diaLocalISO(),
): StatusTrilha {
  const intervaloDias = intervaloDaTrilha(estabelecimento, trilha);
  const conclusao = ultimaConclusao(estabelecimento.id, trilha);
  const antecedenciaDias = ANTECEDENCIA_DIAS[trilha];

  const calculo = calcularVencimento({
    ultimaConclusao: conclusao,
    dataCadastro: estabelecimento.data_cadastro,
    intervaloDias,
    antecedenciaDias,
    hoje,
  });

  return {
    trilha,
    intervaloDias,
    ultimaConclusao: conclusao,
    antecedenciaDias,
    ...calculo,
  };
}

/** O status das três trilhas, na ordem em que aparecem para o usuário. */
export function statusDasTrilhas(
  estabelecimento: Estabelecimento,
  hoje: string = diaLocalISO(),
): StatusTrilha[] {
  return TRILHAS.map((trilha) => statusDaTrilha(estabelecimento, trilha, hoje));
}

/**
 * A trilha que pede atenção primeiro, ou null se está tudo em dia.
 * Alimenta o destaque do Início: uma chamada só, a mais urgente.
 */
export function trilhaMaisUrgente(
  estabelecimento: Estabelecimento,
  hoje: string = diaLocalISO(),
): StatusTrilha | null {
  const pendentes = statusDasTrilhas(estabelecimento, hoje).filter(
    (status) => status.situacao !== 'em_dia',
  );
  if (pendentes.length === 0) return null;

  // Menor prazo primeiro; o que está mais atrasado tem o número mais
  // negativo, então a mesma ordenação serve para vencidas e a vencer.
  return pendentes.sort((a, b) => a.diasParaVencer - b.diasParaVencer)[0];
}

/**
 * Atualiza o intervalo da auditoria periódica.
 *
 * É o único intervalo editável: a diária é 1 por definição e a semestral
 * é prazo legal. Um limite de 1 a 365 evita valores que quebrariam a
 * conta (zero, negativo) ou que tornariam a trilha inútil.
 */
export function definirIntervaloPeriodico(estabelecimentoId: number, dias: number): void {
  const limitado = Math.max(1, Math.min(365, Math.round(dias)));
  obterBanco().runSync(
    'UPDATE estabelecimento SET periodicidade_auditoria_dias = ? WHERE id = ?',
    limitado,
    estabelecimentoId,
  );
}

/**
 * Relê o estabelecimento depois de mexer no intervalo.
 *
 * Necessário porque `definirIntervaloPeriodico` limita o valor (1 a
 * 365): quem digitou 900 precisa ver 365 na tela, e não o que digitou.
 */
export function obterEstabelecimentoAtualizado(estabelecimentoId: number): Estabelecimento {
  return obterBanco().getFirstSync<Estabelecimento>(
    'SELECT * FROM estabelecimento WHERE id = ?',
    estabelecimentoId,
  )!;
}

/** Quantas inspeções concluídas a trilha já teve (para o Início). */
export function totalConcluidas(estabelecimentoId: number, trilha: Trilha): number {
  return listarInspecoes(estabelecimentoId, { trilha, somenteConcluidas: true }).length;
}
