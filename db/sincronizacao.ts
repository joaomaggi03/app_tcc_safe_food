/**
 * db/sincronizacao.ts
 * ---------------------------------------------------------------
 * O BACKUP NA NUVEM (RF01, Fase 6) — a parte que usa a rede.
 *
 * É backup de MÃO ÚNICA, como o plano recomenda (seção 6.7): o aparelho
 * sobe, a nuvem guarda. A única descida é a RESTAURAÇÃO, num aparelho
 * vazio — o caso "perdi o celular". Juntar dois aparelhos com dados dos
 * dois lados seria sincronização de duas mãos, com conflito a resolver,
 * e fica como trabalho futuro.
 *
 * NINGUÉM DO NÚCLEO IMPORTA ESTE ARQUIVO. O `db/consultas.ts` não sabe
 * que existe rede. Quem chama daqui são as telas e o layout, e sempre
 * sem esperar: nenhuma função exportada lança erro — a falha volta como
 * valor, e o app segue igual. Sem internet, o backup simplesmente
 * acontece da próxima vez.
 *
 * A decisão do que sobe mora em `db/backup.ts`, que é testável sem rede.
 * Aqui só se transporta.
 */

import { obterBanco } from './index';
import {
  aparelhoVazio,
  confirmarEnvio,
  definirDono,
  donoDoAparelho,
  lerMarcador,
  montarPacote,
  restaurar,
  tamanhoDoPacote,
  TABELAS_BACKUP,
  type DadosNuvem,
  type DonoDoAparelho,
  type Linha,
  type Pacote,
  type TabelaBackup,
} from './backup';
import { supabase } from './supabase';

export type ResultadoBackup =
  | { ok: true; enviadas: number }
  | {
      ok: false;
      /** `outra_conta`: o histórico deste aparelho é de outra conta (ver `donoDoAparelho`). */
      motivo: 'sem_nuvem' | 'sem_conta' | 'outra_conta' | 'erro';
      mensagem?: string;
    };

/** A chave de cada tabela na nuvem, para o "insere ou atualiza". */
const CHAVE_NA_NUVEM: Record<TabelaBackup, string> = {
  estabelecimento: 'uuid',
  inspecao: 'uuid',
  resposta: 'inspecao_uuid,item_id',
  item_oculto: 'estabelecimento_uuid,item_id',
  acao: 'uuid',
};

/**
 * Quantas linhas por requisição. O primeiro backup de quem usa o app há
 * meses leva milhares de respostas (32 por diária); mandar tudo de uma
 * vez arrisca estourar o limite de tamanho da requisição.
 */
const LOTE = 500;

/** O backup em andamento, para dois pedidos simultâneos virarem um só. */
let emAndamento: Promise<ResultadoBackup> | null = null;

/**
 * Sobe o que mudou desde o último backup desta conta.
 *
 * Seguro de chamar a qualquer hora e quantas vezes quiser: sem nuvem ou
 * sem login, volta na hora sem fazer nada; um segundo pedido enquanto o
 * primeiro roda recebe o mesmo resultado.
 */
export function fazerBackup(): Promise<ResultadoBackup> {
  if (!emAndamento) {
    emAndamento = enviar().finally(() => {
      emAndamento = null;
    });
  }
  return emAndamento;
}

async function enviar(): Promise<ResultadoBackup> {
  if (!supabase) return { ok: false, motivo: 'sem_nuvem' };

  try {
    const { data } = await supabase.auth.getSession();
    const usuarioId = data.session?.user.id;
    if (!usuarioId) return { ok: false, motivo: 'sem_conta' };

    const db = obterBanco();

    // UM APARELHO, UMA CONTA. O dono é gravado ANTES de subir a primeira
    // linha: se este primeiro envio cair no meio, parte das linhas já é
    // desta conta na nuvem, e trocar de conta depois não pode ser liberado.
    const dono = donoDoAparelho(db);
    if (dono && dono.id !== usuarioId) {
      return { ok: false, motivo: 'outra_conta', mensagem: dono.email ?? undefined };
    }
    if (!dono) definirDono(db, usuarioId, data.session?.user.email ?? null);

    const pacote = montarPacote(db, lerMarcador(db, usuarioId));

    // EXCLUSÕES PRIMEIRO. Um item oculto, reexibido e ocultado de novo
    // tem uma exclusão anotada E uma linha viva; se a linha subisse antes,
    // a exclusão a apagaria logo depois.
    await repassarExclusoes(pacote);

    // Depois as linhas, na ordem das chaves estrangeiras: a nuvem recusa
    // uma inspeção cujo estabelecimento ainda não chegou.
    for (const tabela of TABELAS_BACKUP) {
      const linhas = pacote.linhas[tabela].map((linha) => ({ ...linha, usuario_id: usuarioId }));
      for (let i = 0; i < linhas.length; i += LOTE) {
        const { error } = await supabase
          .from(tabela)
          .upsert(linhas.slice(i, i + LOTE), { onConflict: CHAVE_NA_NUVEM[tabela] });
        if (error) throw error;
      }
    }

    // Só agora, com tudo aceito, o marcador avança. Se algo falhou no
    // meio, o próximo backup reenvia o pacote inteiro — o "insere ou
    // atualiza" torna isso inofensivo.
    confirmarEnvio(db, usuarioId, pacote);
    return { ok: true, enviadas: tamanhoDoPacote(pacote) };
  } catch (erro) {
    return { ok: false, motivo: 'erro', mensagem: mensagemDe(erro) };
  }
}

async function repassarExclusoes(pacote: Pacote): Promise<void> {
  if (!supabase) return;

  for (const tabela of ['acao', 'inspecao'] as const) {
    const uuids = pacote.exclusoes.filter((x) => x.tabela === tabela).map((x) => x.uuid);
    if (uuids.length === 0) continue;
    const { error } = await supabase.from(tabela).delete().in('uuid', uuids);
    if (error) throw error;
  }

  // item_oculto não tem uuid próprio: a chave é estabelecimento + item.
  for (const x of pacote.exclusoes.filter((e) => e.tabela === 'item_oculto')) {
    const { error } = await supabase
      .from('item_oculto')
      .delete()
      .eq('estabelecimento_uuid', x.uuid)
      .eq('item_id', x.item_id ?? '');
    if (error) throw error;
  }
}

/** Quando foi o último backup confirmado da conta atual, ou null. */
export async function ultimoBackup(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const usuarioId = data.session?.user.id;
    return usuarioId ? lerMarcador(obterBanco(), usuarioId) : null;
  } catch {
    return null;
  }
}

/** A conta dona do histórico deste aparelho, ou null se nenhuma ainda. */
export function contaDoAparelho(): DonoDoAparelho | null {
  try {
    return donoDoAparelho(obterBanco());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------
// RESTAURAÇÃO — o caminho de volta, num aparelho novo
// ---------------------------------------------------------------

export type ResultadoRestauracao =
  | { ok: true; restaurado: boolean }
  | { ok: false; mensagem: string };

/**
 * Traz da nuvem o estabelecimento desta conta, se o aparelho estiver
 * vazio.
 *
 * `restaurado: false` não é erro: é a conta nova, que ainda não tem nada
 * na nuvem. Aí o caminho é o cadastro normal.
 *
 * Se a conta tiver mais de um estabelecimento (dois aparelhos usados com
 * a mesma conta), vem o alterado por último — o MVP trabalha com um só.
 */
export async function restaurarDaNuvem(): Promise<ResultadoRestauracao> {
  if (!supabase) return { ok: false, mensagem: 'Backup desligado neste aparelho.' };

  try {
    const { data } = await supabase.auth.getSession();
    const usuarioId = data.session?.user.id;
    if (!usuarioId) return { ok: false, mensagem: 'Entre na sua conta primeiro.' };

    const db = obterBanco();
    if (!aparelhoVazio(db)) return { ok: true, restaurado: false };

    const { data: estabelecimentos, error } = await supabase
      .from('estabelecimento')
      .select('*')
      .order('atualizado_em', { ascending: false })
      .limit(1);
    if (error) throw error;

    const estabelecimento = estabelecimentos?.[0] as Linha | undefined;
    if (!estabelecimento) return { ok: true, restaurado: false };

    const uuid = String(estabelecimento.uuid);
    const inspecao = await lerTudo('inspecao', 'estabelecimento_uuid', uuid);
    const uuidsDasInspecoes = new Set(inspecao.map((i) => String(i.uuid)));

    const dados: DadosNuvem = {
      estabelecimento: semDono(estabelecimento),
      inspecao,
      // A RLS já limita às linhas desta conta; o filtro por inspeção
      // separa as de outro estabelecimento da mesma conta.
      resposta: (await lerTudo('resposta')).filter((r) =>
        uuidsDasInspecoes.has(String(r.inspecao_uuid)),
      ),
      item_oculto: await lerTudo('item_oculto', 'estabelecimento_uuid', uuid),
      acao: await lerTudo('acao', 'estabelecimento_uuid', uuid),
    };

    restaurar(db, usuarioId, dados, data.session?.user.email ?? null);
    return { ok: true, restaurado: true };
  } catch (erro) {
    return { ok: false, mensagem: mensagemDe(erro) };
  }
}

/**
 * Lê uma tabela inteira, de página em página.
 *
 * O Supabase devolve no máximo 1000 linhas por consulta, e um ano de
 * diárias passa de 8000 respostas. Sem paginar, a restauração traria só
 * o começo do histórico — sem erro nenhum.
 */
async function lerTudo(tabela: TabelaBackup, coluna?: string, valor?: string): Promise<Linha[]> {
  const PAGINA = 1000;
  const todas: Linha[] = [];

  for (let de = 0; ; de += PAGINA) {
    let consulta = supabase!.from(tabela).select('*');
    if (coluna && valor) consulta = consulta.eq(coluna, valor);

    // A ordem tem que ser TOTAL — sem empate — para as páginas não se
    // sobreporem nem deixarem buraco. `atualizado_em` sozinho não basta:
    // a migração v10 carimbou todas as linhas antigas com o MESMO
    // instante. Por isso a chave da tabela entra como desempate.
    for (const ordem of ['atualizado_em', ...CHAVE_NA_NUVEM[tabela].split(',')]) {
      consulta = consulta.order(ordem);
    }
    const { data, error } = await consulta.range(de, de + PAGINA - 1);
    if (error) throw error;

    todas.push(...(data as Linha[]).map(semDono));
    if (!data || data.length < PAGINA) return todas;
  }
}

/** Tira o `usuario_id`, que só existe na nuvem. */
function semDono(linha: Linha): Linha {
  const { usuario_id: _dono, ...resto } = linha;
  return resto;
}

function mensagemDe(erro: unknown): string {
  if (erro && typeof erro === 'object' && 'message' in erro) {
    return String((erro as { message: unknown }).message);
  }
  return 'Erro desconhecido.';
}
