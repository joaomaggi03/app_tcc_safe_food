/**
 * db/relatorio.ts
 * ---------------------------------------------------------------
 * JUNTA OS DADOS DO RELATÓRIO DE UMA INSPEÇÃO (RF08).
 *
 * Só lê. Quase tudo já existia — score, score por categoria, pendências
 * da diária —, e é reaproveitado para o PDF usar as mesmas regras da tela
 * de resultado. As duas consultas novas são as que só o relatório
 * precisa: a lista item a item (com a hora de cada resposta) e as ações
 * dos itens inadequados com o texto completo. Uma diferença deliberada:
 * a tela mostra a ação ABERTA do item; o PDF prefere a nascida DESTA
 * inspeção, que é a que pertence ao registro.
 *
 * O HTML é montado em `db/relatorioHtml.ts` (puro, testado), e o arquivo
 * em `db/exportarPdf.ts`.
 */

import Constants from 'expo-constants';
import { situacaoAcao } from './acao';
import {
  diaLocalISO,
  listarPerfis,
  obterResumoInspecao,
  pendenciasDaDiaria,
  PESO_CRITICO,
  scorePorCategoria,
  type Inspecao,
} from './consultas';
import { obterBanco } from './index';
import { lerHorarios } from './janela';
import type { MomentoDia } from '../data/rdc216';
import type {
  DadosRelatorio,
  InadequadoRelatorio,
  ItemRelatorio,
  RespostaRelatorio,
} from './relatorioHtml';

/**
 * A lista item a item: os itens PREVISTOS (lista congelada na inspeção,
 * v12) e qualquer item respondido, com a resposta e a hora. O previsto sem
 * resposta aparece como "sem resposta" — é parte do que aconteceu.
 *
 * O `json_each` abre a lista JSON de `itens_previstos` dentro do próprio
 * SQL. Inspeção anterior à v12 (lista NULL) mostra só os respondidos.
 */
export const SELECT_ITENS_RELATORIO = `
  SELECT i.id AS item_id, i.codigo_rdc, i.topicos, i.critico, i.momento,
         c.nome AS categoria, c.codigo_rdc AS categoria_codigo,
         r.resposta, r.respondida_em, r.corrigido_na_hora
    FROM item i
    JOIN categoria c ON c.id = i.categoria_id
    LEFT JOIN resposta r ON r.item_id = i.id AND r.inspecao_id = ?
   WHERE r.inspecao_id IS NOT NULL
      OR i.id IN (SELECT value FROM json_each(COALESCE(?, '[]')))
   ORDER BY c.ordem, i.ordem`;

/**
 * As ações dos itens INADEQUADOS desta inspeção, com o texto inteiro.
 *
 * Para cada item vale a ação nascida DESTA inspeção; sem ela, a aberta
 * do item (a ação é uma só por item — pode ter nascido numa diária
 * anterior). Críticos primeiro, depois a ordem da norma.
 */
export const SELECT_ACOES_RELATORIO = `
  SELECT a.item_id, a.descricao, a.prazo, a.status, a.inspecao_id, i.codigo_rdc
    FROM acao a
    JOIN item i ON i.id = a.item_id
   WHERE a.estabelecimento_id = ?
     AND a.item_id IN (
       SELECT item_id FROM resposta WHERE inspecao_id = ? AND resposta = 'inadequado'
     )
     AND (a.inspecao_id = ? OR a.status = 'aberta')
   ORDER BY i.critico DESC, i.ordem, (a.inspecao_id = ?) DESC`;

function topicosDe(json: string | null): string[] {
  try {
    const lista = JSON.parse(json ?? '[]');
    return Array.isArray(lista) ? lista.map(String) : [];
  } catch {
    return [];
  }
}

/** Tudo o que o relatório de uma inspeção precisa, ou null se ela não existir. */
export function dadosDoRelatorio(inspecaoId: number): DadosRelatorio | null {
  const db = obterBanco();
  const inspecao = db.getFirstSync<Inspecao>('SELECT * FROM inspecao WHERE id = ?', inspecaoId);
  const resumo = obterResumoInspecao(inspecaoId);
  if (!inspecao || !resumo) return null;

  const est = db.getFirstSync<{
    nome: string;
    perfil_id: string;
    cidade: string | null;
    responsavel: string | null;
  }>(
    'SELECT nome, perfil_id, cidade, responsavel FROM estabelecimento WHERE id = ?',
    inspecao.estabelecimento_id,
  );
  if (!est) return null;
  const perfil = listarPerfis().find((p) => p.id === est.perfil_id)?.nome ?? est.perfil_id;

  const linhasItens = db.getAllSync<{
    item_id: string;
    codigo_rdc: string;
    topicos: string | null;
    critico: number;
    momento: MomentoDia | null;
    categoria: string;
    categoria_codigo: string;
    resposta: RespostaRelatorio | null;
    respondida_em: string | null;
    corrigido_na_hora: number | null;
  }>(SELECT_ITENS_RELATORIO, inspecaoId, inspecao.itens_previstos);

  const itens: ItemRelatorio[] = linhasItens.map((linha) => ({
    codigoRdc: linha.codigo_rdc,
    categoria: linha.categoria,
    categoriaCodigo: linha.categoria_codigo,
    topicos: topicosDe(linha.topicos),
    critico: linha.critico === 1,
    resposta: linha.resposta,
    respondidaEm: linha.respondida_em,
    corrigidoNaHora: linha.corrigido_na_hora === 1,
    // A etapa só faz sentido na diária (nas outras trilhas não há janela).
    etapa: inspecao.trilha === 'diario' ? (linha.momento ?? 'servico') : null,
  }));

  // A ação de cada item: a ordem do SQL põe a desta inspeção na frente,
  // então a primeira que aparece por item é a que vale.
  const hoje = diaLocalISO();
  const acaoDoItem = new Map<string, InadequadoRelatorio['acao']>();
  for (const linha of db.getAllSync<{
    item_id: string;
    descricao: string;
    prazo: string;
    status: 'aberta' | 'concluida';
  }>(SELECT_ACOES_RELATORIO, inspecao.estabelecimento_id, inspecaoId, inspecaoId, inspecaoId)) {
    if (acaoDoItem.has(linha.item_id)) continue;
    acaoDoItem.set(linha.item_id, {
      descricao: linha.descricao,
      prazo: linha.prazo,
      situacao: situacaoAcao(linha, hoje).situacao,
    });
  }

  // TODO inadequado entra: com ação, corrigido na hora ou sem ação — os
  // três casos da seção "Itens a corrigir" da tela. Críticos primeiro.
  const inadequados: InadequadoRelatorio[] = linhasItens
    .filter((linha) => linha.resposta === 'inadequado')
    .sort((a, b) => b.critico - a.critico)
    .map((linha) => ({
      codigoRdc: linha.codigo_rdc,
      topicos: topicosDe(linha.topicos),
      corrigidoNaHora: linha.corrigido_na_hora === 1,
      acao: acaoDoItem.get(linha.item_id) ?? null,
    }));

  const ocultos =
    db.getFirstSync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM item_oculto WHERE estabelecimento_id = ?',
      inspecao.estabelecimento_id,
    )?.n ?? 0;

  return {
    geradoEm: new Date().toISOString(),
    versaoApp: Constants.expoConfig?.version ?? '',
    estabelecimento: {
      nome: est.nome,
      perfil,
      cidade: est.cidade,
      responsavel: est.responsavel,
    },
    inspecao: {
      trilha: inspecao.trilha,
      modo: inspecao.modo,
      dataInicio: inspecao.data_inicio,
      dataConclusao: inspecao.data_conclusao,
      diaLocal: inspecao.dia_local,
      totalItens: inspecao.total_itens,
      // O horário DAQUELE dia, congelado na inspeção (v12) — não o de hoje.
      horarios: lerHorarios(inspecao.hora_abertura, inspecao.hora_fechamento),
      // A v12 congela a lista de itens junto com o horário: sem a lista,
      // o horário também não foi registrado (diária anterior à v12).
      horarioRegistrado: inspecao.itens_previstos !== null,
    },
    score: resumo.score,
    categorias: scorePorCategoria(inspecaoId).map((c) => ({
      codigoRdc: c.codigoRdc,
      nome: c.nome,
      score: c.score,
    })),
    pendencias: pendenciasDaDiaria(inspecaoId),
    itens,
    inadequados,
    itensOcultos: ocultos,
    pesoCritico: PESO_CRITICO,
  };
}
