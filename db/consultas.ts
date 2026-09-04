/**
 * db/consultas.ts
 * ---------------------------------------------------------------
 * As consultas (leituras e escritas) que o app faz no banco.
 *
 * A ideia é que as telas NUNCA escrevam SQL direto: elas chamam uma
 * função daqui. Assim, se o schema mudar, você corrige num lugar só.
 *
 * Nesta fase há só o essencial para (a) provar que o seed funcionou e
 * (b) criar/ler o estabelecimento. As consultas do checklist filtrado
 * por perfil entram na Fase 2.
 */

import { obterBanco } from './index';

// ---------------------------------------------------------------
// DIAGNÓSTICO (temporário — usado pela tela de Início na Fase 1)
// ---------------------------------------------------------------

export interface ContagemCatalogo {
  perfis: number;
  categorias: number;
  itens: number;
  aplicabilidades: number;
}

/** Conta as linhas de cada tabela de catálogo, para conferir o seed. */
export function contarCatalogo(): ContagemCatalogo {
  const db = obterBanco();
  const contar = (tabela: string): number =>
    db.getFirstSync<{ total: number }>(`SELECT COUNT(*) AS total FROM ${tabela}`)?.total ?? 0;

  return {
    perfis: contar('perfil'),
    categorias: contar('categoria'),
    itens: contar('item'),
    aplicabilidades: contar('item_aplicabilidade'),
  };
}

/**
 * Quantos itens cada perfil enxerga. É a prova visível do filtro
 * inteligente (RF03): restaurante e ambulante têm números diferentes.
 */
export interface ItensPorPerfil {
  perfil_id: string;
  nome: string;
  total: number;
}

export function contarItensPorPerfil(): ItensPorPerfil[] {
  return obterBanco().getAllSync<ItensPorPerfil>(`
    SELECT p.id AS perfil_id, p.nome, COUNT(a.item_id) AS total
      FROM perfil p
      LEFT JOIN item_aplicabilidade a ON a.perfil_id = p.id
     GROUP BY p.id
     ORDER BY p.ordem
  `);
}

/** Quantos itens existem em cada trilha de periodicidade (Fase 5). */
export interface ItensPorFrequencia {
  frequencia: string;
  total: number;
}

export function contarItensPorFrequencia(): ItensPorFrequencia[] {
  return obterBanco().getAllSync<ItensPorFrequencia>(`
    SELECT frequencia, COUNT(*) AS total
      FROM item
     GROUP BY frequencia
     ORDER BY frequencia
  `);
}

// ---------------------------------------------------------------
// ESTABELECIMENTO
// ---------------------------------------------------------------

export interface Estabelecimento {
  id: number;
  nome: string;
  perfil_id: string;
  data_cadastro: string;
  periodicidade_auditoria_dias: number;
}

/**
 * O estabelecimento atual — ou `null` se ainda não houver nenhum.
 *
 * O MVP trabalha com UM estabelecimento (por isso o LIMIT 1), mas a
 * tabela já tem `id`, então suportar vários no futuro é só trocar
 * esta consulta, sem mexer no banco.
 */
export function obterEstabelecimento(): Estabelecimento | null {
  return obterBanco().getFirstSync<Estabelecimento>(
    'SELECT * FROM estabelecimento ORDER BY id LIMIT 1',
  );
}

/** Data de hoje no formato 'AAAA-MM-DD' usado pelo banco. */
export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cria o estabelecimento. A periodicidade da auditoria é copiada do
 * perfil (padrão 30 dias) e vira um valor próprio do estabelecimento,
 * que o usuário poderá editar na Fase 5.
 */
export function criarEstabelecimento(nome: string, perfilId: string): number {
  const db = obterBanco();

  const perfil = db.getFirstSync<{ periodicidade_auditoria_dias: number }>(
    'SELECT periodicidade_auditoria_dias FROM perfil WHERE id = ?',
    perfilId,
  );

  if (!perfil) {
    throw new Error(`Perfil desconhecido: ${perfilId}`);
  }

  const resultado = db.runSync(
    `INSERT INTO estabelecimento
       (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES (?, ?, ?, ?)`,
    nome,
    perfilId,
    hojeISO(),
    perfil.periodicidade_auditoria_dias,
  );

  return resultado.lastInsertRowId;
}
