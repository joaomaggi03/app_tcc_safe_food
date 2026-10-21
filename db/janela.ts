/**
 * db/janela.ts
 * ---------------------------------------------------------------
 * A JANELA DE HORÁRIO DE CADA ETAPA DA DIÁRIA — puro, sem banco.
 *
 * Pedido do orientador (reunião de 20/10/2026): o app deve saber se a
 * verificação foi feita NA HORA CERTA. Os itens diários já têm o
 * `momento` do expediente (antes de abrir, durante o serviço, no
 * fechamento — ver `MomentoDia` em data/rdc216.ts), e cada resposta já
 * guarda a hora em que foi dada (`resposta.respondida_em`). Faltava a
 * régua: o horário em que o estabelecimento abre e fecha.
 *
 * Com ele, cada etapa ganha uma JANELA, e fora dela o item fica travado:
 * conferir o uniforme "antes de abrir" às três da tarde não é a mesma
 * verificação, e aceitar a resposta seria registrar algo que não
 * aconteceu. O que perde a janela sem resposta vira pendência (entrega
 * seguinte).
 *
 * AS JANELAS, em minutos desde a meia-noite, com o fim EXCLUSIVO:
 *
 *   antes de abrir   [00:00, abertura + 30)
 *   serviço          [abertura, fechamento)
 *   fechamento       [fechamento − 30, 24:00)
 *
 * As tolerâncias de 30 minutos são decisão do app, não da norma. A da
 * abertura existe porque a conferência dos manipuladores e da câmara
 * fria acontece também nos primeiros minutos com a porta aberta; a do
 * fechamento, porque a limpeza começa antes de a porta fechar. As
 * janelas se sobrepõem nessas bordas, e isso é de propósito.
 *
 * O QUE ISTO NÃO FAZ
 *  - Fechamento depois da meia-noite (o bar que fecha à 1h). A diária é
 *    presa ao `dia_local`, e uma janela que atravessa a meia-noite cairia
 *    em dois dias. O cadastro recusa e orienta a deixar o horário em
 *    branco (sem janela); tratar é trabalho futuro.
 *  - Horário diferente por dia da semana. Um par só para todos os dias
 *    abertos — os dias fechados já são tratados pelo `funcionamento.ts`.
 *
 * SEM HORÁRIO CADASTRADO, NÃO HÁ JANELA: tudo fica aberto o dia todo,
 * exatamente como antes desta regra existir. É o que vale para quem já
 * usava o app (as colunas nascem NULL no schema v11).
 */

import type { MomentoDia } from '../data/rdc216';

/** Minutos depois da abertura em que ainda vale a etapa "antes de abrir". */
export const TOLERANCIA_ABERTURA = 30;

/** Minutos antes do fechamento em que a etapa "fechamento" já começa. */
export const ANTECEDENCIA_FECHAMENTO = 30;

/**
 * O expediente mínimo aceito, em minutos.
 *
 * Garante que as duas tolerâncias de 30 minutos caibam sem se cruzar:
 * com uma hora, a janela de abertura termina exatamente onde a de
 * fechamento começa.
 */
export const EXPEDIENTE_MINIMO = TOLERANCIA_ABERTURA + ANTECEDENCIA_FECHAMENTO;

/** 24:00 — o fim da janela de fechamento. */
const FIM_DO_DIA = 24 * 60;

/** Abertura e fechamento em minutos desde a meia-noite. */
export interface Horarios {
  abertura: number;
  fechamento: number;
}

export type SituacaoJanela = 'ainda_nao' | 'aberta' | 'encerrada';

/** Uma janela em minutos: `inicio` incluso, `fim` excluso. */
export interface Janela {
  inicio: number;
  fim: number;
}

/**
 * 'HH:MM' -> minutos desde a meia-noite, ou null se não for uma hora.
 *
 * Só aceita o formato que o banco grava. O que o usuário DIGITA passa
 * antes por `normalizarHora`, que é tolerante.
 */
export function lerHora(texto: string | null | undefined): number | null {
  const achado = /^(\d{2}):(\d{2})$/.exec(texto ?? '');
  if (!achado) return null;
  const horas = Number(achado[1]);
  const minutos = Number(achado[2]);
  if (horas > 23 || minutos > 59) return null;
  return horas * 60 + minutos;
}

/** Minutos desde a meia-noite -> 'HH:MM'. */
export function formatarHora(minutos: number): string {
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${doisDigitos(Math.floor(minutos / 60))}:${doisDigitos(minutos % 60)}`;
}

/**
 * O que o usuário digitou -> 'HH:MM', ou null se não der para entender.
 *
 * Aceita '7', '07', '730', '0730', '7:30' e '07:30'. Com três ou quatro
 * dígitos, os dois últimos são os minutos. É o que deixa o campo do
 * cadastro funcionar com o teclado numérico, que não tem o ':'.
 */
export function normalizarHora(texto: string): string | null {
  const limpo = texto.trim();
  if (limpo === '') return null;

  let horas: number;
  let minutos: number;

  const comDoisPontos = /^(\d{1,2}):(\d{2})$/.exec(limpo);
  if (comDoisPontos) {
    horas = Number(comDoisPontos[1]);
    minutos = Number(comDoisPontos[2]);
  } else if (/^\d{1,2}$/.test(limpo)) {
    horas = Number(limpo);
    minutos = 0;
  } else if (/^\d{3,4}$/.test(limpo)) {
    horas = Number(limpo.slice(0, -2));
    minutos = Number(limpo.slice(-2));
  } else {
    return null;
  }

  if (horas > 23 || minutos > 59) return null;
  return formatarHora(horas * 60 + minutos);
}

/**
 * Por que este par de horários não pode ser salvo — ou null se pode.
 *
 * Os dois vazios é válido (o estabelecimento não informou horário, e não
 * há janela). Um só preenchido não é: meia janela não serve para nada.
 */
export function problemaNosHorarios(
  abertura: string | null,
  fechamento: string | null,
): string | null {
  if (abertura === null && fechamento === null) return null;
  if (abertura === null) return 'Informe também o horário de abertura.';
  if (fechamento === null) return 'Informe também o horário de fechamento.';

  const de = lerHora(abertura);
  const ate = lerHora(fechamento);
  if (de === null || ate === null) return 'Use o formato 07:30.';

  if (ate <= de) {
    // Não sugerir "23:59": a etapa de fechamento ficaria em [23:29, 24:00),
    // e a limpeza de quem fecha à 1h nunca caberia nela (achado do fiscal).
    // Sem horário, a diária fica liberada, o que é o certo para esse caso.
    return 'O fechamento precisa ser depois da abertura, no mesmo dia. Se você fecha depois da meia-noite, deixe o horário em branco.';
  }
  if (ate - de < EXPEDIENTE_MINIMO) {
    return 'O fechamento precisa ser pelo menos 1 hora depois da abertura.';
  }
  return null;
}

/**
 * As colunas do banco -> horários utilizáveis, ou null se não houver.
 *
 * Defensiva, no padrão do `normalizarFuncionamento`: o valor vem do
 * banco, e um par incompleto ou inválido (linha antiga, restauração de
 * outra versão) vira "sem horário" — o app volta ao comportamento sem
 * janela em vez de travar itens por uma régua quebrada.
 */
export function lerHorarios(
  abertura: string | null | undefined,
  fechamento: string | null | undefined,
): Horarios | null {
  const de = lerHora(abertura);
  const ate = lerHora(fechamento);
  if (de === null || ate === null) return null;
  if (problemaNosHorarios(abertura ?? null, fechamento ?? null) !== null) return null;
  return { abertura: de, fechamento: ate };
}

/** A janela de uma etapa, dados os horários. */
export function janelaDoMomento(momento: MomentoDia, horarios: Horarios): Janela {
  switch (momento) {
    case 'abertura':
      return { inicio: 0, fim: horarios.abertura + TOLERANCIA_ABERTURA };
    case 'servico':
      return { inicio: horarios.abertura, fim: horarios.fechamento };
    case 'fechamento':
      return { inicio: horarios.fechamento - ANTECEDENCIA_FECHAMENTO, fim: FIM_DO_DIA };
  }
}

/**
 * A etapa pode ser respondida agora?
 *
 * Sem horários, sempre pode — é o comportamento de antes desta regra.
 */
export function situacaoDaJanela(
  momento: MomentoDia,
  horarios: Horarios | null,
  minutoAgora: number,
): SituacaoJanela {
  if (!horarios) return 'aberta';
  const janela = janelaDoMomento(momento, horarios);
  if (minutoAgora < janela.inicio) return 'ainda_nao';
  if (minutoAgora >= janela.fim) return 'encerrada';
  return 'aberta';
}

/**
 * A situação da etapa NUMA INSPEÇÃO — que pertence a um dia.
 *
 * `situacaoDaJanela` só olha o relógio, e o relógio volta a 00:00 toda
 * noite. Achado do `fiscal`: com a aba Hoje aberta na tela depois da
 * meia-noite (o tablet da cozinha), a etapa "antes de abrir" da diária
 * de ONTEM voltava a aceitar resposta, gravada no dia errado e com cara
 * de feita na hora.
 *
 * Por isso a pergunta completa é "a que DIA esta inspeção pertence?":
 * dia passado, toda etapa está encerrada; só no próprio dia o relógio
 * decide. (Dia futuro só acontece com o relógio do aparelho voltando
 * atrás — nada abre antes da hora.)
 *
 * Sem horário cadastrado continua tudo aberto, como antes das janelas.
 * Os dias são 'AAAA-MM-DD', que comparam como texto.
 */
export function situacaoDaEtapa(
  momento: MomentoDia,
  horarios: Horarios | null,
  diaDaInspecao: string | null,
  hoje: string,
  minutoAgora: number,
): SituacaoJanela {
  if (!horarios) return 'aberta';
  if (diaDaInspecao !== null && diaDaInspecao < hoje) return 'encerrada';
  if (diaDaInspecao !== null && diaDaInspecao > hoje) return 'ainda_nao';
  return situacaoDaJanela(momento, horarios, minutoAgora);
}

/** Uma data do JavaScript -> minutos desde a meia-noite, no fuso do aparelho. */
export function minutoDoDia(data: Date = new Date()): number {
  return data.getHours() * 60 + data.getMinutes();
}

/** O fim da janela é a meia-noite? (A etapa de fechamento vai até o fim do dia.) */
export function terminaNoFimDoDia(janela: Janela): boolean {
  return janela.fim >= FIM_DO_DIA;
}
