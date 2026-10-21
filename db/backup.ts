/**
 * db/backup.ts
 * ---------------------------------------------------------------
 * O LADO LOCAL DO BACKUP NA NUVEM (RF01, Fase 6).
 *
 * Este arquivo não sabe que existe internet. Ele faz duas coisas com o
 * SQLite, e só:
 *
 *  - `montarPacote` — separa o que mudou desde o último backup, já no
 *    formato das tabelas da nuvem (ver `supabase/schema.sql`);
 *  - `restaurar` — grava no aparelho o que veio da nuvem, num celular
 *    novo.
 *
 * Quem fala com o Supabase é o `db/sincronizacao.ts`. A separação é a
 * mesma do `vencimento.ts` × `periodicidade.ts`: a parte que decide fica
 * testável fora do aparelho (tests/backup.test.js), sem rede e sem conta.
 *
 * O QUE SOBE: só FATOS — as cinco tabelas de dado do usuário. Não sobe o
 * catálogo da norma (ele vem do seed, igual em todo aparelho) nem nenhum
 * número calculado (score, vencimento, sequência): cada aparelho os
 * recalcula a partir dos mesmos fatos. Ver o plano, seção 6.0.
 *
 * COMO SE SABE O QUE MUDOU: pelo `atualizado_em`, que os gatilhos do
 * schema v10 carimbam em toda escrita. E o que foi APAGADO fica anotado
 * em `sync_exclusao`, também por gatilho.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

/** As tabelas que sobem, NA ORDEM das chaves estrangeiras. */
export const TABELAS_BACKUP = [
  'estabelecimento',
  'inspecao',
  'resposta',
  'item_oculto',
  'acao',
] as const;

export type TabelaBackup = (typeof TABELAS_BACKUP)[number];

/** Uma linha no formato da tabela da nuvem. */
export type Linha = Record<string, string | number | null>;

/** Uma exclusão anotada pelo gatilho, esperando para ser repassada. */
export interface Exclusao {
  id: number;
  tabela: 'inspecao' | 'acao' | 'item_oculto';
  /** uuid da linha; em item_oculto, o do estabelecimento. */
  uuid: string;
  item_id: string | null;
}

export interface Pacote {
  /**
   * O instante em que o pacote foi montado, no relógio do SQLite. Vira o
   * marcador do próximo backup — e é tirado ANTES da leitura, para que
   * uma escrita feita durante o envio não caia no vão entre os dois.
   */
  inicio: string;
  exclusoes: Exclusao[];
  linhas: Record<TabelaBackup, Linha[]>;
}

/**
 * As consultas de leitura. Os ids inteiros do aparelho viram os uuids
 * aqui: na nuvem, o que liga uma inspeção ao seu estabelecimento é o
 * uuid, porque o id 1 deste celular não é o id 1 de outro.
 */
const LEITURA: Record<TabelaBackup, string> = {
  estabelecimento: `
    SELECT uuid, nome, perfil_id, data_cadastro, periodicidade_auditoria_dias,
           cidade, responsavel, dias_funcionamento, hora_abertura, hora_fechamento,
           atualizado_em
      FROM estabelecimento
     WHERE atualizado_em >= ?`,

  inspecao: `
    SELECT i.uuid, e.uuid AS estabelecimento_uuid, i.trilha, i.modo, i.data_inicio,
           i.data_conclusao, i.status, i.dia_local, i.total_itens, i.atualizado_em
      FROM inspecao i
      JOIN estabelecimento e ON e.id = i.estabelecimento_id
     WHERE i.atualizado_em >= ?`,

  resposta: `
    SELECT i.uuid AS inspecao_uuid, r.item_id, r.resposta, r.respondida_em,
           r.corrigido_na_hora, r.atualizado_em
      FROM resposta r
      JOIN inspecao i ON i.id = r.inspecao_id
     WHERE r.atualizado_em >= ?`,

  item_oculto: `
    SELECT e.uuid AS estabelecimento_uuid, o.item_id, o.ocultado_em, o.atualizado_em
      FROM item_oculto o
      JOIN estabelecimento e ON e.id = o.estabelecimento_id
     WHERE o.atualizado_em >= ?`,

  acao: `
    SELECT a.uuid, e.uuid AS estabelecimento_uuid, a.item_id, i.uuid AS inspecao_uuid,
           a.descricao, a.prazo, a.status, a.criada_em, a.concluida_em, a.atualizado_em
      FROM acao a
      JOIN estabelecimento e ON e.id = a.estabelecimento_id
      LEFT JOIN inspecao i ON i.id = a.inspecao_id
     WHERE a.atualizado_em >= ?`,
};

/**
 * A chave do marcador na tabela `meta`, POR CONTA.
 *
 * Por conta porque o mesmo aparelho pode entrar em outra conta depois de
 * sair da primeira. Com um marcador só, a conta nova receberia apenas o
 * que mudou dali em diante — e o histórico inteiro ficaria de fora dela.
 */
function chaveMarcador(usuarioId: string): string {
  return `ultimo_backup:${usuarioId}`;
}

// ---------------------------------------------------------------
// UM APARELHO, UMA CONTA
// ---------------------------------------------------------------

/**
 * A conta DONA dos dados deste aparelho na nuvem.
 *
 * Os uuids são a identidade das linhas na nuvem, e a RLS amarra cada
 * linha a uma conta. Se a conta B tentasse subir as linhas que a conta A
 * já subiu, os mesmos uuids bateriam em linhas de A, e o banco recusaria
 * — corretamente — todo backup de B, para sempre.
 *
 * A regra do app, então, é simples e dita na tela: o histórico deste
 * celular pertence à primeira conta que fez backup dele (ou de onde ele
 * foi restaurado). Outra conta pode entrar, mas o backup fica parado com
 * um aviso, em vez de falhar calado.
 */
export interface DonoDoAparelho {
  id: string;
  email: string | null;
}

export function donoDoAparelho(db: SQLiteDatabase): DonoDoAparelho | null {
  const id = db.getFirstSync<{ valor: string }>(
    "SELECT valor FROM meta WHERE chave = 'dono_backup'",
  );
  if (!id) return null;
  const email = db.getFirstSync<{ valor: string }>(
    "SELECT valor FROM meta WHERE chave = 'dono_backup_email'",
  );
  return { id: id.valor, email: email?.valor ?? null };
}

/** Grava o dono — no primeiro backup, ou na restauração. */
export function definirDono(db: SQLiteDatabase, id: string, email: string | null): void {
  db.runSync(
    `INSERT INTO meta (chave, valor) VALUES ('dono_backup', ?)
     ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
    id,
  );
  if (email) {
    db.runSync(
      `INSERT INTO meta (chave, valor) VALUES ('dono_backup_email', ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      email,
    );
  }
}

/** Quando foi o último backup confirmado desta conta, ou null se nunca. */
export function lerMarcador(db: SQLiteDatabase, usuarioId: string): string | null {
  const linha = db.getFirstSync<{ valor: string }>(
    'SELECT valor FROM meta WHERE chave = ?',
    chaveMarcador(usuarioId),
  );
  return linha?.valor ?? null;
}

/**
 * O que precisa subir desde `desde` (ou tudo, se `desde` for null).
 *
 * `>=` e não `>`: reenviar uma linha que já está lá é inofensivo (o envio
 * é "insere ou atualiza"), e perder uma escrita do mesmo milissegundo do
 * marcador não seria.
 */
export function montarPacote(db: SQLiteDatabase, desde: string | null): Pacote {
  const inicio = db.getFirstSync<{ agora: string }>(
    "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS agora",
  )!.agora;

  // '' é menor que qualquer data: sem marcador, sobe tudo. É o caso do
  // primeiro backup, que leva junto as inspeções feitas antes do login.
  const corte = desde ?? '';

  const linhas = {} as Record<TabelaBackup, Linha[]>;
  for (const tabela of TABELAS_BACKUP) {
    linhas[tabela] = db.getAllSync<Linha>(LEITURA[tabela], corte);
  }

  const exclusoes = db.getAllSync<Exclusao>(
    'SELECT id, tabela, uuid, item_id FROM sync_exclusao ORDER BY id',
  );

  return { inicio, exclusoes, linhas };
}

/**
 * A nuvem confirmou o pacote: avança o marcador e esquece as exclusões
 * que já foram repassadas.
 *
 * Só as que estavam NO pacote (`id <=` a maior delas): uma exclusão
 * anotada durante o envio fica para o próximo.
 */
export function confirmarEnvio(db: SQLiteDatabase, usuarioId: string, pacote: Pacote): void {
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO meta (chave, valor) VALUES (?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      chaveMarcador(usuarioId),
      pacote.inicio,
    );

    const ultima = pacote.exclusoes[pacote.exclusoes.length - 1];
    if (ultima) {
      db.runSync('DELETE FROM sync_exclusao WHERE id <= ?', ultima.id);
    }
  });
}

/** Quantas linhas um pacote leva — para a tela dizer o que subiu. */
export function tamanhoDoPacote(pacote: Pacote): number {
  return TABELAS_BACKUP.reduce((soma, t) => soma + pacote.linhas[t].length, 0);
}

// ---------------------------------------------------------------
// RESTAURAÇÃO — o caminho de volta, num aparelho novo
// ---------------------------------------------------------------

/** O que a nuvem devolve de UM estabelecimento, já filtrado. */
export interface DadosNuvem {
  estabelecimento: Linha;
  inspecao: Linha[];
  resposta: Linha[];
  item_oculto: Linha[];
  acao: Linha[];
}

/**
 * Se o aparelho está VAZIO — sem estabelecimento cadastrado.
 *
 * É a única situação em que a restauração acontece. Num aparelho com
 * dados, juntar os dois lados seria sincronização de duas mãos, com
 * conflito a resolver — fora do escopo mínimo (plano, seção 6.7).
 */
export function aparelhoVazio(db: SQLiteDatabase): boolean {
  return db.getFirstSync('SELECT 1 FROM estabelecimento LIMIT 1') === null;
}

/**
 * Grava no aparelho um estabelecimento vindo da nuvem, com todo o seu
 * histórico.
 *
 * Os uuids e os `atualizado_em` vêm prontos e são gravados como vieram —
 * os gatilhos do schema v10 só carimbam quando eles faltam. Os ids
 * inteiros nascem aqui, novos, e a tradução uuid → id é feita no
 * caminho.
 *
 * Tudo numa transação: um aparelho com meio histórico restaurado seria
 * pior do que nenhum.
 */
export function restaurar(
  db: SQLiteDatabase,
  usuarioId: string,
  dados: DadosNuvem,
  email: string | null = null,
): void {
  if (!aparelhoVazio(db)) {
    throw new Error('Restauração só num aparelho sem estabelecimento cadastrado.');
  }

  db.withTransactionSync(() => {
    const e = dados.estabelecimento;
    const estabelecimentoId = db.runSync(
      `INSERT INTO estabelecimento
         (uuid, nome, perfil_id, data_cadastro, periodicidade_auditoria_dias,
          cidade, responsavel, dias_funcionamento, hora_abertura, hora_fechamento,
          atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      e.uuid,
      e.nome,
      e.perfil_id,
      e.data_cadastro,
      e.periodicidade_auditoria_dias,
      e.cidade,
      e.responsavel,
      e.dias_funcionamento,
      // `?? null`: um backup feito antes da v11 não traz as duas colunas,
      // e o SQLite não aceita `undefined` como parâmetro.
      e.hora_abertura ?? null,
      e.hora_fechamento ?? null,
      e.atualizado_em,
    ).lastInsertRowId;

    const idDaInspecao = new Map<string, number>();
    for (const i of dados.inspecao) {
      const id = db.runSync(
        `INSERT INTO inspecao
           (uuid, estabelecimento_id, trilha, modo, data_inicio, data_conclusao,
            status, dia_local, total_itens, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        i.uuid,
        estabelecimentoId,
        i.trilha,
        i.modo,
        i.data_inicio,
        i.data_conclusao,
        i.status,
        i.dia_local,
        i.total_itens,
        i.atualizado_em,
      ).lastInsertRowId;
      idDaInspecao.set(String(i.uuid), id);
    }

    for (const r of dados.resposta) {
      const inspecaoId = idDaInspecao.get(String(r.inspecao_uuid));
      if (inspecaoId === undefined) continue; // resposta de outro estabelecimento
      db.runSync(
        `INSERT INTO resposta
           (inspecao_id, item_id, resposta, respondida_em, corrigido_na_hora, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
        inspecaoId,
        r.item_id,
        r.resposta,
        r.respondida_em,
        r.corrigido_na_hora ?? 0,
        r.atualizado_em,
      );
    }

    for (const o of dados.item_oculto) {
      db.runSync(
        `INSERT INTO item_oculto (estabelecimento_id, item_id, ocultado_em, atualizado_em)
         VALUES (?, ?, ?, ?)`,
        estabelecimentoId,
        o.item_id,
        o.ocultado_em,
        o.atualizado_em,
      );
    }

    for (const a of dados.acao) {
      db.runSync(
        `INSERT INTO acao
           (uuid, estabelecimento_id, item_id, inspecao_id, descricao, prazo, status,
            criada_em, concluida_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        a.uuid,
        estabelecimentoId,
        a.item_id,
        a.inspecao_uuid === null ? null : (idDaInspecao.get(String(a.inspecao_uuid)) ?? null),
        a.descricao,
        a.prazo,
        a.status,
        a.criada_em,
        a.concluida_em,
        a.atualizado_em,
      );
    }

    // Os dados vieram desta conta: ela é a dona do aparelho a partir daqui.
    definirDono(db, usuarioId, email);

    // O que acabou de chegar da nuvem já está nela: o próximo backup
    // parte daqui, em vez de devolver tudo o que acabou de descer.
    db.runSync(
      `INSERT INTO meta (chave, valor) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      chaveMarcador(usuarioId),
    );
  });
}
