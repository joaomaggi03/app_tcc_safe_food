/**
 * db/exportarPdf.ts
 * ---------------------------------------------------------------
 * GERA O PDF DA INSPEÇÃO E ABRE O COMPARTILHAMENTO (RF08).
 *
 * Tudo no aparelho, sem internet (regra 1): o `expo-print` desenha a
 * página HTML do `relatorioHtml.ts` num PDF, e o `expo-sharing` abre a
 * janela de compartilhar do sistema — WhatsApp, e-mail, Drive, "Salvar em
 * Arquivos". Não há tela própria de "onde salvar": o sistema já resolve.
 *
 * POR QUE AS BIBLIOTECAS SÃO CARREGADAS DENTRO DE UM TRY
 * As duas são NATIVAS, e o app roda num development build do EAS. Um
 * build gerado antes de elas serem instaladas não as tem, e o import
 * normal lançaria erro na abertura — derrubando o app inteiro, como
 * aconteceu com o `expo-notifications` (ver CLAUDE.md). Carregar sob
 * demanda faz o botão responder "precisa da versão nova do app" em vez
 * de quebrar.
 */

import { requireOptionalNativeModule } from 'expo';
import type * as TipoPrint from 'expo-print';
import type * as TipoSharing from 'expo-sharing';
import { dadosDoRelatorio } from './relatorio';
import { montarHtmlRelatorio } from './relatorioHtml';

/**
 * - `indisponivel`: o build não tem as bibliotecas (é preciso o novo);
 * - `sem_compartilhamento`: o PDF foi gerado, mas o aparelho não oferece
 *   a janela de compartilhar — motivo diferente, e a tela diz outra coisa.
 */
export type ResultadoExportacao = 'ok' | 'indisponivel' | 'sem_compartilhamento' | 'erro';

// `undefined` = ainda não tentamos; `null` = tentamos e não existe.
let print: typeof TipoPrint | null | undefined;
let sharing: typeof TipoSharing | null | undefined;

/**
 * Carrega as duas bibliotecas — mas só depois de PERGUNTAR se a parte
 * nativa existe neste build.
 *
 * O `try` sozinho não bastava: num build antigo, o `require` lança "Cannot
 * find native module 'ExpoPrint'", o `try` pega, mas no modo de
 * desenvolvimento a tela vermelha de erros do React Native aparece mesmo
 * assim (visto no aparelho em 26/10/2026). O `requireOptionalNativeModule`
 * devolve null em vez de lançar, e aí nem se tenta o `require`.
 */
function carregar(): { print: typeof TipoPrint; sharing: typeof TipoSharing } | null {
  if (print === undefined) {
    print = null;
    if (requireOptionalNativeModule('ExpoPrint')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        print = require('expo-print') as typeof TipoPrint;
      } catch {
        print = null;
      }
    }
  }
  if (sharing === undefined) {
    sharing = null;
    if (requireOptionalNativeModule('ExpoSharing')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        sharing = require('expo-sharing') as typeof TipoSharing;
      } catch {
        sharing = null;
      }
    }
  }
  return print && sharing ? { print, sharing } : null;
}

/**
 * Gera o PDF da inspeção e abre o compartilhamento.
 *
 * Não lança erro (como as notificações): devolve o que aconteceu, e a
 * tela explica. Fechar a janela de compartilhar sem escolher nada também
 * é 'ok' — o PDF foi gerado; o destino é decisão do usuário.
 */
export async function exportarRelatorio(inspecaoId: number): Promise<ResultadoExportacao> {
  const modulos = carregar();
  if (!modulos) return 'indisponivel';

  try {
    const dados = dadosDoRelatorio(inspecaoId);
    if (!dados) return 'erro';

    const { uri } = await modulos.print.printToFileAsync({ html: montarHtmlRelatorio(dados) });
    if (!(await modulos.sharing.isAvailableAsync())) return 'sem_compartilhamento';

    await modulos.sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Relatório da inspeção',
      UTI: 'com.adobe.pdf',
    });
    return 'ok';
  } catch {
    return 'erro';
  }
}
