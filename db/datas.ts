/**
 * db/datas.ts
 * ---------------------------------------------------------------
 * CONTAS DE DATA, sem banco e sem React.
 *
 * Está separado por dois motivos. O primeiro é que a periodicidade (Fase
 * 5) é, no fundo, só isto: somar dias e comparar. O segundo é que sem
 * nenhum import este arquivo pode ser compilado e testado sozinho, fora
 * do aparelho — e conta de data é onde erro passa despercebido: vira do
 * mês, ano bissexto, fuso horário.
 *
 * A CONVENÇÃO: um "dia" aqui é sempre a string 'AAAA-MM-DD' no fuso do
 * APARELHO. Nunca UTC. O banco guarda `dia_local` nesse mesmo formato
 * justamente para as duas pontas falarem a mesma língua.
 */

/** Dois dígitos com zero à esquerda: 7 -> '07'. */
function doisDigitos(numero: number): string {
  return String(numero).padStart(2, '0');
}

/**
 * Uma data do JavaScript -> 'AAAA-MM-DD' no fuso do aparelho.
 *
 * Não dá para usar `toISOString().slice(0, 10)`: aquilo devolve a data
 * em UTC. Às 21h30 no Brasil (UTC-3) já é o dia seguinte em UTC, e todo
 * o cálculo de vencimento cairia um dia à frente.
 */
export function diaLocalISO(data: Date = new Date()): string {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** O dia local de N dias atrás. */
export function diaLocalHaDias(dias: number): string {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  return diaLocalISO(data);
}

/**
 * 'AAAA-MM-DD' -> Date no fuso local, na hora indicada.
 *
 * O construtor com ano, mês e dia separados é obrigatório aqui:
 * `new Date('2026-09-07')` é interpretado como UTC pelo JavaScript e
 * viraria 06/09 às 21h em Brasília.
 */
function comoData(dia: string, hora = 0): Date {
  const [ano, mes, diaDoMes] = dia.split('-').map(Number);
  return new Date(ano, mes - 1, diaDoMes, hora, 0, 0, 0);
}

/**
 * Soma dias a um dia local e devolve outro dia local.
 *
 * Passa por `Date` de propósito, em vez de somar o número do dia: é o
 * `Date` que sabe que 31/01 + 1 é 01/02, que 2024 teve 29 de fevereiro
 * e que dezembro vira janeiro do ano seguinte.
 */
export function somarDias(dia: string, dias: number): string {
  const data = comoData(dia);
  data.setDate(data.getDate() + dias);
  return diaLocalISO(data);
}

/**
 * Quantos dias inteiros separam dois dias locais (ate - de).
 *
 * A conta é feita ao MEIO-DIA, e não à meia-noite. O motivo é o horário
 * de verão: no dia em que o relógio adianta, a diferença entre duas
 * meias-noites é de 23 horas, e a divisão por 24 arredondaria para o dia
 * errado. Ao meio-dia sobram 11 ou 13 horas de folga em cada ponta, e o
 * arredondamento nunca escorrega.
 */
export function diferencaEmDias(de: string, ate: string): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((comoData(ate, 12).getTime() - comoData(de, 12).getTime()) / MS_POR_DIA);
}

/** Data e hora local a partir de um dia e uma hora inteira. */
export function diaComHora(dia: string, hora: number): Date {
  return comoData(dia, hora);
}
