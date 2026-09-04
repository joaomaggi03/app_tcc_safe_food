/**
 * db/schema.ts
 * ---------------------------------------------------------------
 * O DESENHO DO BANCO. Este arquivo só descreve as tabelas e cuida
 * das "migrações" — ele não insere dados (isso é o db/seed.ts).
 *
 * Duas ideias importantes aqui:
 *
 * 1) TABELAS DE CATÁLOGO x TABELAS DO USUÁRIO
 *    - Catálogo = a norma virada dado: `perfil`, `categoria`, `item`,
 *      `item_aplicabilidade`. Vêm do data/rdc216.ts e são reescritas
 *      sempre que o seed muda. Você nunca edita isso pelo app.
 *    - Usuário = o que a pessoa cria: `estabelecimento` (e, nas fases
 *      seguintes, inspeções e respostas). O seed NUNCA toca nelas.
 *
 * 2) MIGRAÇÃO VERSIONADA
 *    O SQLite guarda um número inteiro chamado `user_version`. Usamos
 *    ele para saber qual versão do schema já está no aparelho. Quando
 *    uma fase futura precisar de tabelas novas (inspeção, resposta,
 *    status_trilha...), você adiciona um bloco novo em `migrar()` e
 *    sobe a VERSAO_SCHEMA — os apps já instalados se atualizam sozinhos,
 *    sem perder os dados do usuário.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

/** Suba este número sempre que adicionar/alterar tabelas em `migrar()`. */
export const VERSAO_SCHEMA = 1;

/**
 * Versão 1 do schema: catálogo da RDC 216 + o estabelecimento.
 *
 * Convenções adotadas:
 *  - IDs de catálogo são TEXT e vêm do seed ('restaurante', 'edif_01'...),
 *    o que mantém a rastreabilidade com o arquivo da norma.
 *  - Booleanos viram INTEGER 0/1 (o SQLite não tem tipo booleano).
 *  - Datas viram TEXT no formato 'AAAA-MM-DD' (ISO 8601). Nesse formato
 *    a comparação alfabética é igual à comparação cronológica, o que
 *    facilita as contas de vencimento da Fase 5.
 *  - `ordem` preserva a ordem em que as coisas aparecem no seed (que é a
 *    ordem da norma), já que SELECT sem ORDER BY não garante ordem.
 */
const SCHEMA_V1 = `
  -- Os 6 perfis de negócio (RF02).
  CREATE TABLE IF NOT EXISTS perfil (
    id                            TEXT PRIMARY KEY,
    nome                          TEXT    NOT NULL,
    descricao                     TEXT    NOT NULL,
    periodicidade_auditoria_dias  INTEGER NOT NULL,
    ordem                         INTEGER NOT NULL
  );

  -- Os 12 blocos temáticos da RDC (seções 4.1 a 4.12).
  CREATE TABLE IF NOT EXISTS categoria (
    id               TEXT PRIMARY KEY,
    nome             TEXT    NOT NULL,
    codigo_rdc       TEXT    NOT NULL,
    pop_obrigatorio  INTEGER NOT NULL DEFAULT 0,
    ordem            INTEGER NOT NULL
  );

  -- Cada exigência da norma.
  CREATE TABLE IF NOT EXISTS item (
    id                  TEXT PRIMARY KEY,
    categoria_id        TEXT    NOT NULL REFERENCES categoria(id),
    codigo_rdc          TEXT    NOT NULL,
    texto               TEXT    NOT NULL,
    frequencia          TEXT    NOT NULL
                          CHECK (frequencia IN ('diario', 'periodico', 'semestral')),
    critico             INTEGER NOT NULL DEFAULT 0,
    peso                INTEGER NOT NULL DEFAULT 1,
    -- Só preenchido nos itens de frequência legal fixa (água: 180 dias).
    periodicidade_dias  INTEGER,
    ordem               INTEGER NOT NULL
  );

  -- O FILTRO INTELIGENTE (RF03): quais itens aparecem para qual perfil.
  -- É uma tabela de ligação: uma linha por par item+perfil.
  CREATE TABLE IF NOT EXISTS item_aplicabilidade (
    item_id    TEXT NOT NULL REFERENCES item(id)   ON DELETE CASCADE,
    perfil_id  TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, perfil_id)
  );

  -- O ESTABELECIMENTO do usuário. Dado do usuário: o seed não mexe aqui.
  -- É a âncora do app: inspeções, itens ocultos (RF09) e as trilhas de
  -- periodicidade (Fase 5) vão todos apontar para esta tabela.
  CREATE TABLE IF NOT EXISTS estabelecimento (
    id                            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome                          TEXT NOT NULL,
    perfil_id                     TEXT NOT NULL REFERENCES perfil(id),
    -- Base de cálculo do primeiro vencimento na Fase 5, quando ainda não
    -- existe nenhuma inspeção concluída.
    data_cadastro                 TEXT NOT NULL,
    -- Copiado do perfil na criação, mas editável pelo usuário depois
    -- (a auditoria periódica é regra de negócio, não exigência legal).
    periodicidade_auditoria_dias  INTEGER NOT NULL
  );

  -- Índices: aceleram os JOINs que a Fase 2 vai fazer para montar o checklist.
  CREATE INDEX IF NOT EXISTS idx_item_categoria    ON item (categoria_id);
  CREATE INDEX IF NOT EXISTS idx_aplic_perfil      ON item_aplicabilidade (perfil_id);

  -- Guarda qual versão do seed já foi carregada (ver db/seed.ts).
  CREATE TABLE IF NOT EXISTS meta (
    chave  TEXT PRIMARY KEY,
    valor  TEXT NOT NULL
  );
`;

/**
 * Cria/atualiza as tabelas conforme a versão do schema no aparelho.
 *
 * Roda em toda abertura do app, mas cada bloco só executa uma vez:
 * se `user_version` já é 1, o bloco da v1 é pulado.
 */
export function migrar(db: SQLiteDatabase): void {
  const linha = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const versaoAtual = linha?.user_version ?? 0;

  if (versaoAtual >= VERSAO_SCHEMA) return;

  if (versaoAtual < 1) {
    db.execSync(SCHEMA_V1);
  }

  // Fases futuras entram aqui:
  //   if (versaoAtual < 2) { db.execSync(SCHEMA_V2); }   // inspeção + resposta (Fase 3)
  //   if (versaoAtual < 3) { db.execSync(SCHEMA_V3); }   // status_trilha (Fase 5)

  // PRAGMA não aceita parâmetro (?), por isso a interpolação direta.
  // É seguro aqui porque VERSAO_SCHEMA é uma constante nossa, não entrada do usuário.
  db.execSync(`PRAGMA user_version = ${VERSAO_SCHEMA}`);
}
