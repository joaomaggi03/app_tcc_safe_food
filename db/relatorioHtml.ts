/**
 * db/relatorioHtml.ts
 * ---------------------------------------------------------------
 * O RELATÓRIO DA INSPEÇÃO EM HTML (RF08) — puro, sem banco.
 *
 * O PDF nasce de uma página HTML: o `expo-print` desenha esta página no
 * próprio aparelho e devolve o arquivo (ver `db/exportarPdf.ts`). Montar
 * o HTML aqui, separado de quem junta os dados (`db/relatorio.ts`) e de
 * quem gera o arquivo, deixa a parte com regra — o que entra, em que
 * ordem, o que acontece com dado faltando — testável fora do celular
 * (`tests/relatorio.test.js`).
 *
 * O QUE O RELATÓRIO PROMETE (P-RF08): "compilar todas as informações da
 * inspeção em um documento final". Por isso a lista item a item vai
 * INTEIRA, e não só os problemas, com a resposta e a hora de cada uma.
 *
 * TRÊS CUIDADOS
 *  - Todo texto que o USUÁRIO digitou (nome, cidade, responsável, a
 *    descrição da ação) passa por `escapar`: um "<" no nome do
 *    estabelecimento não pode virar marcação e quebrar o PDF.
 *  - Score nulo sai "—", nunca 0% (a mesma distinção de todo o app:
 *    "nada avaliado" não é "tudo inadequado").
 *  - Diária anterior à v12 sai com "pendências não disponíveis", e não com
 *    zero: ela não guardou quais itens tinha.
 *
 * As cores vêm do `theme/cores.ts`, como em qualquer tela.
 */

import type { MomentoDia } from '../data/rdc216';
import Cores from '../theme/cores';
import {
  FAIXA_GRUPO,
  formatarData,
  formatarDataHora,
  ROTULO_ETAPA,
  ROTULO_GRUPO,
  ROTULO_MODO,
  ROTULO_RESPOSTA,
  ROTULO_SITUACAO_ACAO,
  ROTULO_TRILHA,
  textoHoraResposta,
  textoScore,
} from '../theme/rotulos';
import { diaLocalISO } from './datas';
import { faixaRdc275 } from './faixa';
import { formatarHora, type Horarios } from './janela';
import type { Pendencias } from './pendencia';

export type RespostaRelatorio = 'adequado' | 'inadequado' | 'nao_se_aplica' | 'nao_observado';

/** O que o score precisa no relatório (o mesmo `Score` do consultas.ts). */
export interface ScoreRelatorio {
  valor: number | null;
  atendimento: number | null;
  avaliados: number;
  adequados: number;
  inadequados: number;
  naoObservados: number;
  naoSeAplica: number;
  criticosAvaliados: number;
  criticosAdequados: number;
}

export interface ItemRelatorio {
  codigoRdc: string;
  categoria: string;
  categoriaCodigo: string;
  topicos: string[];
  critico: boolean;
  /** null = previsto e sem resposta. */
  resposta: RespostaRelatorio | null;
  respondidaEm: string | null;
  corrigidoNaHora: boolean;
  /** A etapa do expediente — só nos itens diários. */
  etapa: MomentoDia | null;
}

/**
 * Um item INADEQUADO e o que aconteceu com ele: corrigido na hora, com a
 * ação do plano, ou sem ação registrada — os três casos que a tela de
 * resultado mostra (achado do `fiscal`: a primeira versão só listava os
 * que tinham ação, e o inadequado sem ação sumia do PDF).
 */
export interface InadequadoRelatorio {
  codigoRdc: string;
  topicos: string[];
  corrigidoNaHora: boolean;
  acao: {
    descricao: string;
    prazo: string;
    situacao: 'atrasada' | 'vence_hoje' | 'no_prazo' | 'concluida';
  } | null;
}

export interface DadosRelatorio {
  /** Quando o PDF foi gerado (ISO). */
  geradoEm: string;
  versaoApp: string;
  estabelecimento: {
    nome: string;
    perfil: string;
    cidade: string | null;
    responsavel: string | null;
  };
  inspecao: {
    trilha: 'diario' | 'periodico' | 'semestral';
    modo: keyof typeof ROTULO_MODO;
    dataInicio: string;
    dataConclusao: string | null;
    diaLocal: string | null;
    totalItens: number | null;
    /** O horário congelado na inspeção (só diária, v12). */
    horarios: Horarios | null;
    /**
     * A inspeção é da v12 em diante, e por isso CONGELOU o horário (mesmo
     * que vazio)? Sem isso, horário null seria ambíguo: "não havia" ou
     * "não foi registrado" — e o PDF afirmaria o primeiro sem saber.
     */
    horarioRegistrado: boolean;
  };
  score: ScoreRelatorio;
  categorias: { codigoRdc: string; nome: string; score: ScoreRelatorio }[];
  /** null = não se aplica (fora da diária) OU não disponível (pré-v12). */
  pendencias: Pendencias | null;
  itens: ItemRelatorio[];
  inadequados: InadequadoRelatorio[];
  /** Itens que o estabelecimento marcou "não se aplica" (RF09), HOJE. */
  itensOcultos: number;
  pesoCritico: number;
}

/** Troca os cinco caracteres que têm sentido em HTML. */
export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapa e mantém as quebras de linha (a descrição da ação tem várias). */
function comQuebras(texto: string): string {
  return escapar(texto).replace(/\n/g, '<br>');
}

const ETAPAS: MomentoDia[] = ['abertura', 'servico', 'fechamento'];

function linhaCabecalho(rotulo: string, valor: string): string {
  return `<tr><th>${rotulo}</th><td>${valor}</td></tr>`;
}

/**
 * O horário da diária como REGISTRO, não como instrução de tela. Diária
 * anterior à v12 não congelou o horário: dizer "sem horário" seria
 * afirmar o que não se sabe (achado do `fiscal`, que bloqueou o commit).
 */
export function textoHorarioDoDia(i: {
  horarios: Horarios | null;
  horarioRegistrado: boolean;
}): string {
  if (!i.horarioRegistrado) return 'Não registrado nesta diária';
  if (!i.horarios) return 'Sem horário de funcionamento cadastrado';
  return `${formatarHora(i.horarios.abertura)} às ${formatarHora(i.horarios.fechamento)}`;
}

function cabecalho(d: DadosRelatorio): string {
  const i = d.inspecao;
  const linhas = [
    linhaCabecalho('Estabelecimento', escapar(d.estabelecimento.nome)),
    linhaCabecalho('Tipo', escapar(d.estabelecimento.perfil)),
  ];
  if (d.estabelecimento.cidade) {
    linhas.push(linhaCabecalho('Cidade', escapar(d.estabelecimento.cidade)));
  }
  if (d.estabelecimento.responsavel) {
    linhas.push(
      linhaCabecalho('Responsável pela manipulação', escapar(d.estabelecimento.responsavel)),
    );
  }
  linhas.push(
    linhaCabecalho(
      'Inspeção',
      `${ROTULO_TRILHA[i.trilha]}${i.trilha === 'diario' ? ` · ${ROTULO_MODO[i.modo]}` : ''}`,
    ),
  );
  if (i.diaLocal) linhas.push(linhaCabecalho('Dia', formatarData(i.diaLocal)));
  linhas.push(linhaCabecalho('Início', formatarDataHora(i.dataInicio)));
  linhas.push(
    linhaCabecalho(
      'Conclusão',
      i.dataConclusao ? formatarDataHora(i.dataConclusao) : 'Em andamento',
    ),
  );
  if (i.trilha === 'diario') {
    linhas.push(linhaCabecalho('Horário naquele dia', textoHorarioDoDia(i)));
  }
  return `<table class="cabecalho">${linhas.join('')}</table>`;
}

function resultado(d: DadosRelatorio): string {
  const s = d.score;
  const criticosFalhos = s.criticosAvaliados - s.criticosAdequados;
  const partes = [
    `<div class="score">${escapar(textoScore(s.valor))}</div>`,
    `<p>Score ponderado: itens críticos valem ${d.pesoCritico} vezes um item comum.</p>`,
    `<p>${s.criticosAvaliados === 0 ? 'Nenhum item crítico avaliado.' : `${criticosFalhos} de ${s.criticosAvaliados} itens críticos inadequados.`}</p>`,
    `<p>Cobertura: ${s.avaliados} itens avaliados${d.inspecao.totalItens !== null ? ` de ${d.inspecao.totalItens} previstos` : ''} · ${s.adequados} adequados · ${s.inadequados} inadequados · ${s.naoObservados} não observados · ${s.naoSeAplica} não se aplica.</p>`,
  ];

  // A faixa da RDC 275 só na auditoria periódica — mesma regra da tela.
  if (d.inspecao.trilha === 'periodico') {
    const grupo = faixaRdc275(s.atendimento);
    partes.push(
      `<p><strong>Atendimento dos itens:</strong> ${s.atendimento === null ? '—' : `${s.atendimento}%`}` +
        (grupo
          ? ` · ${ROTULO_GRUPO[grupo]} (${FAIXA_GRUPO[grupo]})`
          : '') +
        `</p><p class="nota">Classificação adaptada da RDC 275/2002 (norma de indústria): a RDC 216/2004 não pontua nem classifica. Contagem simples, sem peso; "não se aplica" e "não observado" ficam fora da conta (critério do app: a norma não diz o que fazer com eles).</p>`,
    );
  }
  return `<h2>Resultado</h2>${partes.join('')}`;
}

function porCategoria(d: DadosRelatorio): string {
  if (d.categorias.length === 0) return '';
  const linhas = d.categorias
    .map(
      (c) =>
        `<tr><td>${escapar(c.codigoRdc)}</td><td>${escapar(c.nome)}</td><td class="num">${escapar(textoScore(c.score.valor))}</td><td class="num">${c.score.adequados}/${c.score.avaliados}</td></tr>`,
    )
    .join('');
  return `<h2>Por categoria da RDC 216</h2><table><tr><th>Seção</th><th>Categoria</th><th>Score</th><th>Adequados</th></tr>${linhas}</table>`;
}

function pendencias(d: DadosRelatorio): string {
  if (d.inspecao.trilha !== 'diario') return '';
  if (!d.pendencias) {
    return '<h2>Pendências do dia</h2><p class="nota">Pendências não disponíveis: esta diária é anterior ao registro dos itens previstos.</p>';
  }
  const linhas = ETAPAS.map(
    (etapa) => `<tr><td>${ROTULO_ETAPA[etapa]}</td><td class="num">${d.pendencias!.porEtapa[etapa]}</td></tr>`,
  ).join('');
  return (
    `<h2>Pendências do dia: ${d.pendencias.total}</h2>` +
    `<table><tr><th>Etapa</th><th>Itens sem resposta a tempo</th></tr>${linhas}</table>` +
    '<p class="nota">Itens que ficaram sem resposta depois que a etapa encerrou. Não entram no score.</p>'
  );
}

function itens(d: DadosRelatorio): string {
  if (d.itens.length === 0) return '';
  let categoriaAtual = '';
  const linhas: string[] = [];
  for (const item of d.itens) {
    if (item.categoria !== categoriaAtual) {
      categoriaAtual = item.categoria;
      linhas.push(
        `<tr class="secao"><td colspan="4">${escapar(item.categoriaCodigo)} ${escapar(item.categoria)}</td></tr>`,
      );
    }
    const resposta = item.resposta
      ? ROTULO_RESPOSTA[item.resposta] + (item.corrigidoNaHora ? ' · corrigido na hora' : '')
      : 'Sem resposta';
    // Na diária, a etapa ao lado do código: é o que liga cada "sem
    // resposta" às pendências por etapa, que a lista por categoria esconde.
    const etapa = item.etapa ? ` <span class="etapa">${ROTULO_ETAPA[item.etapa]}</span>` : '';
    linhas.push(
      `<tr class="${item.resposta ?? 'sem'}"><td>${escapar(item.codigoRdc)}${item.critico ? ' <span class="critico">crítico</span>' : ''}${etapa}</td>` +
        `<td>${item.topicos.map(escapar).join('; ')}</td>` +
        `<td>${resposta}</td>` +
        `<td class="num">${horaDaResposta(item.respondidaEm, d.inspecao.diaLocal)}</td></tr>`,
    );
  }
  // O título e os nomes das colunas moram no <thead>: quando a tabela
  // quebra de página, o motor de impressão REPETE o thead no topo da
  // página seguinte (pedido do autor, 27/10/2026). Por isso o título da
  // seção é a primeira linha do thead, e não um <h2> solto antes da
  // tabela — senão a continuação começaria sem dizer de que relatório é.
  const identificacao =
    `${escapar(d.estabelecimento.nome)} · ${ROTULO_TRILHA[d.inspecao.trilha]}` +
    (d.inspecao.diaLocal ? ` · ${formatarData(d.inspecao.diaLocal)}` : '');
  return (
    '<table class="itens"><thead>' +
    `<tr class="titulo-tabela"><th colspan="4">Item a item <span class="identificacao">${identificacao}</span></th></tr>` +
    '<tr><th>Item</th><th>Exigência (resumo)</th><th>Resposta</th><th>Hora</th></tr>' +
    `</thead><tbody>${linhas.join('')}</tbody></table>`
  );
}

/**
 * "14:02" — ou "22/10 00:15" quando a resposta caiu em outro dia que não o
 * da inspeção (a diária sem horário aceita resposta depois da meia-noite,
 * e "00:15" sozinho ficaria ambíguo).
 */
export function horaDaResposta(respondidaEm: string | null, diaDaInspecao: string | null): string {
  if (!respondidaEm) return '—';
  const hora = textoHoraResposta(respondidaEm).replace('às ', '');
  const dia = diaLocalISO(new Date(respondidaEm));
  if (!diaDaInspecao || dia === diaDaInspecao) return hora;
  return `${formatarData(dia).slice(0, 5)} ${hora}`;
}

/**
 * Os itens inadequados e o que aconteceu com cada um — o mesmo que a
 * seção "Itens a corrigir" da tela. A situação da ação é a do dia em que
 * o PDF foi GERADO (uma ação continua viva depois da inspeção), e o título
 * diz isso: o resto do relatório é registro congelado, esta parte é foto.
 */
function inadequados(d: DadosRelatorio): string {
  if (d.inadequados.length === 0) return '';
  const blocos = d.inadequados
    .map((item) => {
      const titulo = `<strong>${escapar(item.codigoRdc)}</strong> ${item.topicos.map(escapar).join('; ')}`;
      if (item.corrigidoNaHora) {
        return `<div class="acao"><div class="acao-topo">${titulo}</div><div>Corrigido na hora — não gerou ação.</div></div>`;
      }
      if (!item.acao) {
        return `<div class="acao"><div class="acao-topo">${titulo}</div><div>Sem ação registrada.</div></div>`;
      }
      return (
        `<div class="acao"><div class="acao-topo">${titulo} · prazo ${formatarData(item.acao.prazo)} · ${ROTULO_SITUACAO_ACAO[item.acao.situacao]}</div>` +
        `<div>${comQuebras(item.acao.descricao)}</div></div>`
      );
    })
    .join('');
  return (
    `<h2>Itens inadequados e plano de ação</h2>` +
    `<p class="nota">Situação das ações em ${formatarData(diaLocalISO(new Date(d.geradoEm)))}, dia em que este relatório foi gerado.</p>` +
    blocos
  );
}

function ocultos(d: DadosRelatorio): string {
  if (d.itensOcultos === 0) return '';
  return `<p class="nota">${d.itensOcultos} ${d.itensOcultos === 1 ? 'item está marcado' : 'itens estão marcados'} como "não se aplica" para este estabelecimento e não ${d.itensOcultos === 1 ? 'aparece' : 'aparecem'} nas inspeções (situação em ${formatarData(diaLocalISO(new Date(d.geradoEm)))}).</p>`;
}

function estilos(): string {
  return `
    body { font-family: sans-serif; font-size: 11px; color: ${Cores.texto}; margin: 24px; }
    h1 { font-size: 18px; color: ${Cores.primariaTexto}; margin: 0 0 4px; }
    h2 { font-size: 13px; color: ${Cores.primariaTexto}; margin: 18px 0 6px;
         border-bottom: 1px solid ${Cores.borda}; padding-bottom: 3px; }
    p { margin: 3px 0; }
    .sub { color: ${Cores.textoSecundario}; margin-bottom: 10px; }
    .score { font-size: 26px; font-weight: bold; color: ${Cores.primariaTexto}; }
    .nota { color: ${Cores.textoSecundario}; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 3px 5px; border-bottom: 1px solid ${Cores.divisor};
             vertical-align: top; }
    th { color: ${Cores.textoSecundario}; font-weight: 600; }
    .cabecalho th { width: 32%; }
    .num { text-align: right; white-space: nowrap; }
    tr.secao td { background: ${Cores.primariaClara}; color: ${Cores.sobrePrimariaClara};
                  font-weight: bold; }
    tr.inadequado td { color: ${Cores.acentoForte}; }
    tr.sem td { color: ${Cores.textoSuave}; }
    .critico { color: ${Cores.acentoForte}; font-size: 9px; }
    .etapa { color: ${Cores.textoSecundario}; font-size: 9px; }
    .acao { border: 1px solid ${Cores.borda}; padding: 6px 8px; margin-bottom: 6px;
            page-break-inside: avoid; }
    .acao-topo { color: ${Cores.textoSecundario}; margin-bottom: 4px; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .titulo-tabela th { font-size: 13px; color: ${Cores.primariaTexto}; font-weight: bold;
                        padding-top: 18px; border-bottom: 1px solid ${Cores.borda}; }
    .identificacao { font-size: 9px; color: ${Cores.textoSuave}; font-weight: normal;
                     margin-left: 6px; }
    .rodape { margin-top: 20px; color: ${Cores.textoSuave}; font-size: 9px; }
  `;
}

/** A página inteira, pronta para o `expo-print`. */
export function montarHtmlRelatorio(d: DadosRelatorio): string {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${estilos()}</style></head>
<body>
<h1>Relatório de inspeção — RDC 216/2004</h1>
<p class="sub">${escapar(d.estabelecimento.nome)} · ${ROTULO_TRILHA[d.inspecao.trilha]}${d.inspecao.diaLocal ? ` · ${formatarData(d.inspecao.diaLocal)}` : ''}</p>
${cabecalho(d)}
${resultado(d)}
${porCategoria(d)}
${pendencias(d)}
${inadequados(d)}
${itens(d)}
${ocultos(d)}
<p class="rodape">Gerado em ${formatarDataHora(d.geradoEm)} pelo app Segurança Alimentar ${escapar(d.versaoApp)}. O score é o percentual do peso dos itens adequados sobre o dos avaliados; "não se aplica" e "não observado" não entram na conta. Os resumos dos itens são do app; o texto integral é o da RDC 216/2004.</p>
</body></html>`;
}
