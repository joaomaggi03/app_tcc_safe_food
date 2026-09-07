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
import type { Estabelecimento, Trilha } from './consultas';
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
    carregado.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
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

/** Título e corpo do alerta de cada trilha. */
function textoDoAlerta(status: StatusTrilha, nome: string): { titulo: string; corpo: string } {
  const dias = status.diasParaVencer;

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
          ? `A verificação semestral da água do ${nome} está vencida há ${Math.abs(dias)} dias. É prazo legal da RDC 216.`
          : `A verificação semestral da água do ${nome} vence em ${dias} dias. Agende o laudo e a limpeza do reservatório.`,
    };
  }

  return {
    titulo: dias < 0 ? 'Auditoria periódica vencida' : 'Auditoria periódica se aproximando',
    corpo:
      dias < 0
        ? `A auditoria do ${nome} está vencida há ${Math.abs(dias)} dias.`
        : `A auditoria do ${nome} vence em ${dias} dias. Reserve um tempo para percorrer o checklist completo.`,
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
function quandoAlertar(status: StatusTrilha): Date {
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
  return proximo;
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
    // Trilha em dia e longe do vencimento não precisa de lembrete: ele
    // será reagendado na próxima abertura do app, quando o prazo tiver
    // se aproximado de verdade.
    if (status.situacao === 'em_dia') continue;

    const { titulo, corpo } = textoDoAlerta(status, estabelecimento.nome);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: titulo,
        body: corpo,
        // Levado de volta ao app: a tela que resolve o alerta.
        data: { trilha: status.trilha satisfies Trilha },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: quandoAlertar(status),
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
