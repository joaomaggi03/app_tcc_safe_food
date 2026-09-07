/**
 * theme/rotulos.ts
 * ---------------------------------------------------------------
 * OS TEXTOS E FORMATOS que aparecem na tela, num lugar só.
 *
 * Mesma ideia do theme/cores.ts: o banco guarda códigos curtos
 * ('nao_se_aplica', 'diario') porque são estáveis e fáceis de comparar
 * em SQL; a tela mostra "Não se aplica" e "Diária". A tradução entre os
 * dois mundos mora aqui, e não espalhada por cinco telas — assim, mudar
 * uma palavra é mexer numa linha.
 */

import type {
  EstadoVerificacao,
  ModoInspecao,
  MomentoDia,
  Resposta,
  Trilha,
} from '../db/consultas';

/** Nome de cada trilha de periodicidade. */
export const ROTULO_TRILHA: Record<Trilha, string> = {
  diario: 'Diária',
  periodico: 'Periódica',
  semestral: 'Semestral',
};

/** Versão curta, para os selos dentro da lista de itens. */
export const ROTULO_TRILHA_CURTO: Record<Trilha, string> = {
  diario: 'diário',
  periodico: 'periódico',
  semestral: 'semestral',
};

/**
 * O que cada trilha é, em uma frase.
 *
 * Descreve o AGRUPAMENTO, não prazo: quantos dias cada trilha vale é
 * regra de negócio da Fase 5. A única frequência fixada pela norma é a
 * da água (180 dias), que já vem marcada no seed.
 */
export const DESCRICAO_TRILHA: Record<Trilha, string> = {
  diario: 'A rotina do dia a dia: higiene, temperatura e manipulação.',
  periodico: 'Verificações mais espaçadas: estrutura, equipamentos e documentos.',
  semestral: 'Exigências de prazo longo, como o laudo da água (180 dias).',
};

/** As quatro respostas do RF06, na ordem em que aparecem nos botões. */
export const RESPOSTAS: Resposta[] = [
  'adequado',
  'inadequado',
  'nao_se_aplica',
  'nao_observado',
];

export const ROTULO_RESPOSTA: Record<Resposta, string> = {
  adequado: 'Adequado',
  inadequado: 'Inadequado',
  nao_se_aplica: 'Não se aplica',
  nao_observado: 'Não observado',
};

/** Momento do expediente em que o item diário é verificado. */
export const ROTULO_MOMENTO: Record<MomentoDia, string> = {
  abertura: 'antes de abrir',
  servico: 'durante o serviço',
  fechamento: 'no fechamento',
};

/**
 * Os modos da trilha diária. 'Essencial' é legado — só aparece em
 * inspeções gravadas antes da rotina guiada existir.
 */
export const ROTULO_MODO: Record<ModoInspecao, string> = {
  rotina: 'Rotina',
  completa: 'Completa',
  essencial: 'Essencial',
};

/** As três respostas do cartão de verificação da rotina. */
export const ROTULO_ESTADO: Record<EstadoVerificacao, string> = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  nao_avaliado: 'Não avaliado',
  parcial: 'Parcial',
  pendente: 'Pendente',
};

/**
 * FAIXAS DO SCORE.
 *
 * Os cortes (90 e 70) são decisão do app, não da RDC — a norma não
 * pontua nem classifica estabelecimentos. Servem só para dar cor e
 * leitura rápida ao número; a nota em si continua sendo o percentual.
 */
export type FaixaScore = 'bom' | 'atencao' | 'ruim' | 'sem_dados';

export function faixaDoScore(valor: number | null): FaixaScore {
  if (valor === null) return 'sem_dados';
  if (valor >= 90) return 'bom';
  if (valor >= 70) return 'atencao';
  return 'ruim';
}

/** O score como texto, já tratando o caso de não haver nada avaliado. */
export function textoScore(valor: number | null): string {
  return valor === null ? '—' : `${valor}%`;
}

/**
 * Data ISO do banco -> 'DD/MM/AAAA'.
 *
 * Fatiamos a string em vez de usar `new Date(...).toLocaleDateString()`
 * por dois motivos: não depende do Intl estar disponível no aparelho, e
 * não corre o risco de o fuso empurrar a data um dia para trás.
 */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Data ISO do banco -> 'DD/MM/AAAA às HH:MM' (hora local do aparelho). */
export function formatarDataHora(iso: string): string {
  // A hora vem em UTC do banco; aqui, sim, convertemos para o fuso do
  // aparelho, porque "às 14:03" só faz sentido na hora de quem lê.
  const data = new Date(iso);
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return (
    `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}` +
    ` às ${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`
  );
}
