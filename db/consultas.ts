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

/**
 * Agora, como timestamp ISO completo ('2026-09-05T14:03:21.000Z').
 * Usado nas inspeções e respostas, onde a hora importa para ordenar
 * dois registros do mesmo dia (ver comentário do SCHEMA_V3).
 */
export function agoraISO(): string {
  return new Date().toISOString();
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

/**
 * As três TRILHAS de periodicidade. A trilha de um item vem do seed
 * (coluna `frequencia`); o que cada uma significa em prazo é decisão do
 * app e será tratado na Fase 5.
 */
export type Trilha = 'diario' | 'periodico' | 'semestral';

/** As três trilhas na ordem em que aparecem para o usuário. */
export const TRILHAS: Trilha[] = ['diario', 'periodico', 'semestral'];

export interface ItemChecklist {
  id: string;
  codigo_rdc: string;
  texto: string;
  frequencia: Trilha;
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
 * A Fase 3 acrescentou os dois filtros opcionais do `filtro`:
 *  - `trilha` recorta o checklist por periodicidade (a tela de execução
 *    sempre passa este parâmetro);
 *  - `estabelecimentoId` tira da lista os itens marcados como "Não se
 *    Aplica" naquele estabelecimento (RF09).
 * Sem `filtro`, a função continua devolvendo o checklist inteiro do
 * perfil, exatamente como na Fase 2.
 */
export interface FiltroChecklist {
  trilha?: Trilha;
  /** Quando informado, esconde os itens em `item_oculto` (RF09). */
  estabelecimentoId?: number;
}

export function checklistDoPerfil(
  perfilId: string,
  filtro: FiltroChecklist = {},
): GrupoCategoria[] {
  // As condições são montadas em pedaços porque são opcionais. Repare
  // que só o TEXTO da condição é concatenado: os VALORES continuam indo
  // como parâmetro (?), que é o que protege contra SQL injection.
  const condicoes = ['a.perfil_id = ?'];
  const parametros: (string | number)[] = [perfilId];

  if (filtro.trilha) {
    condicoes.push('i.frequencia = ?');
    parametros.push(filtro.trilha);
  }

  if (filtro.estabelecimentoId !== undefined) {
    condicoes.push(
      'i.id NOT IN (SELECT item_id FROM item_oculto WHERE estabelecimento_id = ?)',
    );
    parametros.push(filtro.estabelecimentoId);
  }

  const linhas = obterBanco().getAllSync<ItemChecklist>(
    `SELECT i.id, i.codigo_rdc, i.texto, i.frequencia, i.critico, i.peso,
            i.periodicidade_dias,
            c.id         AS categoria_id,
            c.nome       AS categoria_nome,
            c.codigo_rdc AS categoria_codigo
       FROM item i
       JOIN item_aplicabilidade a ON a.item_id = i.id
       JOIN categoria c           ON c.id      = i.categoria_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY c.ordem, i.ordem`,
    ...parametros,
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

/**
 * Números do checklist de um perfil, para o painel de Início.
 *
 * `estabelecimentoId` é opcional, mas quando informado desconta os itens
 * ocultos (RF09) — senão o Início mostraria 86 itens enquanto as trilhas
 * mostram 84, e o usuário não teria como entender a diferença.
 */
export function resumoDoPerfil(perfilId: string, estabelecimentoId?: number): ResumoPerfil {
  const condicoes = ['a.perfil_id = ?'];
  const parametros: (string | number)[] = [perfilId];

  if (estabelecimentoId !== undefined) {
    condicoes.push(
      'i.id NOT IN (SELECT item_id FROM item_oculto WHERE estabelecimento_id = ?)',
    );
    parametros.push(estabelecimentoId);
  }

  const linha = obterBanco().getFirstSync<ResumoPerfil>(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT i.categoria_id) AS categorias,
            SUM(CASE WHEN i.frequencia = 'diario'    THEN 1 ELSE 0 END) AS diario,
            SUM(CASE WHEN i.frequencia = 'periodico' THEN 1 ELSE 0 END) AS periodico,
            SUM(CASE WHEN i.frequencia = 'semestral' THEN 1 ELSE 0 END) AS semestral
       FROM item i
       JOIN item_aplicabilidade a ON a.item_id = i.id
      WHERE ${condicoes.join(' AND ')}`,
    ...parametros,
  );

  return linha ?? { total: 0, categorias: 0, diario: 0, periodico: 0, semestral: 0 };
}

/**
 * Quantos itens cada trilha tem, já descontando os ocultos (RF09).
 * Alimenta os três cartões da tela "Nova Inspeção".
 */
export function contarItensPorTrilha(
  perfilId: string,
  estabelecimentoId: number,
): Record<Trilha, number> {
  const linhas = obterBanco().getAllSync<{ frequencia: Trilha; total: number }>(
    `SELECT i.frequencia, COUNT(*) AS total
       FROM item i
       JOIN item_aplicabilidade a ON a.item_id = i.id
      WHERE a.perfil_id = ?
        AND i.id NOT IN (SELECT item_id FROM item_oculto WHERE estabelecimento_id = ?)
      GROUP BY i.frequencia`,
    perfilId,
    estabelecimentoId,
  );

  // O SQL só devolve linha para trilha que tem item; começamos em zero
  // para as três, senão uma trilha vazia viria como `undefined`.
  const contagem: Record<Trilha, number> = { diario: 0, periodico: 0, semestral: 0 };
  for (const linha of linhas) {
    contagem[linha.frequencia] = linha.total;
  }
  return contagem;
}

// ---------------------------------------------------------------
// EXECUÇÃO DA INSPEÇÃO (RF06)
// ---------------------------------------------------------------

/** As quatro respostas possíveis para um item (RF06). */
export type Resposta = 'adequado' | 'inadequado' | 'nao_se_aplica' | 'nao_observado';

export interface Inspecao {
  id: number;
  estabelecimento_id: number;
  trilha: Trilha;
  data_inicio: string;
  data_conclusao: string | null;
  status: 'em_andamento' | 'concluida';
}

/**
 * Abre uma inspeção de uma trilha — ou devolve a que já está em
 * andamento.
 *
 * O "ou" é importante: se o usuário fecha o app no meio do checklist e
 * volta depois, ele deve continuar de onde parou, e não começar uma
 * inspeção vazia por cima. Como as respostas são gravadas uma a uma
 * (ver `salvarResposta`), retomar é só reabrir a mesma inspeção.
 */
export function iniciarInspecao(estabelecimentoId: number, trilha: Trilha): Inspecao {
  const db = obterBanco();

  const emAndamento = db.getFirstSync<Inspecao>(
    `SELECT * FROM inspecao
      WHERE estabelecimento_id = ? AND trilha = ? AND status = 'em_andamento'
      ORDER BY id DESC LIMIT 1`,
    estabelecimentoId,
    trilha,
  );
  if (emAndamento) return emAndamento;

  const resultado = db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, data_inicio, status)
     VALUES (?, ?, ?, 'em_andamento')`,
    estabelecimentoId,
    trilha,
    agoraISO(),
  );

  return db.getFirstSync<Inspecao>(
    'SELECT * FROM inspecao WHERE id = ?',
    resultado.lastInsertRowId,
  )!;
}

/**
 * As respostas já dadas numa inspeção, no formato
 * `{ 'edif_01': 'adequado', 'edif_02': 'inadequado' }`.
 *
 * Devolvemos um objeto (e não a lista de linhas) porque a tela precisa
 * responder rápido a "qual é a resposta DESTE item?" ao desenhar cada
 * linha — procurar numa lista de 80 itens a cada redesenho seria
 * desperdício.
 */
export function respostasDaInspecao(inspecaoId: number): Record<string, Resposta> {
  const linhas = obterBanco().getAllSync<{ item_id: string; resposta: Resposta }>(
    'SELECT item_id, resposta FROM resposta WHERE inspecao_id = ?',
    inspecaoId,
  );

  const mapa: Record<string, Resposta> = {};
  for (const linha of linhas) {
    mapa[linha.item_id] = linha.resposta;
  }
  return mapa;
}

/**
 * Grava (ou troca) a resposta de um item — e cuida do RF09 de quebra.
 *
 * GRAVA NA HORA, a cada toque, em vez de esperar um botão "salvar" no
 * fim. É a regra offline-first: o app pode ser fechado no meio de uma
 * cozinha corrida, e nenhuma resposta pode se perder por isso.
 *
 * O `ON CONFLICT ... DO UPDATE` é o "insere, ou atualiza se já existir"
 * do SQLite: como a chave primária é (inspecao_id, item_id), mudar de
 * ideia sobre um item sobrescreve a linha em vez de duplicá-la.
 *
 * O efeito colateral no fim é o RF09, nas duas direções: marcar "não se
 * aplica" oculta o item nas próximas inspeções; trocar para qualquer
 * outra resposta desfaz o ocultamento.
 */
export function salvarResposta(
  inspecaoId: number,
  itemId: string,
  resposta: Resposta,
): void {
  const db = obterBanco();

  db.runSync(
    `INSERT INTO resposta (inspecao_id, item_id, resposta, respondida_em)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (inspecao_id, item_id)
     DO UPDATE SET resposta = excluded.resposta, respondida_em = excluded.respondida_em`,
    inspecaoId,
    itemId,
    resposta,
    agoraISO(),
  );

  // De qual estabelecimento é esta inspeção? O RF09 é por estabelecimento,
  // não por inspeção, então precisamos do dono para ocultar o item.
  const dono = db.getFirstSync<{ estabelecimento_id: number }>(
    'SELECT estabelecimento_id FROM inspecao WHERE id = ?',
    inspecaoId,
  );
  if (!dono) return;

  if (resposta === 'nao_se_aplica') {
    ocultarItem(dono.estabelecimento_id, itemId);
  } else {
    reexibirItem(dono.estabelecimento_id, itemId);
  }
}

/**
 * Fecha a inspeção: carimba a data e muda o status.
 *
 * A partir daqui ela aparece no Histórico e, na Fase 4, ganha score.
 * Na Fase 5, `data_conclusao` vira a base do próximo vencimento da
 * trilha — por isso ela só é gravada aqui, e não a cada resposta.
 */
export function concluirInspecao(inspecaoId: number): void {
  obterBanco().runSync(
    `UPDATE inspecao SET status = 'concluida', data_conclusao = ?
      WHERE id = ? AND status = 'em_andamento'`,
    agoraISO(),
    inspecaoId,
  );
}

export interface ResumoInspecao {
  id: number;
  trilha: Trilha;
  data_inicio: string;
  data_conclusao: string | null;
  status: 'em_andamento' | 'concluida';
  respondidos: number;
  adequados: number;
  inadequados: number;
}

/**
 * As inspeções de um estabelecimento, da mais recente para a mais
 * antiga, com a contagem de respostas de cada uma. Alimenta o Histórico.
 *
 * As contagens saem de subconsultas em vez de um JOIN + GROUP BY porque
 * assim uma inspeção sem nenhuma resposta ainda aparece na lista, com
 * zero — que é justamente o caso de quem acabou de abrir uma trilha.
 *
 * Aqui NÃO há score: contar adequados e inadequados é dado bruto. Virar
 * percentual de conformidade, com peso e item crítico, é a Fase 4.
 */
export function listarInspecoes(estabelecimentoId: number): ResumoInspecao[] {
  return obterBanco().getAllSync<ResumoInspecao>(
    `SELECT i.id, i.trilha, i.data_inicio, i.data_conclusao, i.status,
            (SELECT COUNT(*) FROM resposta r
              WHERE r.inspecao_id = i.id)                          AS respondidos,
            (SELECT COUNT(*) FROM resposta r
              WHERE r.inspecao_id = i.id AND r.resposta = 'adequado')   AS adequados,
            (SELECT COUNT(*) FROM resposta r
              WHERE r.inspecao_id = i.id AND r.resposta = 'inadequado') AS inadequados
       FROM inspecao i
      WHERE i.estabelecimento_id = ?
      ORDER BY i.data_inicio DESC, i.id DESC`,
    estabelecimentoId,
  );
}

// ---------------------------------------------------------------
// ITENS OCULTOS — "NÃO SE APLICA" (RF09)
// ---------------------------------------------------------------

/**
 * Esconde um item nas PRÓXIMAS inspeções deste estabelecimento.
 *
 * `INSERT OR IGNORE` evita erro se o item já estiver oculto: marcar de
 * novo simplesmente não faz nada.
 */
export function ocultarItem(estabelecimentoId: number, itemId: string): void {
  obterBanco().runSync(
    `INSERT OR IGNORE INTO item_oculto (estabelecimento_id, item_id, ocultado_em)
     VALUES (?, ?, ?)`,
    estabelecimentoId,
    itemId,
    agoraISO(),
  );
}

/** Desfaz o ocultamento: o item volta a aparecer no checklist. */
export function reexibirItem(estabelecimentoId: number, itemId: string): void {
  obterBanco().runSync(
    'DELETE FROM item_oculto WHERE estabelecimento_id = ? AND item_id = ?',
    estabelecimentoId,
    itemId,
  );
}

export interface ItemOculto {
  item_id: string;
  codigo_rdc: string;
  texto: string;
  categoria_nome: string;
  ocultado_em: string;
}

/**
 * Os itens que o usuário marcou como "não se aplica", com o texto da
 * norma junto — para ele poder revisar a decisão e voltar atrás.
 *
 * Uma lista visível importa: sem ela, o RF09 seria uma porta só de ida,
 * e um toque errado esconderia uma exigência para sempre, sem aviso.
 */
export function listarItensOcultos(estabelecimentoId: number): ItemOculto[] {
  return obterBanco().getAllSync<ItemOculto>(
    `SELECT o.item_id, o.ocultado_em,
            i.codigo_rdc, i.texto,
            c.nome AS categoria_nome
       FROM item_oculto o
       JOIN item i      ON i.id = o.item_id
       JOIN categoria c ON c.id = i.categoria_id
      WHERE o.estabelecimento_id = ?
      ORDER BY c.ordem, i.ordem`,
    estabelecimentoId,
  );
}
