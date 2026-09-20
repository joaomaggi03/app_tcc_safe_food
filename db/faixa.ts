/**
 * db/faixa.ts
 * ---------------------------------------------------------------
 * ATENDIMENTO DOS ITENS e a FAIXA DA RDC 275/2002 — puro, sem banco.
 *
 * Existe porque o app passou a ter DOIS números, e eles medem coisas
 * diferentes de propósito:
 *
 *   score        percentual PONDERADO (item crítico vale PESO_CRITICO
 *                vezes um comum). É a régua interna: serve para
 *                priorizar o que consertar primeiro.
 *
 *   atendimento  percentual por CONTAGEM SIMPLES — cada item vale um.
 *                É a única métrica comparável com a lista de
 *                verificação da RDC 275/2002, que não tem peso nenhum.
 *
 * Misturar os dois seria erro de rotulagem: dizer "Grupo 1" sobre um
 * número ponderado é afirmar algo que a norma não afirma.
 *
 * Isto aqui é puro pelo mesmo motivo do `db/vencimento.ts`: compila e é
 * testável fora do aparelho, e é onde ficam os casos de borda (nada
 * avaliado, os limites exatos das faixas, arredondamento).
 */

/**
 * A CLASSIFICAÇÃO DA RDC 275/2002, Anexo II, item "D - CLASSIFICAÇÃO DO
 * ESTABELECIMENTO", no texto da norma:
 *
 *   "( ) GRUPO 1 - 76 A 100% de atendimento dos itens
 *    ( ) GRUPO 2 - 51 A 75% de atendimento dos itens
 *    ( ) GRUPO 3 - 0 A 50% de atendimento dos itens"
 *
 * DUAS RESSALVAS que o TCC precisa declarar, e que estão aqui para não
 * se perderem:
 *
 * 1. ESCOPO. A RDC 275/2002 é dos "Estabelecimentos Produtores/
 *    Industrializadores de Alimentos" — indústria. Este app segue a RDC
 *    216/2004, de serviços de alimentação, que NÃO traz lista de
 *    verificação nem pontuação. A faixa aqui é, portanto, critério
 *    ADAPTADO, e a tela diz isso com todas as letras. Há precedente na
 *    literatura para a adaptação (Ferreira et al., Rev Inst Adolfo Lutz
 *    2011;70(2):230-5, aplica estas faixas a unidades de alimentação e
 *    nutrição, inclusive por bloco).
 *
 * 2. "NÃO SE APLICA". A norma oferece a coluna NA e não diz o que fazer
 *    com ela no cálculo. Aqui ela fica fora do numerador E do
 *    denominador, a mesma regra do score — ver `montarScore` em
 *    db/consultas.ts. É interpretação nossa preenchendo lacuna da
 *    norma, não regra que a norma tenha dado.
 */
export type GrupoRdc275 = 1 | 2 | 3;

/** Piso de cada grupo, em percentual de atendimento. */
export const PISO_GRUPO_1 = 76;
export const PISO_GRUPO_2 = 51;

/**
 * O percentual de atendimento dos itens: contagem simples.
 *
 *   atendimento = 100 × adequados / avaliados
 *
 * "Avaliados" são os itens respondidos como adequado ou inadequado —
 * "não se aplica" e "não observado" já ficaram de fora antes de chegar
 * aqui.
 *
 * Devolve `null` quando nada foi avaliado, nunca 0: a diferença entre
 * "não verificado" e "reprovou tudo" vale no app inteiro.
 *
 * ARREDONDA aqui, e só aqui. A faixa é calculada a partir deste mesmo
 * inteiro, de modo que o número na tela e o grupo exibido nunca possam
 * discordar. (A norma escreve as faixas em inteiros e deixa um vão
 * entre 75 e 76 para fracionários; arredondar antes fecha o vão.)
 */
export function atendimentoDosItens(adequados: number, avaliados: number): number | null {
  if (avaliados <= 0) return null;
  return Math.round((100 * adequados) / avaliados);
}

/**
 * Em que grupo da RDC 275 esse atendimento cai.
 *
 * `null` entra e `null` sai: sem itens avaliados não há classificação a
 * fazer — e Grupo 3 seria uma acusação falsa contra quem apenas não
 * verificou nada ainda.
 */
export function faixaRdc275(atendimento: number | null): GrupoRdc275 | null {
  if (atendimento === null) return null;
  if (atendimento >= PISO_GRUPO_1) return 1;
  if (atendimento >= PISO_GRUPO_2) return 2;
  return 3;
}
