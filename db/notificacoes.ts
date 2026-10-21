/**
 * db/notificacoes.ts
 * ---------------------------------------------------------------
 * OS ALERTAS DE VENCIMENTO (RF05) — Fase 5.
 *
 * São notificações LOCAIS: o próprio aparelho guarda o agendamento e
 * dispara na hora certa, sem servidor e sem internet. É o que mantém a
 * regra 1 do projeto (offline-first) de pé — um alerta que dependesse de
 * push remoto exigiria backend e conta na Expo.
 *
 * POR QUE O MÓDULO É CARREGADO DENTRO DE UM TRY
 * O `expo-notifications` foi retirado do Expo Go no Android a partir do
 * SDK 53, e ele não falha só quando você usa push: ele LANÇA ERRO NO
 * PRÓPRIO IMPORT. Um `import` normal no topo do arquivo, portanto,
 * derruba o app inteiro na abertura, porque o `app/_layout.tsx` importa
 * este arquivo.
 *
 * A saída é carregar sob demanda e tratar a falha: onde o módulo existe
 * (development build, APK de produção), os alertas funcionam; onde não
 * existe (Expo Go), o app roda inteiro e só os alertas ficam desligados.
 *
 * Optamos por tentar carregar em vez de perguntar "estou no Expo Go?"
 * porque a pergunta não tem resposta confiável: `executionEnvironment`
 * devolve `storeClient` tanto no Expo Go quanto num development build,
 * que são justamente os dois casos que precisamos separar. Tentar e ver
 * o que acontece responde à pergunta certa — "este aparelho consegue
 * agendar alertas?".
 *
 * COMO O AGENDAMENTO É MANTIDO EM DIA
 * Não guardamos em lugar nenhum quais alertas estão agendados. Em vez
 * disso, `reagendarAlertas()` cancela TUDO e agenda de novo a partir do
 * estado atual do banco, quando o app abre e quando uma inspeção é
 * concluída. Qualquer outra abordagem teria que sincronizar duas
 * verdades — o que está agendado no sistema e o que deveria estar —, e é
 * aí que moram os bugs de "notificação de algo que já foi feito".
 */

import type * as TipoNotificacoes from 'expo-notifications';
import { Platform } from 'react-native';
import {
  obterResumoInspecao,
  type Estabelecimento,
  type ModoInspecao,
  type Trilha,
} from './consultas';
import { diaLocalISO, diferencaEmDias } from './datas';
import { proximoDiaAberto } from './funcionamento';
import {
  ANTECEDENCIA_DIAS,
  HORA_LEMBRETE,
  statusDasTrilhas,
  type StatusTrilha,
} from './periodicidade';

/** Identifica os alertas deste app na lista do sistema. */
const CANAL_ANDROID = 'vencimentos';

// `undefined` = ainda não tentamos carregar; `null` = tentamos e não dá.
let modulo: typeof TipoNotificacoes | null | undefined;

/**
 * Carrega o expo-notifications uma vez, ou devolve null se o ambiente
 * não suportar.
 *
 * O `require` fica aqui dentro de propósito: é ele que dispara (e
 * engole) o erro do Expo Go, em vez de o erro acontecer no import do
 * arquivo e derrubar o app.
 */
function carregar(): typeof TipoNotificacoes | null {
  if (modulo !== undefined) return modulo;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const carregado = require('expo-notifications') as typeof TipoNotificacoes;

    // O que fazer quando o alerta chega com o app aberto. Por padrão o
    // expo-notifications não mostra nada nesse caso; como o alerta é
    // sobre uma tarefa a fazer, ele deve aparecer de qualquer jeito.
    //
    // A EXCEÇÃO é a notificação de andamento: ela se atualiza a cada
    // resposta, e com o app aberto um banner a cada toque seria ruído.
    // Ela vai só para a barra, sem pular na tela.
    carregado.setNotificationHandler({
      handleNotification: async (notificacao) => ({
        shouldShowBanner: !ehAndamento(notificacao.request.identifier),
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    modulo = carregado;
  } catch {
    modulo = null;
  }

  return modulo;
}

/**
 * Se este aparelho consegue agendar alertas.
 *
 * As telas usam isto para explicar a ausência em vez de deixar o usuário
 * achando que os avisos estão ligados quando não estão.
 */
export function alertasDisponiveis(): boolean {
  return carregar() !== null;
}

/**
 * Pede permissão de notificação, se ainda não tiver.
 *
 * Devolve `false` quando o usuário recusou — e nesse caso o app segue
 * funcionando normalmente, só sem alertas. O núcleo (checklist, score,
 * vencimento na tela) não depende disso.
 */
export async function pedirPermissao(): Promise<boolean> {
  const Notifications = carregar();
  if (!Notifications) return false;

  const atual = await Notifications.getPermissionsAsync();
  if (atual.granted) return true;

  // Não insiste com quem já disse não: o sistema nem mostraria o pedido.
  if (!atual.canAskAgain) return false;

  const pedido = await Notifications.requestPermissionsAsync();
  return pedido.granted;
}

/**
 * O Android exige um canal para exibir notificações; sem ele, elas são
 * criadas mas não aparecem. No iOS a chamada é ignorada.
 */
async function garantirCanal(Notifications: typeof TipoNotificacoes): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
    name: 'Vencimentos de inspeção',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** "1 dia", "3 dias". */
function emDias(n: number): string {
  return n === 1 ? '1 dia' : `${n} dias`;
}

/** "hoje", "amanhã", "em 7 dias". */
function prazo(dias: number): string {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${emDias(dias)}`;
}

/**
 * Título e corpo do alerta de cada trilha.
 *
 * `quando` é o instante em que o alerta vai APARECER. Os dias do texto
 * contam a partir dele, e não de hoje: um alerta agendado agora para
 * daqui a três semanas não pode chegar dizendo "vence em 30 dias".
 */
function textoDoAlerta(
  status: StatusTrilha,
  nome: string,
  quando: Date = new Date(),
): { titulo: string; corpo: string } {
  const dias = diferencaEmDias(diaLocalISO(quando), status.proximoVencimento);

  if (status.trilha === 'diario') {
    return {
      titulo: 'Inspeção diária de hoje',
      corpo: `Antes de fechar o expediente, conclua a rotina diária do ${nome}.`,
    };
  }

  if (status.trilha === 'semestral') {
    return {
      titulo: dias < 0 ? 'Laudo da água vencido' : 'Laudo da água vence em breve',
      corpo:
        dias < 0
          ? `A verificação semestral da água do ${nome} está vencida há ${emDias(-dias)}. É prazo legal da RDC 216.`
          : `A verificação semestral da água do ${nome} vence ${prazo(dias)}. Agende o laudo e a limpeza do reservatório.`,
    };
  }

  return {
    titulo: dias < 0 ? 'Auditoria periódica vencida' : 'Auditoria periódica se aproximando',
    corpo:
      dias < 0
        ? `A auditoria do ${nome} está vencida há ${emDias(-dias)}.`
        : `A auditoria do ${nome} vence ${prazo(dias)}. Reserve um tempo para percorrer o checklist completo.`,
  };
}

/**
 * Quando disparar o alerta de uma trilha.
 *
 * O momento natural é "vencimento menos a antecedência, na hora definida
 * para a trilha". Mas esse instante pode já ter passado — é o caso de
 * quem está atrasado, justamente quem mais precisa do lembrete. Nessas
 * horas o alerta vai para a próxima ocorrência do horário: hoje, se
 * ainda não deu a hora; amanhã, se já passou.
 */
function quandoAlertar(status: StatusTrilha, diasFuncionamento: string | null): Date {
  const hora = HORA_LEMBRETE[status.trilha];
  const [ano, mes, dia] = status.proximoVencimento.split('-').map(Number);

  const alvo = new Date(ano, mes - 1, dia, hora, 0, 0);
  alvo.setDate(alvo.getDate() - ANTECEDENCIA_DIAS[status.trilha]);

  const agora = new Date();
  if (alvo.getTime() > agora.getTime()) return alvo;

  const proximo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, 0, 0);
  if (proximo.getTime() <= agora.getTime()) {
    proximo.setDate(proximo.getDate() + 1);
  }

  /**
   * NUNCA NO DIA DE FOLGA.
   *
   * Só vale para a queda no "próximo horário" acima: o alvo calculado a
   * partir do vencimento já vem em dia aberto, porque
   * `calcularVencimento` empurrou o vencimento. Este trecho cobre o
   * atrasado, cujo lembrete vai para a próxima ocorrência do horário —
   * e essa ocorrência pode cair justamente no domingo em que o lugar
   * não abre. Cobrar a diária na folga é o incômodo que a máscara de
   * funcionamento existe para evitar.
   */
  const aberto = proximoDiaAberto(diaLocalISO(proximo), diasFuncionamento);
  const [anoA, mesA, diaA] = aberto.split('-').map(Number);
  return new Date(anoA, mesA - 1, diaA, hora, 0, 0);
}

/**
 * Cancela e reagenda os alertas das três trilhas.
 *
 * Silencioso por natureza: se o ambiente não suporta ou a permissão foi
 * negada, simplesmente não agenda nada e devolve 0. Nenhuma tela precisa
 * tratar erro por causa disso.
 */
export async function reagendarAlertas(estabelecimento: Estabelecimento): Promise<number> {
  const Notifications = carregar();
  if (!Notifications) return 0;

  const permitido = await pedirPermissao();
  if (!permitido) return 0;

  await garantirCanal(Notifications);
  await Notifications.cancelAllScheduledNotificationsAsync();

  let agendados = 0;

  for (const status of statusDasTrilhas(estabelecimento)) {
    // A trilha EM DIA também é agendada, para o futuro. Pular ela era o
    // defeito: concluída a diária de hoje, a de amanhã fica "em dia", e o
    // lembrete dela só nasceria se o app fosse aberto amanhã — justamente
    // quando o lembrete já não é necessário. Alerta local não precisa do
    // app aberto para disparar; precisa só de ter sido agendado.
    const quando = quandoAlertar(status, estabelecimento.dias_funcionamento);
    const { titulo, corpo } = textoDoAlerta(status, estabelecimento.nome, quando);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: titulo,
        body: corpo,
        // Levado de volta ao app: a tela que resolve o alerta.
        data: { trilha: status.trilha satisfies Trilha },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: quando,
        channelId: CANAL_ANDROID,
      },
    });

    agendados += 1;
  }

  return agendados;
}

/**
 * Dispara um alerta daqui a poucos segundos, com o texto real de uma
 * trilha. Existe para você conseguir VER a notificação sem esperar o
 * vencimento chegar — sem isso, testar a Fase 5 significaria mexer no
 * relógio do aparelho.
 */
export async function testarAlerta(
  estabelecimento: Estabelecimento,
  trilha: Trilha,
): Promise<boolean> {
  const Notifications = carregar();
  if (!Notifications) return false;

  const permitido = await pedirPermissao();
  if (!permitido) return false;

  await garantirCanal(Notifications);

  const status = statusDasTrilhas(estabelecimento).find((s) => s.trilha === trilha);
  if (!status) return false;

  const { titulo, corpo } = textoDoAlerta(status, estabelecimento.nome);

  await Notifications.scheduleNotificationAsync({
    content: { title: titulo, body: corpo, data: { trilha } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CANAL_ANDROID,
    },
  });

  return true;
}

// ---------------------------------------------------------------
// INSPEÇÃO EM ANDAMENTO — a notificação fixa na barra
// ---------------------------------------------------------------
//
// Enquanto uma inspeção está aberta, uma notificação que não se arrasta
// para fora mostra o progresso ("12 de 32 respondidos") e leva de volta
// a ela. É para quem sai do app no meio — atender um cliente, receber
// uma entrega — e esqueceria de voltar.
//
// Não é alerta de vencimento: não toca, não vibra, não pula na tela. Por
// isso tem canal próprio, de importância BAIXA (o Android não deixa um
// app mudar a importância de um canal depois de criado, então misturar
// os dois no canal "vencimentos" não seria possível).
//
// UMA NOTIFICAÇÃO POR TRILHA, com identificador fixo: mostrar de novo com
// o mesmo identificador SUBSTITUI a anterior em vez de empilhar uma nova.
// A diária e uma auditoria abertas ao mesmo tempo aparecem como duas.

const CANAL_ANDAMENTO = 'andamento';
const PREFIXO_ANDAMENTO = 'andamento-';

function ehAndamento(identificador: string): boolean {
  return identificador.startsWith(PREFIXO_ANDAMENTO);
}

const NOME_TRILHA: Record<Trilha, string> = {
  diario: 'diária',
  periodico: 'periódica',
  semestral: 'semestral',
};

/**
 * Para onde o toque leva.
 *
 * A diária, em qualquer modo, mora na aba Hoje — que retoma a de hoje
 * sozinha. As outras trilhas moram na rota `/inspecao`, que retoma a
 * que está em andamento pelo mesmo `iniciarInspecao`.
 */
function rotaDaTrilha(trilha: Trilha): string {
  return trilha === 'diario' ? '/' : `/inspecao?trilha=${trilha}`;
}

/**
 * "▰▰▰▰▱▱▱▱▱▱" — o progresso desenhado com caracteres.
 *
 * O `expo-notifications` não tem barra de progresso nativa (o
 * `setProgress` do Android não é exposto). Desenhar no texto funciona em
 * qualquer aparelho, sem código nativo e sem build novo.
 *
 * Arredonda para BAIXO: a barra só fica cheia quando está tudo
 * respondido — 31 de 32 não pode parecer completo.
 */
function barraDeTexto(respondidos: number, total: number, tamanho = 10): string {
  const cheios = total === 0 ? 0 : Math.floor((respondidos / total) * tamanho);
  return '▰'.repeat(cheios) + '▱'.repeat(tamanho - cheios);
}

/**
 * FILA: as chamadas ao sistema rodam uma de cada vez, na ordem pedida.
 *
 * Sem ela, dá para perder a corrida: a última resposta pede "mostrar
 * 32 de 32", o usuário conclui logo em seguida e o "remover" chega ao
 * sistema ANTES do "mostrar" — e a notificação reaparece depois da
 * inspeção concluída, presa na barra.
 */
let fila: Promise<unknown> = Promise.resolve();

function enfileirar(tarefa: () => Promise<void>): Promise<void> {
  const proxima = fila.then(tarefa).catch(() => {
    // Silencioso como o resto do módulo: notificação é conveniência, e
    // uma falha aqui não pode atrapalhar quem está inspecionando.
  });
  fila = proxima;
  return proxima;
}

/**
 * Mostra (ou atualiza) a notificação de andamento de uma inspeção.
 *
 * NÃO pede permissão: pedir no meio de uma inspeção interromperia o
 * trabalho. O pedido já acontece ao abrir o app (`reagendarAlertas`);
 * quem recusou lá fica sem esta também.
 */
export function mostrarAndamento(inspecao: {
  id: number;
  trilha: Trilha;
  modo: ModoInspecao;
  respondidos: number;
  total: number;
}): Promise<void> {
  return enfileirar(async () => {
    const Notifications = carregar();
    if (!Notifications) return;

    const permissao = await Notifications.getPermissionsAsync();
    if (!permissao.granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL_ANDAMENTO, {
        name: 'Inspeção em andamento',
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        vibrationPattern: null,
        enableVibrate: false,
      });
    }

    const { respondidos, total } = inspecao;
    const faltam = total - respondidos;
    const porcentagem = total === 0 ? 0 : Math.round((respondidos / total) * 100);
    const titulo =
      inspecao.trilha === 'diario' && inspecao.modo === 'rotina'
        ? `Rotina diária · ${porcentagem}%`
        : `Inspeção ${NOME_TRILHA[inspecao.trilha]} · ${porcentagem}%`;
    // A barra vem PRIMEIRO no corpo: a notificação recolhida mostra só uma
    // linha, e é a barra que se quer ver de relance.
    const corpo =
      faltam > 0
        ? `${barraDeTexto(respondidos, total)}  ${respondidos} de ${total} · toque para continuar`
        : `${barraDeTexto(respondidos, total)}  Tudo respondido · toque para concluir`;

    await Notifications.scheduleNotificationAsync({
      identifier: PREFIXO_ANDAMENTO + inspecao.trilha,
      content: {
        title: titulo,
        body: corpo,
        data: { inspecaoId: inspecao.id, rota: rotaDaTrilha(inspecao.trilha) },
        // `sticky`: não sai com o arrastar (o `setOngoing` do Android) —
        // até o Android 13; do 14 em diante o sistema deixa dispensar, e
        // ela volta na próxima resposta.
        // `autoDismiss: false`: não some ao ser tocada — tocar RETOMA a
        // inspeção, não a conclui, então ela ainda está em andamento.
        sticky: true,
        autoDismiss: false,
      },
      // Sem data: aparece já. O `channelId` põe no canal silencioso.
      trigger: Platform.OS === 'android' ? { channelId: CANAL_ANDAMENTO } : null,
    });
  });
}

/** Tira a notificação de andamento da trilha — ao concluir a inspeção. */
export function encerrarAndamento(trilha: Trilha): Promise<void> {
  return enfileirar(async () => {
    const Notifications = carregar();
    if (!Notifications) return;
    await Notifications.dismissNotificationAsync(PREFIXO_ANDAMENTO + trilha);
  });
}

/**
 * Cancela tudo: os alertas agendados e as notificações na barra.
 *
 * Para quando o banco inteiro é apagado (ferramenta de teste): sem
 * estabelecimento, nenhum alerta tem a que se referir, e a notificação
 * fixa de andamento levaria a uma inspeção que não existe mais.
 */
export function cancelarTodasAsNotificacoes(): Promise<void> {
  return enfileirar(async () => {
    const Notifications = carregar();
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
  });
}

/**
 * Remove as notificações de andamento que perderam o sentido.
 *
 * Ela é fixa, então não pode ficar para trás. Três casos:
 *  - a inspeção foi concluída (ou apagada) por outro caminho;
 *  - é uma DIÁRIA de outro dia: o `iniciarInspecao` não a retoma mais,
 *    e o toque abriria a de hoje, não aquela;
 *  - o app foi fechado à força e não chegou a chamar o `encerrar`.
 *
 * Roda ao abrir o app e ao voltar a ele. Mesma regra do `iniciarInspecao`
 * para o que ainda pode ser retomado.
 */
export function limparAndamentoOrfao(): Promise<void> {
  return enfileirar(async () => {
    const Notifications = carregar();
    if (!Notifications) return;

    const hoje = diaLocalISO();
    const presentes = await Notifications.getPresentedNotificationsAsync();

    for (const notificacao of presentes) {
      const identificador = notificacao.request.identifier;
      if (!ehAndamento(identificador)) continue;

      const id = Number(notificacao.request.content.data?.inspecaoId);
      const inspecao = Number.isFinite(id) ? obterResumoInspecao(id) : null;
      const retomavel =
        inspecao !== null &&
        inspecao.status === 'em_andamento' &&
        (inspecao.trilha !== 'diario' || inspecao.dia_local === hoje);

      if (!retomavel) await Notifications.dismissNotificationAsync(identificador);
    }
  });
}

/**
 * Chama `abrir(rota)` quando o usuário toca numa notificação de
 * andamento — com o app aberto, em segundo plano ou fechado.
 *
 * Com o app FECHADO, o toque acontece antes de este código existir; o
 * sistema guarda a resposta e ela é lida aqui, uma vez, e apagada — sem
 * apagar, cada reload do Metro levaria de novo à mesma tela.
 *
 * Devolve a função que desliga o ouvinte (para o `useEffect` limpar).
 */
export function aoTocarAndamento(abrir: (rota: string) => void): () => void {
  const Notifications = carregar();
  if (!Notifications) return () => {};

  function tratar(resposta: TipoNotificacoes.NotificationResponse | null) {
    if (!resposta) return;
    if (!ehAndamento(resposta.notification.request.identifier)) return;
    const rota = resposta.notification.request.content.data?.rota;
    if (typeof rota === 'string') abrir(rota);
  }

  const inicial = Notifications.getLastNotificationResponse();
  if (inicial) {
    Notifications.clearLastNotificationResponse();
    tratar(inicial);
  }

  const assinatura = Notifications.addNotificationResponseReceivedListener(tratar);
  return () => assinatura.remove();
}
