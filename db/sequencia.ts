/**
 * db/sequencia.ts
 * ---------------------------------------------------------------
 * A SEQUÊNCIA DE DIAS com diária concluída — pura, sem banco.
 *
 * Mede ADESÃO À ROTINA, não conformidade: quantos dias de expediente
 * seguidos a inspeção do dia foi fechada. É outra pergunta que o score,
 * e por isso um número separado — um estabelecimento pode ter 95% de
 * score e fazer a diária duas vezes por semana.
 *
 * Pura pelo mesmo motivo do `db/vencimento.ts`: aqui é tudo conta de
 * data, que é onde erro passa despercebido (virada de mês, ano
 * bissexto, horário de verão), e sem banco no meio dá para testar cada
 * borda fora do aparelho.
 *
 * DIA FECHADO NÃO QUEBRA NADA. A sequência conta dias de FUNCIONAMENTO,
 * não dias de calendário: quem fecha aos domingos emenda sábado com
 * segunda. Sem isso, dois dos seis perfis (feirante e ambulante)
 * apareceriam como faltosos por trabalharem os dias que trabalham.
 *
 * E o contrário também vale: uma diária feita num dia normalmente
 * fechado CONTA. Quem abriu fora da rotina e inspecionou fez o certo, e
 * o app não tem por que descontar isso.
 */

import { diferencaEmDias, somarDias } from './datas';
import { abreNoDia, DIAS_NA_SEMANA } from './funcionamento';

export type SituacaoSequencia =
  /** A diária de hoje já foi concluída: a sequência está garantida. */
  | 'hoje_feita'
  /** Hoje o estabelecimento não abre — não há nada em risco. */
  | 'dia_fechado'
  /** Dia de expediente, vinha de uma sequência, e hoje ainda não fechou. */
  | 'em_risco'
  /** Havia sequência antes, e ela se perdeu. */
  | 'quebrada'
  /** Nunca houve nenhuma diária concluída. */
  | 'nenhuma';

/** Um dia da tirinha dos últimos sete. */
export interface DiaDaSequencia {
  dia: string;
  feita: boolean;
  /** Dia sem expediente: não conta a favor nem contra. */
  fechado: boolean;
  hoje: boolean;
}

export interface Sequencia {
  /**
   * Dias de expediente seguidos até hoje. Se a diária de hoje ainda não
   * foi concluída, conta até o último dia aberto anterior — o dia ainda
   * não acabou, e zerar o número às 8h da manhã seria mentira.
   */
  atual: number;
  /** A maior sequência já alcançada, incluindo a atual. */
  recorde: number;
  situacao: SituacaoSequencia;
  /** Hoje é dia de expediente? */
  abreHoje: boolean;
  /** Os sete últimos dias de calendário, do mais antigo para hoje. */
  ultimosSete: DiaDaSequencia[];
}

const DIAS_NA_TIRA = 7;

/**
 * A sequência, a partir dos dias em que houve diária CONCLUÍDA.
 *
 * Recebe os dias já prontos (e o "hoje") em vez de ir ao banco, para o
 * teste poder montar qualquer calendário. Dias repetidos não atrapalham:
 * a primeira coisa que acontece é virarem um conjunto — duas diárias no
 * mesmo dia são um dia de rotina, não dois.
 */
export function calcularSequencia(
  diasConcluidos: string[],
  hoje: string,
  diasFuncionamento?: string | null,
): Sequencia {
  const feitos = new Set(diasConcluidos);

  const hojeFeita = feitos.has(hoje);
  const abreHoje = abreNoDia(diasFuncionamento, hoje);
  const ultimosSete = montarTira(feitos, hoje, diasFuncionamento);
  const recorde = maiorSequencia(feitos, diasFuncionamento);

  /**
   * DE ONDE A CONTAGEM PARTE.
   *
   * Com a diária de hoje fechada, de hoje. Sem ela, de ontem: a diária
   * fica aberta o dia todo e só é concluída no fechamento (ver
   * `iniciarInspecao`), então durante quase todo o expediente o dia de
   * hoje ainda está legitimamente em aberto. Contar a partir de ontem é
   * o que mantém o número estável das 8h às 22h.
   */
  const partida = hojeFeita ? hoje : somarDias(hoje, -1);
  const atual = contarParaTras(feitos, partida, diasFuncionamento);

  let situacao: SituacaoSequencia;
  if (hojeFeita) {
    situacao = 'hoje_feita';
  } else if (!abreHoje) {
    // Nada a cobrar: hoje não há expediente. A sequência segue de pé.
    situacao = 'dia_fechado';
  } else if (atual > 0) {
    situacao = 'em_risco';
  } else if (recorde > 0) {
    situacao = 'quebrada';
  } else {
    situacao = 'nenhuma';
  }

  return { atual, recorde, situacao, abreHoje, ultimosSete };
}

/**
 * Anda para trás a partir de um dia, contando os dias de expediente com
 * diária concluída.
 *
 * Dia fechado é PULADO: não conta e não interrompe. Dia de expediente
 * sem diária encerra a contagem.
 *
 * O teto do laço: cada dia contado consome um item do conjunto, e entre
 * dois dias abertos há no máximo uma semana de dias fechados — daí o
 * limite. Ele não é a regra, é o cinto de segurança contra um laço
 * infinito dentro de um render.
 */
function contarParaTras(
  feitos: Set<string>,
  partida: string,
  diasFuncionamento?: string | null,
): number {
  const teto = (feitos.size + 1) * DIAS_NA_SEMANA;

  let total = 0;
  let dia = partida;

  for (let passo = 0; passo < teto; passo++) {
    // A DIÁRIA VEM PRIMEIRO, antes de olhar se o dia era de expediente.
    // Quem abriu excepcionalmente num domingo e inspecionou ganha o dia:
    // perguntar pelo calendário antes de perguntar pelo registro jogaria
    // fora um dia de trabalho que aconteceu de verdade.
    if (feitos.has(dia)) {
      total += 1;
      dia = somarDias(dia, -1);
      continue;
    }

    // Sem diária: só perdoa se não havia expediente.
    if (!abreNoDia(diasFuncionamento, dia)) {
      // Domingo de quem fecha aos domingos: emenda, não quebra.
      dia = somarDias(dia, -1);
      continue;
    }

    break;
  }

  return total;
}

/** Os sete últimos dias de calendário, do mais antigo para hoje. */
function montarTira(
  feitos: Set<string>,
  hoje: string,
  diasFuncionamento?: string | null,
): DiaDaSequencia[] {
  const tira: DiaDaSequencia[] = [];

  for (let atras = DIAS_NA_TIRA - 1; atras >= 0; atras--) {
    const dia = somarDias(hoje, -atras);
    tira.push({
      dia,
      feita: feitos.has(dia),
      fechado: !abreNoDia(diasFuncionamento, dia),
      hoje: atras === 0,
    });
  }

  return tira;
}

/**
 * A maior corrida de dias de expediente consecutivos que já houve.
 *
 * Percorre o calendário do primeiro ao último dia registrado, e não
 * apenas os dias registrados: é a única forma de saber que houve um dia
 * ABERTO sem diária no meio — esse é o que zera a corrida. Dia fechado
 * é pulado, e a corrida atravessa.
 *
 * A máscara de funcionamento é a de HOJE, aplicada também ao passado.
 * Quem mudar os dias de abertura vai ver o recorde antigo recalculado
 * pela regra nova. É o preço de não versionar a máscara — e o recorde é
 * estímulo, não registro sanitário.
 */
function maiorSequencia(feitos: Set<string>, diasFuncionamento?: string | null): number {
  const dias = [...feitos].sort();
  if (dias.length === 0) return 0;

  const fim = dias[dias.length - 1];

  let maior = 0;
  let corrida = 0;
  let dia = dias[0];

  // Os dias ISO ordenam corretamente como texto ('2026-09-09' <
  // '2026-09-10'), por isso o sort simples basta para achar as pontas.
  while (diferencaEmDias(dia, fim) >= 0) {
    // Mesma ordem do `contarParaTras`: diária feita conta sempre, dia
    // fechado sem diária é pulado, e só o dia ABERTO sem diária zera.
    if (feitos.has(dia)) {
      corrida += 1;
      if (corrida > maior) maior = corrida;
    } else if (abreNoDia(diasFuncionamento, dia)) {
      corrida = 0;
    }
    dia = somarDias(dia, 1);
  }

  return maior;
}
