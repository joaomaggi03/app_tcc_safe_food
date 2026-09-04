/**
 * db/consultas.ts
 * ---------------------------------------------------------------
 * As consultas (leituras e escritas) que o app faz no banco.
 *
 * A ideia é que as telas NUNCA escrevam SQL direto: elas chamam uma
 * função daqui. Assim, se o schema mudar, você corrige num lugar só.
 */

import { obterBanco } from './index';

// ---------------------------------------------------------------
// CATÁLOGO DA NORMA
// ---------------------------------------------------------------

export interface Perfil {
  id: string;
  nome: string;
  descricao: string;
  periodicidade_auditoria_dias: number;
}

/** Os 6 perfis, na ordem do seed. Alimenta a tela de cadastro. */
export function listarPerfis(): Perfil[] {
  return obterBanco().getAllSync<Perfil>('SELECT * FROM perfil ORDER BY ordem');
}

export interface ContagemCatalogo {
  perfis: number;
  categorias: number;
  itens: number;
  aplicabilidades: number;
}

/** Conta as linhas de cada tabela de catálogo (rodapé informativo do Início). */
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

export interface ItensPorPerfil {
  perfil_id: string;
  nome: string;
  total: number;
}

/**
 * Quantos itens cada perfil enxerga. Mostrado na tela de cadastro, ao
 * lado de cada opção — deixa o filtro inteligente visível antes mesmo
 * de o usuário escolher.
 */
export function contarItensPorPerfil(): ItensPorPerfil[] {
  return obterBanco().getAllSync<ItensPorPerfil>(`
    SELECT p.id AS perfil_id, p.nome, COUNT(a.item_id) AS total
      FROM perfil p
      LEFT JOIN item_aplicabilidade a ON a.perfil_id = p.id
     GROUP BY p.id
     ORDER BY p.ordem
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
  cidade: string | null;
  responsavel: string | null;
}

/** Os campos que a tela de cadastro preenche. */
export interface DadosEstabelecimento {
  nome: string;
  perfilId: string;
  cidade?: string;
  responsavel?: string;
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

/** Texto vazio ou só com espaços vira NULL no banco. */
function ouNulo(texto: string | undefined): string | null {
  const limpo = texto?.trim();
  return limpo ? limpo : null;
}

/**
 * Cria o estabelecimento, ou atualiza o que já existe.
 *
 * Uma função só para os dois casos porque a tela é a mesma: no primeiro
 * acesso ela cadastra; depois, o botão "Editar" do Início reabre a mesma
 * tela para alterar.
 *
 * Duas regras que valem entender:
 *  - `data_cadastro` é gravada uma vez e nunca muda. A Fase 5 usa essa
 *    data como base do primeiro vencimento das trilhas; se ela se movesse
 *    a cada edição, o prazo se renovaria sozinho.
 *  - `periodicidade_auditoria_dias` é copiada do perfil na CRIAÇÃO e
 *    preservada na edição, porque na Fase 5 o usuário poderá ajustá-la à
 *    mão e não queremos desfazer esse ajuste.
 */
export function salvarEstabelecimento(dados: DadosEstabelecimento): Estabelecimento {
  const db = obterBanco();

  const perfil = db.getFirstSync<{ periodicidade_auditoria_dias: number }>(
    'SELECT periodicidade_auditoria_dias FROM perfil WHERE id = ?',
    dados.perfilId,
  );
  if (!perfil) {
    throw new Error(`Perfil desconhecido: ${dados.perfilId}`);
  }

  const existente = obterEstabelecimento();

  if (existente) {
    db.runSync(
      `UPDATE estabelecimento
          SET nome = ?, perfil_id = ?, cidade = ?, responsavel = ?
        WHERE id = ?`,
      dados.nome.trim(),
      dados.perfilId,
      ouNulo(dados.cidade),
      ouNulo(dados.responsavel),
      existente.id,
    );
  } else {
    db.runSync(
      `INSERT INTO estabelecimento
         (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias, cidade, responsavel)
       VALUES (?, ?, ?, ?, ?, ?)`,
      dados.nome.trim(),
      dados.perfilId,
      hojeISO(),
      perfil.periodicidade_auditoria_dias,
      ouNulo(dados.cidade),
      ouNulo(dados.responsavel),
    );
  }

  // Relê do banco para devolver a linha exatamente como ela ficou gravada.
  return obterEstabelecimento()!;
}

// ---------------------------------------------------------------
// CHECKLIST FILTRADO POR PERFIL (RF03)
// ---------------------------------------------------------------

export interface ItemChecklist {
  id: string;
  codigo_rdc: string;
  texto: string;
  frequencia: 'diario' | 'periodico' | 'semestral';
  /** 0 ou 1 — o SQLite não tem tipo booleano. */
  critico: number;
  peso: number;
  periodicidade_dias: number | null;
  categoria_id: string;
  categoria_nome: string;
  categoria_codigo: string;
}

export interface GrupoCategoria {
  categoriaId: string;
  titulo: string;
  codigoRdc: string;
  itens: ItemChecklist[];
}

/**
 * O CORAÇÃO DA FASE 2. Devolve os itens da norma que se aplicam a um
 * perfil, já agrupados por categoria e na ordem da RDC.
 *
 * O filtro inteligente (RF03) é o JOIN com `item_aplicabilidade`: só
 * sobrevivem os itens que têm uma linha ligando-os a este perfil. É a
 * mesma consulta para todo mundo — muda só o parâmetro. Por isso
 * "food truck" devolve 75 itens e "restaurante", 86.
 *
 * O agrupamento é feito aqui no TypeScript, e não no SQL, porque o SQL
 * devolve uma tabela plana: virar "categoria -> lista de itens" é
 * trabalho de código.
 *
 * Na Fase 3 esta consulta ganha mais um filtro, para esconder os itens
 * marcados como "Não se Aplica" (RF09).
 */
export function checklistDoPerfil(perfilId: string): GrupoCategoria[] {
  const linhas = obterBanco().getAllSync<ItemChecklist>(
    `SELECT i.id, i.codigo_rdc, i.texto, i.frequencia, i.critico, i.peso,
            i.periodicidade_dias,
            c.id         AS categoria_id,
            c.nome       AS categoria_nome,
            c.codigo_rdc AS categoria_codigo
       FROM item i
       JOIN item_aplicabilidade a ON a.item_id = i.id
       JOIN categoria c           ON c.id      = i.categoria_id
      WHERE a.perfil_id = ?
      ORDER BY c.ordem, i.ordem`,
    perfilId,
  );

  const grupos: GrupoCategoria[] = [];

  for (const linha of linhas) {
    // Como o SQL já vem ordenado por categoria, basta olhar o último
    // grupo criado: se for o mesmo, acumula; se mudou, abre um novo.
    const ultimo = grupos[grupos.length - 1];

    if (ultimo && ultimo.categoriaId === linha.categoria_id) {
      ultimo.itens.push(linha);
    } else {
      grupos.push({
        categoriaId: linha.categoria_id,
        titulo: linha.categoria_nome,
        codigoRdc: linha.categoria_codigo,
        itens: [linha],
      });
    }
  }

  return grupos;
}

export interface ResumoPerfil {
  total: number;
  categorias: number;
  diario: number;
  periodico: number;
  semestral: number;
}

/** Números do checklist de um perfil, para o painel de Início. */
export function resumoDoPerfil(perfilId: string): ResumoPerfil {
  const linha = obterBanco().getFirstSync<ResumoPerfil>(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT i.categoria_id) AS categorias,
            SUM(CASE WHEN i.frequencia = 'diario'    THEN 1 ELSE 0 END) AS diario,
            SUM(CASE WHEN i.frequencia = 'periodico' THEN 1 ELSE 0 END) AS periodico,
            SUM(CASE WHEN i.frequencia = 'semestral' THEN 1 ELSE 0 END) AS semestral
       FROM item i
       JOIN item_aplicabilidade a ON a.item_id = i.id
      WHERE a.perfil_id = ?`,
    perfilId,
  );

  return linha ?? { total: 0, categorias: 0, diario: 0, periodico: 0, semestral: 0 };
}
