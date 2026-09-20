/**
 * db/funcionamento.ts
 * ---------------------------------------------------------------
 * OS DIAS EM QUE O ESTABELECIMENTO ABRE — puro, sem banco.
 *
 * Nasceu de um defeito real: a sequência de dias e o vencimento da
 * trilha diária contavam dia de calendário corrido, então quem fecha aos
 * domingos aparecia como atrasado toda segunda, sem ter feito nada
 * errado. Feirante e ambulante, dois dos seis perfis, trabalham poucos
 * dias por semana — para eles o app estava simplesmente errado.
 *
 * A REPRESENTAÇÃO: uma string de 7 caracteres '0' ou '1', indexada pelo
 * `Date.getDay()` — posição 0 é domingo, 6 é sábado. '1111110' é "abre
 * de domingo a sexta". Vale a regra do CLAUDE.md: vira tabela o que o
 * SQL precisa cruzar, e isto o SQL só lê.
 *
 * Por que máscara e não uma tabela `dia_funcionamento`: ela é lida
 * inteira, sempre junto do estabelecimento, e nunca é filtrada nem
 * ordenada em SQL. Uma tabela só acrescentaria um JOIN a cada leitura.
 *
 * O QUE ISTO NÃO É: horário de funcionamento. O app não sabe nem precisa
 * saber que horas o lugar abre — só em que DIAS existe expediente, que é
 * o que decide se houve ou não uma diária a fazer.
 */

import { diaDaSemana, somarDias } from './datas';

/** Quantos dias tem a máscara. Existe para o 7 não ficar solto no código. */
export const DIAS_NA_SEMANA = 7;

/**
 * O padrão: abre todo dia.
 *
 * É o que vale para quem cadastrou antes desta coluna existir (o schema
 * v6 deixa a coluna NULL nas linhas antigas) e para quem não mexer no
 * campo. Escolhido assim porque preserva exatamente o comportamento
 * anterior: sem nenhum dia fechado, toda conta daqui vira a conta antiga.
 */
export const FUNCIONAMENTO_PADRAO = '1111111';

/**
 * Deixa qualquer entrada virar uma máscara utilizável.
 *
 * Defensiva de propósito, porque o valor vem do banco e pode ser NULL
 * (linha anterior à migração), ter tamanho errado (versão futura com
 * outro formato) ou ser só zeros — e uma máscara sem nenhum dia aberto
 * travaria em laço qualquer função que procure "o próximo dia aberto".
 * Em todos esses casos a saída é o padrão, e o app segue funcionando.
 */
export function normalizarFuncionamento(mascara: string | null | undefined): string {
  if (!mascara || mascara.length !== DIAS_NA_SEMANA) return FUNCIONAMENTO_PADRAO;
  if (!/^[01]+$/.test(mascara)) return FUNCIONAMENTO_PADRAO;
  if (!mascara.includes('1')) return FUNCIONAMENTO_PADRAO;
  return mascara;
}

/** O estabelecimento abre neste dia local? */
export function abreNoDia(mascara: string | null | undefined, dia: string): boolean {
  return normalizarFuncionamento(mascara)[diaDaSemana(dia)] === '1';
}

/** A máscara com um dia da semana ligado ou desligado. */
export function alternarDia(mascara: string, indice: number): string {
  const dias = mascara.split('');
  dias[indice] = dias[indice] === '1' ? '0' : '1';
  return dias.join('');
}

/** Quantos dias por semana o estabelecimento abre. */
export function totalDiasAbertos(mascara: string | null | undefined): number {
  return normalizarFuncionamento(mascara).split('').filter((d) => d === '1').length;
}

/**
 * O primeiro dia aberto a partir de `dia` (inclusive).
 *
 * O laço tem teto de uma semana porque `normalizarFuncionamento` garante
 * ao menos um dia aberto: em sete passos ele necessariamente encontra um.
 * O teto está aqui como cinto de segurança, não como regra — se algum
 * dia ele for atingido, é bug, e devolver o próprio dia é a saída que
 * não trava o app.
 */
export function proximoDiaAberto(dia: string, mascara: string | null | undefined): string {
  const normal = normalizarFuncionamento(mascara);

  let candidato = dia;
  for (let passo = 0; passo < DIAS_NA_SEMANA; passo++) {
    if (abreNoDia(normal, candidato)) return candidato;
    candidato = somarDias(candidato, 1);
  }

  return dia;
}
