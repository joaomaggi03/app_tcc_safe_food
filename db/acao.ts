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
 *
 * Os tópicos são separados por "; ", como na coluna "Exigência" do PDF.
 * Com espaço simples, viravam uma frase só com maiúscula no meio
 * ("…laváveis Sem rachaduras…", "…alimento Ou combinação…").
 */
export function descricaoGerada(item: { codigo_rdc: string; topicos: string[] }): string {
  const exigencia = item.topicos
    .map((topico) => topico.trim())
    .filter((topico) => topico.length > 0)
    .join('; ');
  return exigencia.length > 0
    ? `Adequar ao item ${item.codigo_rdc} da RDC 216: ${exigencia}`
    : `Adequar ao item ${item.codigo_rdc} da RDC 216.`;
}

/** Um passo do plano pronto, como sai do banco (tabela `plano_passo`). */
export interface PassoDoPlano {
  texto: string;
  origem_tipo: 'norma' | 'complemento';
  origem_ref: string;
}

/**
 * O texto da ação quando o item tem PLANO PRONTO (entrega 4 dos pedidos
 * do orientador; catálogo em `data/planos-acao.ts`).
 *
 * Aqui o "como" pode aparecer, ao contrário do `descricaoGerada`, porque
 * não é o app inventando: cada passo foi revisado pelo autor e diz de
 * onde veio — o artigo da RDC, ou a fonte do complemento. A origem vai
 * no próprio texto porque a ação tem um campo só, e o usuário que editar
 * continua vendo o que é norma e o que não é.
 *
 * Sem passos (item sem plano, ou nenhum passo vale para o perfil), cai
 * no texto genérico.
 */
export function descricaoDaAcao(
  item: { codigo_rdc: string; topicos: string[] },
  passos: PassoDoPlano[],
): string {
  if (passos.length === 0) return descricaoGerada(item);

  const linhas = passos.map((passo, indice) => {
    const origem =
      passo.origem_tipo === 'norma'
        ? `RDC ${passo.origem_ref}`
        : `boa prática — fonte: ${passo.origem_ref}`;
    return `${indice + 1}. ${passo.texto} (${origem})`;
  });
  return [`Plano para o item ${item.codigo_rdc} da RDC 216:`, ...linhas].join('\n');
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

// ---------------------------------------------------------------
// ALERTA DE PRAZO DAS AÇÕES
// ---------------------------------------------------------------

/**
 * A que horas o alerta de prazo toca. De manhã, como os lembretes da
 * auditoria e da água (`HORA_LEMBRETE`): é tarefa de planejamento, e
 * avisar às 9h deixa o dia inteiro para resolver. DECISÃO DO APP.
 */
export const HORA_ALERTA_ACAO = 9;

/**
 * Quantos dias de alerta ficam agendados, no máximo — os mais próximos.
 * O iOS guarda só 64 notificações agendadas por app; com as 3 das
 * trilhas e as até 21 das etapas, sobram folgadas.
 */
export const MAX_DIAS_ALERTA_ACAO = 10;

/** O mínimo que o alerta precisa saber de uma ação ABERTA. */
export interface PrazoDeAcao {
  /** Dia local, 'AAAA-MM-DD'. */
  prazo: string;
  critico: boolean;
}

/** Um alerta por DIA, juntando as ações daquele dia. */
export interface AlertaAcao {
  /** Dia local em que toca, às `HORA_ALERTA_ACAO`. */
  dia: string;
  /** Ações cujo prazo é este dia. */
  vencem: number;
  /** Ações cujo prazo já passou neste dia. */
  atrasadas: number;
  /** Quantas, das duas contas acima, são de item crítico. */
  criticas: number;
}

export interface EntradaAlertasAcao {
  acoes: PrazoDeAcao[];
  hoje: string;
  /** Minuto de agora: o horário de hoje que já passou não serve mais. */
  minutoAgora: number;
  diasFuncionamento: string | null;
}

/**
 * Os alertas de prazo das ações abertas, em ordem de dia.
 *
 * AS REGRAS:
 *  - Toca NO DIA DO PRAZO, às 9h. Não há aviso antecipado: o prazo já é
 *    curto (hoje ou 7 dias) e a ação está à vista no plano.
 *  - Prazo em dia FECHADO vai para o próximo dia aberto — mesma regra
 *    do vencimento das trilhas. Nesse dia a ação já aparece atrasada,
 *    e o texto diz isso.
 *  - Ação ATRASADA (ou cujo horário de hoje já passou) toca na próxima
 *    ocorrência das 9h em dia aberto: o mesmo tratamento do lembrete da
 *    trilha atrasada. Como o agendamento é refeito ao abrir o app, quem
 *    continua atrasado é lembrado de novo — sem repetir no mesmo dia.
 *  - UM alerta por dia, com a contagem, e não um por ação: cinco itens
 *    inadequados numa auditoria seriam cinco notificações na mesma hora.
 *  - No máximo `MAX_DIAS_ALERTA_ACAO` dias, os mais próximos.
 */
export function alertasDeAcao(entrada: EntradaAlertasAcao): AlertaAcao[] {
  const { hoje, diasFuncionamento } = entrada;

  // O primeiro dia em que ainda dá para tocar às 9h.
  const primeiroPossivel = proximoDiaAberto(
    entrada.minutoAgora < HORA_ALERTA_ACAO * 60 ? hoje : somarDias(hoje, 1),
    diasFuncionamento,
  );

  const porDia = new Map<string, AlertaAcao>();
  for (const acao of entrada.acoes) {
    const noPrazo = proximoDiaAberto(acao.prazo, diasFuncionamento);
    // 'AAAA-MM-DD' compara certo como texto.
    const dia = noPrazo < primeiroPossivel ? primeiroPossivel : noPrazo;

    const alerta = porDia.get(dia) ?? { dia, vencem: 0, atrasadas: 0, criticas: 0 };
    if (acao.prazo < dia) alerta.atrasadas += 1;
    else alerta.vencem += 1;
    if (acao.critico) alerta.criticas += 1;
    porDia.set(dia, alerta);
  }

  return [...porDia.values()]
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .slice(0, MAX_DIAS_ALERTA_ACAO);
}

/** Título e corpo do alerta de prazo de um dia. */
export function textoDoAlertaDeAcao(
  alerta: AlertaAcao,
  nome: string,
): { titulo: string; corpo: string } {
  const partes: string[] = [];
  if (alerta.atrasadas > 0) {
    partes.push(alerta.atrasadas === 1 ? '1 ação atrasada' : `${alerta.atrasadas} ações atrasadas`);
  }
  if (alerta.vencem > 0) {
    partes.push(alerta.vencem === 1 ? '1 ação vence hoje' : `${alerta.vencem} ações vencem hoje`);
  }
  const criticas =
    alerta.criticas === 0
      ? ''
      : alerta.criticas === 1
        ? ' Uma delas é de item crítico.'
        : ` ${alerta.criticas} são de item crítico.`;
  const total = alerta.atrasadas + alerta.vencem;

  return {
    titulo:
      alerta.atrasadas > 0
        ? 'Plano de ação com atraso'
        : total === 1
          ? 'Ação corretiva vence hoje'
          : 'Ações corretivas vencem hoje',
    corpo: `${partes.join(' e ')} no plano do ${nome}.${criticas} Toque para abrir o plano.`,
  };
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
