/**
 * db/consultas.ts
 * ---------------------------------------------------------------
 * As consultas (leituras e escritas) que o app faz no banco.
 *
 * A ideia é que as telas NUNCA escrevam SQL direto: elas chamam uma
 * função daqui. Assim, se o schema mudar, você corrige num lugar só.
 */

import type { MomentoDia } from '../data/rdc216';
import { ROTINA_DIARIA } from '../data/rotina-diaria';
import { diaLocalHaDias, diaLocalISO } from './datas';
import { obterBanco } from './index';

// Reexportado para as telas não precisarem importar de dois lugares.
export type { MomentoDia };

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

// As contas de data moram em `db/datas.ts`, sem banco e sem React, para
// poderem ser testadas fora do aparelho. Reexportadas aqui porque as
// telas já importam tudo de `consultas`.
export { diaLocalHaDias, diaLocalISO } from './datas';

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
  /** O texto completo da norma — mostrado só quando o usuário pede. */
  texto: string;
  /** O resumo em tópicos, que é o que aparece no checklist. */
  topicos: string[];
  frequencia: Trilha;
  /** Momento do expediente — preenchido só nos itens da trilha diária. */
  momento: MomentoDia | null;
  /** 0 ou 1 — o SQLite não tem tipo booleano. */
  critico: number;
  peso: number;
  periodicidade_dias: number | null;
  categoria_id: string;
  categoria_nome: string;
  categoria_codigo: string;
}

/** Uma seção da RDC (4.2, 4.6...) com os itens dela. */
export interface SecaoCategoria {
  categoriaId: string;
  nome: string;
  codigoRdc: string;
  itens: ItemChecklist[];
}

/**
 * Um bloco recolhível do checklist na tela.
 *
 * O checklist tem DOIS níveis, e o de cima muda conforme a trilha:
 *
 *  - DIÁRIA: o nível de cima é o momento do expediente (antes de abrir
 *    -> durante o serviço -> no fechamento), porque ela é preenchida ao
 *    longo do dia e precisa ler como um roteiro. Dentro de cada momento,
 *    os itens vêm separados por seção da RDC.
 *  - DEMAIS TRILHAS: não há momento, então o nível de cima já é a seção
 *    da RDC — que é como uma auditoria é conduzida e conferida.
 *
 * `subdividido` diz à tela se ela deve desenhar os cabeçalhos de seção
 * lá dentro. Nas trilhas sem momento seria repetir o mesmo título duas
 * vezes, então ele vem `false`.
 */
export interface GrupoChecklist {
  chave: string;
  titulo: string;
  /** Selo curto à esquerda: o código da RDC, ou a ordem do momento. */
  etiqueta: string;
  total: number;
  subdividido: boolean;
  secoes: SecaoCategoria[];
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
 * A Fase 3 acrescentou os dois primeiros filtros opcionais; a Fase 4, o
 * terceiro:
 *  - `trilha` recorta o checklist por periodicidade (a tela de execução
 *    sempre passa este parâmetro);
 *  - `estabelecimentoId` tira da lista os itens marcados como "Não se
 *    Aplica" naquele estabelecimento (RF09);
 *  - `somenteCriticos` é o MODO ESSENCIAL da diária: 12 itens em vez de
 *    32. Não é um checklist diferente, é um recorte do mesmo — por isso
 *    as respostas dadas no essencial continuam valendo se o usuário
 *    abrir a versão completa depois.
 * Sem `filtro`, a função continua devolvendo o checklist inteiro do
 * perfil, exatamente como na Fase 2.
 */
export interface FiltroChecklist {
  trilha?: Trilha;
  /** Quando informado, esconde os itens em `item_oculto` (RF09). */
  estabelecimentoId?: number;
  /** Modo essencial: só os itens críticos da trilha. */
  somenteCriticos?: boolean;
}

/**
 * A linha crua do SQL: igual ao `ItemChecklist`, mas com `topicos` ainda
 * como o texto JSON que está gravado na coluna.
 */
type LinhaItem = Omit<ItemChecklist, 'topicos'> & { topicos: string | null };

/**
 * Converte a linha do banco no item que as telas usam.
 *
 * O `try` existe porque a coluna pode estar vazia num aparelho que
 * migrou para o schema v5 mas ainda não rodou o seed novo — nesse
 * intervalo o item aparece sem resumo, com o texto completo, em vez de
 * derrubar a tela.
 */
function comTopicos(linha: LinhaItem): ItemChecklist {
  let topicos: string[] = [];
  try {
    topicos = linha.topicos ? (JSON.parse(linha.topicos) as string[]) : [];
  } catch {
    topicos = [];
  }
  return { ...linha, topicos };
}

/** Títulos dos blocos da trilha diária, na ordem do expediente. */
const TITULO_MOMENTO: Record<MomentoDia, string> = {
  abertura: 'Antes de abrir',
  servico: 'Durante o serviço',
  fechamento: 'No fechamento',
};

export function checklistDoPerfil(
  perfilId: string,
  filtro: FiltroChecklist = {},
): GrupoChecklist[] {
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

  if (filtro.somenteCriticos) {
    condicoes.push('i.critico = 1');
  }

  // A diária sai na ordem do expediente; o resto, na ordem da norma.
  // O CASE traduz o texto do momento em número só para ordenar (o
  // alfabeto colocaria 'abertura', 'fechamento', 'servico' — errado).
  const porMomento = filtro.trilha === 'diario';
  const ordem = porMomento
    ? `CASE i.momento
         WHEN 'abertura'   THEN 0
         WHEN 'servico'    THEN 1
         WHEN 'fechamento' THEN 2
         ELSE 3
       END, c.ordem, i.ordem`
    : 'c.ordem, i.ordem';

  const linhas = obterBanco().getAllSync<LinhaItem>(
    `SELECT i.id, i.codigo_rdc, i.texto, i.topicos, i.frequencia, i.momento,
            i.critico, i.peso, i.periodicidade_dias,
            c.id         AS categoria_id,
            c.nome       AS categoria_nome,
            c.codigo_rdc AS categoria_codigo
       FROM item i
       JOIN item_aplicabilidade a ON a.item_id = i.id
       JOIN categoria c           ON c.id      = i.categoria_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY ${ordem}`,
    ...parametros,
  );

  const grupos: GrupoChecklist[] = [];

  for (const bruta of linhas) {
    const linha = comTopicos(bruta);
    // Cada linha carrega a sua chave de grupo: o momento do dia na
    // diária, a seção da RDC nas demais trilhas. Como o SQL já vem
    // ordenado por essa mesma chave, basta olhar o último grupo criado:
    // se for o mesmo, acumula; se mudou, abre um novo. Vale igual para
    // as seções dentro do grupo.
    const chave = porMomento ? (linha.momento ?? 'servico') : linha.categoria_id;
    let grupo = grupos[grupos.length - 1];

    if (!grupo || grupo.chave !== chave) {
      grupo = porMomento
        ? {
            chave,
            titulo: TITULO_MOMENTO[chave as MomentoDia],
            etiqueta: String(grupos.length + 1),
            total: 0,
            subdividido: true,
            secoes: [],
          }
        : {
            chave,
            titulo: linha.categoria_nome,
            etiqueta: linha.categoria_codigo,
            total: 0,
            subdividido: false,
            secoes: [],
          };
      grupos.push(grupo);
    }

    let secao = grupo.secoes[grupo.secoes.length - 1];

    if (!secao || secao.categoriaId !== linha.categoria_id) {
      secao = {
        categoriaId: linha.categoria_id,
        nome: linha.categoria_nome,
        codigoRdc: linha.categoria_codigo,
        itens: [],
      };
      grupo.secoes.push(secao);
    }

    secao.itens.push(linha);
    grupo.total += 1;
  }

  return grupos;
}

// ---------------------------------------------------------------
// ROTINA DIÁRIA GUIADA
// ---------------------------------------------------------------

/** Uma verificação da rotina, já com os itens da norma que ela cobre. */
export interface VerificacaoChecklist {
  id: string;
  titulo: string;
  texto: string;
  /** Os itens da RDC cobertos, já filtrados por perfil e por RF09. */
  itens: ItemChecklist[];
  /** Códigos da RDC cobertos ('4.6.2', '4.6.3'…), para exibir na tela. */
  codigos: string[];
  /** Se cobre ao menos um item crítico. */
  critica: boolean;
}

export interface GrupoRotina {
  chave: string;
  titulo: string;
  etiqueta: string;
  /** Itens da norma cobertos pelo grupo (não é o número de perguntas). */
  total: number;
  verificacoes: VerificacaoChecklist[];
}

/**
 * A rotina diária guiada, montada em cima do checklist real do perfil.
 *
 * O mapeamento pergunta -> itens vem do `data/rotina-diaria.ts`, mas os
 * ITENS vêm do banco, passando pelos mesmos filtros de sempre: perfil
 * (RF03) e "não se aplica" (RF09). É isso que faz a pergunta do
 * transporte sumir num restaurante e um item ocultado sair da pergunta
 * que o cobria — sem nenhuma regra extra.
 *
 * Uma verificação que perde TODOS os seus itens desaparece: perguntar
 * sobre algo que não se aplica ao negócio seria pior do que não
 * perguntar.
 */
export function rotinaDoPerfil(
  perfilId: string,
  filtro: { estabelecimentoId?: number } = {},
): GrupoRotina[] {
  // Reaproveita a consulta do checklist e indexa por id, para casar com
  // os ids listados em cada verificação.
  const disponiveis = new Map<string, ItemChecklist>();
  for (const grupo of checklistDoPerfil(perfilId, { trilha: 'diario', ...filtro })) {
    for (const secao of grupo.secoes) {
      for (const item of secao.itens) {
        disponiveis.set(item.id, item);
      }
    }
  }

  const grupos: GrupoRotina[] = [];

  for (const verificacao of ROTINA_DIARIA) {
    const itens = verificacao.itens
      .map((id) => disponiveis.get(id))
      .filter((item): item is ItemChecklist => item !== undefined);

    if (itens.length === 0) continue;

    let grupo = grupos.find((g) => g.chave === verificacao.momento);
    if (!grupo) {
      grupo = {
        chave: verificacao.momento,
        titulo: TITULO_MOMENTO[verificacao.momento],
        etiqueta: String(grupos.length + 1),
        total: 0,
        verificacoes: [],
      };
      grupos.push(grupo);
    }

    grupo.verificacoes.push({
      id: verificacao.id,
      titulo: verificacao.titulo,
      texto: verificacao.texto,
      itens,
      codigos: itens.map((item) => item.codigo_rdc),
      critica: itens.some((item) => item.critico === 1),
    });
    grupo.total += itens.length;
  }

  return grupos;
}

/**
 * O estado de uma verificação, deduzido das respostas dos itens dela.
 *
 * Não existe coluna para isso no banco: a pergunta agrupada é só uma
 * forma de PERGUNTAR, e a verdade continua sendo item a item. Estados:
 *
 *  - 'conforme'      todos os itens adequados;
 *  - 'nao_conforme'  ao menos um inadequado (é o que importa saber);
 *  - 'nao_avaliado'  respondidos, mas nenhum avaliado (não observado
 *                    e/ou não se aplica);
 *  - 'parcial'       começou a responder e parou no meio;
 *  - 'pendente'      nenhum item respondido.
 */
export type EstadoVerificacao =
  | 'conforme'
  | 'nao_conforme'
  | 'nao_avaliado'
  | 'parcial'
  | 'pendente';

export function estadoDaVerificacao(
  itens: ItemChecklist[],
  respostas: Record<string, Resposta>,
): EstadoVerificacao {
  const dadas = itens.map((item) => respostas[item.id]).filter(Boolean) as Resposta[];

  if (dadas.length === 0) return 'pendente';
  if (dadas.length < itens.length) return 'parcial';
  if (dadas.some((r) => r === 'inadequado')) return 'nao_conforme';
  if (dadas.every((r) => r === 'adequado')) return 'conforme';
  return 'nao_avaliado';
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

/**
 * Quantas verificações a rotina diária guiada tem para este perfil — o
 * tamanho do modo "Rotina", mostrado no botão.
 *
 * Não é constante: perguntas cujos itens não se aplicam ao perfil, ou
 * que foram inteiramente ocultados (RF09), não entram na conta.
 */
export function contarVerificacoesDaRotina(
  perfilId: string,
  estabelecimentoId: number,
): number {
  return rotinaDoPerfil(perfilId, { estabelecimentoId }).reduce(
    (soma, grupo) => soma + grupo.verificacoes.length,
    0,
  );
}

// ---------------------------------------------------------------
// EXECUÇÃO DA INSPEÇÃO (RF06)
// ---------------------------------------------------------------

/** As quatro respostas possíveis para um item (RF06). */
export type Resposta = 'adequado' | 'inadequado' | 'nao_se_aplica' | 'nao_observado';

/**
 * Modo de preenchimento da trilha diária.
 *
 * 'rotina'   = as 11 verificações guiadas do `data/rotina-diaria.ts`.
 *              Cobrem os mesmos 32 itens, agrupados em perguntas que se
 *              respondem de uma vez. É o modo de todo dia.
 * 'completa' = os itens da norma, um a um.
 *
 * As outras trilhas são sempre 'completa'.
 *
 * 'essencial' é um valor LEGADO: era um modo antigo, que mostrava só os
 * itens críticos. Continua no tipo porque inspeções antigas foram
 * gravadas com ele e o histórico precisa saber rotulá-las; nenhuma
 * inspeção nova o usa.
 */
export type ModoInspecao = 'rotina' | 'completa' | 'essencial';

export interface Inspecao {
  id: number;
  estabelecimento_id: number;
  trilha: Trilha;
  modo: ModoInspecao;
  data_inicio: string;
  data_conclusao: string | null;
  dia_local: string | null;
  total_itens: number | null;
  status: 'em_andamento' | 'concluida';
}

/**
 * Abre uma inspeção de uma trilha — ou devolve a que já está em
 * andamento.
 *
 * O "ou" é importante, e na diária vira o desenho todo: a inspeção do
 * dia fica ABERTA o dia inteiro. Você marca a temperatura do cozimento
 * às 11h, fecha o app, volta às 15h e marca a conservação a quente, e
 * conclui no fim do expediente. Não é um formulário, é o registro do
 * dia — que é a única forma honesta de responder itens como "70 °C no
 * cozimento", impossíveis de verificar antes de a cozinha funcionar.
 *
 * Se o usuário retoma escolhendo outro modo, o modo é atualizado e as
 * respostas continuam valendo: o essencial é um subconjunto do completo,
 * então trocar de um para o outro só muda quantos itens aparecem.
 */
export function iniciarInspecao(
  estabelecimentoId: number,
  trilha: Trilha,
  modo: ModoInspecao = 'completa',
): Inspecao {
  const db = obterBanco();
  const hoje = diaLocalISO();

  // A DIÁRIA é presa ao dia: uma inspeção de ontem que ficou aberta NÃO
  // é retomada hoje, senão as respostas de dois dias se misturariam num
  // registro só e o "score do dia" perderia o sentido. Ela continua no
  // histórico como não concluída — que é a verdade do que aconteceu.
  //
  // As outras trilhas não têm essa trava: uma auditoria de 60 itens pode
  // legitimamente ser preenchida ao longo de dois ou três dias.
  const emAndamento = db.getFirstSync<Inspecao>(
    `SELECT * FROM inspecao
      WHERE estabelecimento_id = ? AND trilha = ? AND status = 'em_andamento'
        AND (trilha <> 'diario' OR dia_local = ?)
      ORDER BY id DESC LIMIT 1`,
    estabelecimentoId,
    trilha,
    hoje,
  );

  if (emAndamento) {
    if (emAndamento.modo !== modo) {
      db.runSync('UPDATE inspecao SET modo = ? WHERE id = ?', modo, emAndamento.id);
      return { ...emAndamento, modo };
    }
    return emAndamento;
  }

  // `dia_local` é gravado na ABERTURA, não na conclusão: ele diz a que
  // DIA esta inspeção se refere. Uma diária começada às 23h50 e concluída
  // às 00h10 pertence ao dia em que o expediente aconteceu.
  const resultado = db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, modo, data_inicio, dia_local, status)
     VALUES (?, ?, ?, ?, ?, 'em_andamento')`,
    estabelecimentoId,
    trilha,
    modo,
    agoraISO(),
    hoje,
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
 * Fecha a inspeção: carimba as datas, congela o tamanho e muda o status.
 *
 * `totalItens` é quantos itens o checklist tinha na hora. Guardamos em
 * vez de recontar depois porque o checklist é vivo: ocultar um item
 * (RF09) amanhã não pode mudar o "22 de 32 observados" de uma inspeção
 * de hoje. Score de arquivo tem que ser reprodutível.
 *
 * Na Fase 5, `data_conclusao` vira a base do próximo vencimento da
 * trilha — por isso ela só é gravada aqui, e não a cada resposta.
 */
export function concluirInspecao(inspecaoId: number, totalItens: number): void {
  obterBanco().runSync(
    `UPDATE inspecao
        SET status = 'concluida',
            data_conclusao = ?,
            -- COALESCE porque o dia já foi gravado na abertura; só cai no
            -- valor de hoje em inspeções criadas antes do schema v4.
            dia_local = COALESCE(dia_local, ?),
            total_itens = ?
      WHERE id = ? AND status = 'em_andamento'`,
    agoraISO(),
    diaLocalISO(),
    totalItens,
    inspecaoId,
  );
}

// ---------------------------------------------------------------
// SCORE DE CONFORMIDADE (RF04)
// ---------------------------------------------------------------

/**
 * QUANTO VALE UM ITEM CRÍTICO na conta do score.
 *
 * O seed classifica os itens em dois níveis: comum (peso 1) e crítico
 * (peso 2). Este número SUBSTITUI o peso 2 dos críticos, tornando a
 * queda mais acentuada: cada crítico reprovado custa o mesmo que três
 * itens comuns.
 *
 * É o único parâmetro de severidade do app, e está aqui sozinho de
 * propósito — mexer nele muda a régua inteira, sem tocar em fórmula
 * nem em dado. Se um dia o seed passar a ter três níveis de gravidade,
 * basta apagar este CASE e usar o `peso` direto.
 */
export const PESO_CRITICO = 3;

/** O peso que vale na conta: crítico manda, senão o peso do seed. */
const PESO_EFETIVO = `CASE WHEN it.critico = 1 THEN ${PESO_CRITICO} ELSE it.peso END`;

export interface Score {
  /** 0 a 100, ou null quando nada foi avaliado (tudo "não observado"). */
  valor: number | null;
  /** Itens que entraram na conta (adequado + inadequado). */
  avaliados: number;
  adequados: number;
  inadequados: number;
  naoObservados: number;
  naoSeAplica: number;
  /** Críticos avaliados e, destes, quantos estavam adequados. */
  criticosAvaliados: number;
  criticosAdequados: number;
}

/** Soma de pesos que sai do SQL, antes de virar percentual. */
interface PesosBrutos {
  peso_avaliado: number;
  peso_adequado: number;
  avaliados: number;
  adequados: number;
  inadequados: number;
  nao_observados: number;
  nao_se_aplica: number;
  criticos_avaliados: number;
  criticos_adequados: number;
}

/**
 * As somas que o score precisa, para UMA inspeção.
 *
 * Repare que a conta parte da tabela `resposta`, e não do checklist
 * atual do perfil. Isso é deliberado: o checklist muda com o tempo
 * (itens ocultados, seed atualizado), e se o denominador viesse dele,
 * o score de uma inspeção antiga mudaria sozinho. Partindo das
 * respostas, o score de arquivo é imutável — que é o "reprodutível"
 * pedido no critério de pronto da fase.
 */
const SELECT_PESOS = `
  COALESCE(SUM(CASE WHEN r.resposta IN ('adequado','inadequado')
                    THEN ${PESO_EFETIVO} ELSE 0 END), 0)            AS peso_avaliado,
  COALESCE(SUM(CASE WHEN r.resposta = 'adequado'
                    THEN ${PESO_EFETIVO} ELSE 0 END), 0)            AS peso_adequado,
  SUM(CASE WHEN r.resposta IN ('adequado','inadequado') THEN 1 ELSE 0 END) AS avaliados,
  SUM(CASE WHEN r.resposta = 'adequado'      THEN 1 ELSE 0 END)     AS adequados,
  SUM(CASE WHEN r.resposta = 'inadequado'    THEN 1 ELSE 0 END)     AS inadequados,
  SUM(CASE WHEN r.resposta = 'nao_observado' THEN 1 ELSE 0 END)     AS nao_observados,
  SUM(CASE WHEN r.resposta = 'nao_se_aplica' THEN 1 ELSE 0 END)     AS nao_se_aplica,
  SUM(CASE WHEN it.critico = 1 AND r.resposta IN ('adequado','inadequado')
           THEN 1 ELSE 0 END)                                       AS criticos_avaliados,
  SUM(CASE WHEN it.critico = 1 AND r.resposta = 'adequado'
           THEN 1 ELSE 0 END)                                       AS criticos_adequados
`;

/**
 * A FÓRMULA, em um lugar só.
 *
 *   score = 100 × (peso dos adequados) / (peso dos avaliados)
 *
 * "Não se aplica" e "não observado" ficam de fora do numerador E do
 * denominador. É a diferença entre "não conforme" e "não verificado":
 * tratar item não observado como reprovado puniria a honestidade, e
 * tratá-lo como aprovado premiaria quem não olha.
 *
 * Denominador zero devolve `null`, não 0% — "sem itens avaliados" é uma
 * informação diferente de "nota zero".
 */
function montarScore(bruto: PesosBrutos | null): Score {
  const vazio: Score = {
    valor: null,
    avaliados: 0,
    adequados: 0,
    inadequados: 0,
    naoObservados: 0,
    naoSeAplica: 0,
    criticosAvaliados: 0,
    criticosAdequados: 0,
  };
  if (!bruto) return vazio;

  return {
    valor:
      bruto.peso_avaliado > 0
        ? Math.round((100 * bruto.peso_adequado) / bruto.peso_avaliado)
        : null,
    avaliados: bruto.avaliados ?? 0,
    adequados: bruto.adequados ?? 0,
    inadequados: bruto.inadequados ?? 0,
    naoObservados: bruto.nao_observados ?? 0,
    naoSeAplica: bruto.nao_se_aplica ?? 0,
    criticosAvaliados: bruto.criticos_avaliados ?? 0,
    criticosAdequados: bruto.criticos_adequados ?? 0,
  };
}

/** O score de uma inspeção. */
export function scoreDaInspecao(inspecaoId: number): Score {
  const bruto = obterBanco().getFirstSync<PesosBrutos>(
    `SELECT ${SELECT_PESOS}
       FROM resposta r
       JOIN item it ON it.id = r.item_id
      WHERE r.inspecao_id = ?`,
    inspecaoId,
  );
  return montarScore(bruto);
}

export interface ScoreCategoria {
  categoriaId: string;
  nome: string;
  codigoRdc: string;
  score: Score;
}

/**
 * O score quebrado por categoria da RDC — o que transforma a nota em
 * diagnóstico: não "você tirou 78", e sim "você tirou 78 por causa da
 * 4.6, manipuladores".
 */
export function scorePorCategoria(inspecaoId: number): ScoreCategoria[] {
  const linhas = obterBanco().getAllSync<
    PesosBrutos & { categoria_id: string; nome: string; codigo_rdc: string }
  >(
    `SELECT c.id AS categoria_id, c.nome, c.codigo_rdc, ${SELECT_PESOS}
       FROM resposta r
       JOIN item it     ON it.id = r.item_id
       JOIN categoria c ON c.id  = it.categoria_id
      WHERE r.inspecao_id = ?
      GROUP BY c.id
      ORDER BY c.ordem`,
    inspecaoId,
  );

  return linhas.map((linha) => ({
    categoriaId: linha.categoria_id,
    nome: linha.nome,
    codigoRdc: linha.codigo_rdc,
    score: montarScore(linha),
  }));
}

export interface ResumoInspecao {
  id: number;
  trilha: Trilha;
  modo: ModoInspecao;
  data_inicio: string;
  data_conclusao: string | null;
  dia_local: string | null;
  total_itens: number | null;
  status: 'em_andamento' | 'concluida';
  respondidos: number;
  score: Score;
}

export interface FiltroInspecoes {
  trilha?: Trilha;
  somenteConcluidas?: boolean;
  /** Só inspeções concluídas a partir deste dia local ('AAAA-MM-DD'). */
  desdeDiaLocal?: string;
  limite?: number;
}

/**
 * As inspeções de um estabelecimento, da mais recente para a mais
 * antiga, cada uma com o seu score já calculado.
 *
 * As somas saem de uma subconsulta correlacionada por inspeção, e não de
 * um JOIN + GROUP BY, para que uma inspeção sem nenhuma resposta ainda
 * apareça na lista — o caso de quem acabou de abrir uma trilha.
 */
export function listarInspecoes(
  estabelecimentoId: number,
  filtro: FiltroInspecoes = {},
): ResumoInspecao[] {
  const condicoes = ['i.estabelecimento_id = ?'];
  const parametros: (string | number)[] = [estabelecimentoId];

  if (filtro.trilha) {
    condicoes.push('i.trilha = ?');
    parametros.push(filtro.trilha);
  }
  if (filtro.somenteConcluidas) {
    condicoes.push("i.status = 'concluida'");
  }
  if (filtro.desdeDiaLocal) {
    condicoes.push('i.dia_local >= ?');
    parametros.push(filtro.desdeDiaLocal);
  }

  const linhas = obterBanco().getAllSync<
    Omit<ResumoInspecao, 'score'> & PesosBrutos
  >(
    `SELECT i.id, i.trilha, i.modo, i.data_inicio, i.data_conclusao,
            i.dia_local, i.total_itens, i.status,
            (SELECT COUNT(*) FROM resposta r WHERE r.inspecao_id = i.id) AS respondidos,
            somas.peso_avaliado, somas.peso_adequado, somas.avaliados,
            somas.adequados, somas.inadequados, somas.nao_observados,
            somas.nao_se_aplica, somas.criticos_avaliados, somas.criticos_adequados
       FROM inspecao i
       LEFT JOIN (
            SELECT r.inspecao_id, ${SELECT_PESOS}
              FROM resposta r
              JOIN item it ON it.id = r.item_id
             GROUP BY r.inspecao_id
       ) somas ON somas.inspecao_id = i.id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY i.data_inicio DESC, i.id DESC
      ${filtro.limite ? `LIMIT ${Number(filtro.limite)}` : ''}`,
    ...parametros,
  );

  return linhas.map(paraResumo);
}

/** Converte a linha crua (cabeçalho + somas) no resumo que as telas usam. */
function paraResumo(linha: Omit<ResumoInspecao, 'score'> & PesosBrutos): ResumoInspecao {
  return {
    id: linha.id,
    trilha: linha.trilha,
    modo: linha.modo,
    data_inicio: linha.data_inicio,
    data_conclusao: linha.data_conclusao,
    dia_local: linha.dia_local,
    total_itens: linha.total_itens,
    status: linha.status,
    respondidos: linha.respondidos,
    score: montarScore(linha),
  };
}

/** Uma inspeção específica, com score — usada pela tela de resultado. */
export function obterResumoInspecao(inspecaoId: number): ResumoInspecao | null {
  const linha = obterBanco().getFirstSync<Omit<ResumoInspecao, 'score'> & PesosBrutos>(
    `SELECT i.id, i.trilha, i.modo, i.data_inicio, i.data_conclusao,
            i.dia_local, i.total_itens, i.status,
            (SELECT COUNT(*) FROM resposta r WHERE r.inspecao_id = i.id) AS respondidos,
            somas.peso_avaliado, somas.peso_adequado, somas.avaliados,
            somas.adequados, somas.inadequados, somas.nao_observados,
            somas.nao_se_aplica, somas.criticos_avaliados, somas.criticos_adequados
       FROM inspecao i
       LEFT JOIN (
            SELECT r.inspecao_id, ${SELECT_PESOS}
              FROM resposta r
              JOIN item it ON it.id = r.item_id
             GROUP BY r.inspecao_id
       ) somas ON somas.inspecao_id = i.id
      WHERE i.id = ?`,
    inspecaoId,
  );

  return linha ? paraResumo(linha) : null;
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

// ---------------------------------------------------------------
// O PAINEL DO INÍCIO
// ---------------------------------------------------------------

/** Tamanho da janela da "rotina do mês", em dias. */
export const JANELA_ROTINA_DIAS = 30;

export interface RotinaDoMes {
  /** Média dos scores das diárias da janela, ou null se não houve nenhuma. */
  media: number | null;
  /** Em quantos DIAS distintos houve diária concluída. */
  diasComDiaria: number;
  janelaDias: number;
}

export interface StatusAgua {
  diaLocal: string | null;
  adequados: number;
  avaliados: number;
}

export interface PainelInicio {
  /** A diária de hoje, se já foi concluída. */
  hoje: ResumoInspecao | null;
  /** Existe diária de hoje aberta, ainda sem conclusão? */
  hojeEmAndamento: boolean;
  rotinaMes: RotinaDoMes;
  /** A auditoria periódica concluída mais recente. */
  auditoria: ResumoInspecao | null;
  /** A trilha da água: confirmação, não nota (são 1 ou 2 itens). */
  agua: StatusAgua | null;
}

/**
 * Tudo o que a tela de Início mostra, numa função só.
 *
 * A tela não faz conta nem decide o que buscar — ela desenha o que vier
 * daqui. É o mesmo princípio do resto do `db/`: se a navegação mudar (e
 * ela ainda pode), a regra de negócio não se mexe.
 *
 * São QUATRO respostas para quatro perguntas diferentes, e elas não se
 * fundem numa só de propósito. Num mês típico há ~26 diárias de 12 a 32
 * itens contra UMA auditoria de 60+: qualquer média entre elas — simples
 * ou ponderada por item — é dominada pelas diárias por frequência, e o
 * número final esconderia justamente a auditoria, que é a parte da norma
 * que a fiscalização olha.
 */
export function painelInicio(estabelecimentoId: number): PainelInicio {
  const hojeLocal = diaLocalISO();

  const [hoje] = listarInspecoes(estabelecimentoId, {
    trilha: 'diario',
    somenteConcluidas: true,
    desdeDiaLocal: hojeLocal,
    limite: 1,
  });

  // Só interessa a diária DE HOJE aberta; uma de ontem que ficou pela
  // metade não é "a inspeção de hoje em andamento".
  const emAndamento = obterBanco().getFirstSync<{ id: number }>(
    `SELECT id FROM inspecao
      WHERE estabelecimento_id = ? AND trilha = 'diario'
        AND status = 'em_andamento' AND dia_local = ?
      LIMIT 1`,
    estabelecimentoId,
    hojeLocal,
  );

  // A janela inclui hoje, por isso são 29 dias para trás.
  // Inspeções concluídas antes do schema v4 não têm `dia_local` e ficam
  // de fora da janela — são dados de teste anteriores ao score.
  const diarias = listarInspecoes(estabelecimentoId, {
    trilha: 'diario',
    somenteConcluidas: true,
    desdeDiaLocal: diaLocalHaDias(JANELA_ROTINA_DIAS - 1),
  });

  const notas = diarias
    .map((inspecao) => inspecao.score.valor)
    .filter((valor): valor is number => valor !== null);

  // Dias DISTINTOS: duas diárias no mesmo dia não contam como dois dias
  // de adesão à rotina.
  const dias = new Set(diarias.map((inspecao) => inspecao.dia_local));

  const [auditoria] = listarInspecoes(estabelecimentoId, {
    trilha: 'periodico',
    somenteConcluidas: true,
    limite: 1,
  });

  const [semestral] = listarInspecoes(estabelecimentoId, {
    trilha: 'semestral',
    somenteConcluidas: true,
    limite: 1,
  });

  return {
    hoje: hoje ?? null,
    hojeEmAndamento: emAndamento !== null,
    rotinaMes: {
      media:
        notas.length > 0
          ? Math.round(notas.reduce((soma, nota) => soma + nota, 0) / notas.length)
          : null,
      diasComDiaria: dias.size,
      janelaDias: JANELA_ROTINA_DIAS,
    },
    auditoria: auditoria ?? null,
    agua: semestral
      ? {
          diaLocal: semestral.dia_local,
          adequados: semestral.score.adequados,
          avaliados: semestral.score.avaliados,
        }
      : null,
  };
}
