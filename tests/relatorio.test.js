/**
 * tests/relatorio.test.js
 * ---------------------------------------------------------------
 * O relatório da inspeção em HTML (db/relatorioHtml.ts), que vira o PDF
 * do RF08.
 *
 * Não se testa a APARÊNCIA (isso é o aparelho), e sim o que tem regra:
 * o texto do usuário escapado, o score nulo como "—", a diária anterior à
 * v12 como "não disponível", a faixa da RDC 275 só na auditoria e a lista
 * item a item inteira, inclusive o que ficou sem resposta.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { relatorioHtml } = require('./_apoio/modulos');

const { escapar, montarHtmlRelatorio } = relatorioHtml();

function score(extra) {
  return {
    valor: 80,
    atendimento: 75,
    avaliados: 4,
    adequados: 3,
    inadequados: 1,
    naoObservados: 0,
    naoSeAplica: 0,
    criticosAvaliados: 1,
    criticosAdequados: 1,
    ...extra,
  };
}

function dados(extra = {}) {
  return {
    geradoEm: '2026-10-21T18:00:00.000Z',
    versaoApp: '1.0.0',
    estabelecimento: { nome: 'Cantina da Ana', perfil: 'Restaurante', cidade: null, responsavel: null },
    inspecao: {
      trilha: 'diario',
      modo: 'rotina',
      dataInicio: '2026-10-21T10:00:00.000Z',
      dataConclusao: '2026-10-21T21:00:00.000Z',
      diaLocal: '2026-10-21',
      totalItens: 3,
      horarios: { abertura: 420, fechamento: 1320 },
      horarioRegistrado: true,
    },
    score: score(),
    categorias: [{ codigoRdc: '4.8', nome: 'Preparação', score: score() }],
    pendencias: { total: 1, porEtapa: { abertura: 1, servico: 0, fechamento: 0 } },
    itens: [
      {
        codigoRdc: '4.6.3', categoria: 'Manipuladores', categoriaCodigo: '4.6',
        topicos: ['Uniforme limpo'], critico: false, resposta: 'adequado',
        respondidaEm: '2026-10-21T10:05:00.000Z', corrigidoNaHora: false, etapa: 'abertura',
      },
      {
        codigoRdc: '4.8.8', categoria: 'Preparação', categoriaCodigo: '4.8',
        topicos: ['70 °C em todas as partes'], critico: true, resposta: 'inadequado',
        respondidaEm: '2026-10-21T12:00:00.000Z', corrigidoNaHora: true, etapa: 'servico',
      },
      {
        codigoRdc: '4.6.2', categoria: 'Preparação', categoriaCodigo: '4.8',
        topicos: ['Afastar quem tem lesão'], critico: true, resposta: null,
        respondidaEm: null, corrigidoNaHora: false, etapa: 'abertura',
      },
    ],
    inadequados: [],
    itensOcultos: 0,
    pesoCritico: 3,
    ...extra,
  };
}

test('escapar troca os caracteres que têm sentido em HTML', () => {
  assert.equal(escapar(`<b>"Zé" & 'Ana'</b>`), '&lt;b&gt;&quot;Zé&quot; &amp; &#39;Ana&#39;&lt;/b&gt;');
});

test('o nome digitado pelo usuário não vira marcação', () => {
  const html = montarHtmlRelatorio(
    dados({
      estabelecimento: { nome: 'Bar <script>x</script>', perfil: 'Restaurante', cidade: null, responsavel: null },
    }),
  );
  assert.ok(!html.includes('<script>'), 'nada de tag vinda do usuário');
  assert.ok(html.includes('Bar &lt;script&gt;'));
});

test('a descrição da ação é escapada e mantém as quebras de linha', () => {
  const html = montarHtmlRelatorio(
    dados({
      inadequados: [
        {
          codigoRdc: '4.3.1',
          topicos: ['Local livre de pragas'],
          corrigidoNaHora: false,
          acao: { descricao: 'Plano:\n1. A <b>', prazo: '2026-10-28', situacao: 'no_prazo' },
        },
      ],
    }),
  );
  assert.ok(html.includes('Plano:<br>1. A &lt;b&gt;'));
  assert.ok(html.includes('No prazo'));
  assert.ok(html.includes('Situação das ações em 21/10/2026'), 'a seção diz que é foto do dia');
});

/**
 * ACHADO DO FISCAL: o PDF só listava inadequado com ação, e o corrigido
 * na hora e o sem ação sumiam. Os três casos da tela têm que aparecer.
 */
test('todo inadequado aparece: com ação, corrigido na hora ou sem ação', () => {
  const html = montarHtmlRelatorio(
    dados({
      inadequados: [
        { codigoRdc: '4.8.8', topicos: ['70 °C'], corrigidoNaHora: true, acao: null },
        { codigoRdc: '4.2.1', topicos: ['Piso'], corrigidoNaHora: false, acao: null },
      ],
    }),
  );
  assert.ok(html.includes('Corrigido na hora — não gerou ação.'));
  assert.ok(html.includes('Sem ação registrada.'));
});

/**
 * ACHADO DO FISCAL (bloqueou o commit): a diária pré-v12 não congelou o
 * horário, e o PDF afirmava "sem horário". Agora diz que não foi
 * registrado — dado ausente não é impresso como fato.
 */
test('horário: não registrado (pré-v12) ≠ sem horário ≠ com horário', () => {
  const insp = dados().inspecao;
  const comHorario = montarHtmlRelatorio(dados());
  assert.ok(comHorario.includes('07:00 às 22:00'));

  const semHorario = montarHtmlRelatorio(
    dados({ inspecao: { ...insp, horarios: null, horarioRegistrado: true } }),
  );
  assert.ok(semHorario.includes('Sem horário de funcionamento cadastrado'));

  const preV12 = montarHtmlRelatorio(
    dados({ inspecao: { ...insp, horarios: null, horarioRegistrado: false }, pendencias: null }),
  );
  assert.ok(preV12.includes('Não registrado nesta diária'));
  assert.ok(!preV12.includes('Sem horário'));
});

test('na diária, cada item mostra a etapa; fora dela, não', () => {
  assert.ok(montarHtmlRelatorio(dados()).includes('<span class="etapa">Antes de abrir</span>'));
  const auditoria = montarHtmlRelatorio(
    dados({
      inspecao: { ...dados().inspecao, trilha: 'periodico', horarios: null },
      itens: dados().itens.map((i) => ({ ...i, etapa: null })),
      pendencias: null,
    }),
  );
  assert.ok(!auditoria.includes('class="etapa"'));
});

test('resposta em outro dia leva a data junto da hora', () => {
  const { horaDaResposta } = relatorioHtml();
  assert.equal(horaDaResposta(null, '2026-10-21'), '—');
  // Mesmo dia local: só a hora. (A conta é no fuso do aparelho; usa-se o
  // meio-dia para o teste não depender do fuso da máquina.)
  assert.doesNotMatch(horaDaResposta('2026-10-21T15:00:00.000Z', '2026-10-21'), /\//);
  assert.match(horaDaResposta('2026-10-25T15:00:00.000Z', '2026-10-21'), /^25\/10 /);
});

test('itens ocultos (RF09) aparecem como contagem, quando há', () => {
  assert.ok(!montarHtmlRelatorio(dados()).includes('não se aplica" para este'));
  const html = montarHtmlRelatorio(dados({ itensOcultos: 2 }));
  assert.ok(html.includes('2 itens estão marcados como "não se aplica" para este estabelecimento'));
});

test('score nulo sai "—", nunca 0%', () => {
  const html = montarHtmlRelatorio(dados({ score: score({ valor: null, avaliados: 0 }) }));
  assert.ok(html.includes('<div class="score">—</div>'));
});

test('a lista item a item vai inteira, inclusive o que ficou sem resposta', () => {
  const html = montarHtmlRelatorio(dados());
  assert.ok(html.includes('4.6.3') && html.includes('4.8.8') && html.includes('4.6.2'));
  assert.ok(html.includes('Sem resposta'));
  assert.ok(html.includes('corrigido na hora'));
});

/**
 * Pedido do autor (27/10/2026): a página cortada no meio da lista item a
 * item começava sem dizer de que relatório era. O título e as colunas
 * ficam no <thead>, que a impressão repete no topo de cada página
 * (conferido num PDF de 3 páginas gerado pelo motor do Chromium).
 */
test('a lista item a item repete o cabeçalho nas páginas seguintes', () => {
  const html = montarHtmlRelatorio(dados());
  const thead = /<table class="itens"><thead>([\s\S]*?)<\/thead>/.exec(html);
  assert.ok(thead, 'o cabeçalho tem que estar num <thead>, que é o que se repete');
  assert.ok(thead[1].includes('Item a item'));
  assert.ok(thead[1].includes('Cantina da Ana · Diária · 21/10/2026'));
  assert.ok(thead[1].includes('<th>Resposta</th>'));
  assert.ok(html.includes('thead { display: table-header-group; }'));
});

test('diária mostra as pendências por etapa', () => {
  const html = montarHtmlRelatorio(dados());
  assert.ok(html.includes('Pendências do dia: 1'));
  assert.ok(html.includes('Antes de abrir'));
});

test('diária anterior à v12: pendências "não disponíveis", e não zero', () => {
  const html = montarHtmlRelatorio(dados({ pendencias: null }));
  assert.ok(html.includes('Pendências não disponíveis'));
  assert.ok(!html.includes('Pendências do dia: 0'));
});

test('a faixa da RDC 275 só aparece na auditoria periódica, com a ressalva', () => {
  const diaria = montarHtmlRelatorio(dados());
  assert.ok(!diaria.includes('RDC 275'));

  const auditoria = montarHtmlRelatorio(
    dados({
      inspecao: { ...dados().inspecao, trilha: 'periodico', modo: 'completa', horarios: null },
      pendencias: null,
    }),
  );
  assert.ok(auditoria.includes('Grupo 2'), '75% cai no grupo 2');
  assert.ok(auditoria.includes('adaptada da RDC 275/2002'));
  assert.ok(!auditoria.includes('Pendências'), 'pendência é só da diária');
});

test('sem cidade nem responsável, as linhas não aparecem vazias', () => {
  const html = montarHtmlRelatorio(dados());
  assert.ok(!html.includes('Cidade'));
  assert.ok(!html.includes('Responsável'));
});

test('nenhuma cor escrita à mão: tudo vem do theme', () => {
  // As cores entram no HTML já resolvidas; o que se confere é que vieram
  // da paleta, e não de um hexadecimal digitado no relatorioHtml.ts.
  const fonte = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'db', 'relatorioHtml.ts'),
    'utf8',
  );
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(fonte.replace(/&#39;/g, '')));
});

// ---------------------------------------------------------------
// AS CONSULTAS DO RELATÓRIO (SQL real de db/relatorio.ts)
// ---------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { bancoVazio } = require('./_apoio/banco');
const { schema, seed } = require('./_apoio/modulos');

const FONTE_RELATORIO = fs.readFileSync(path.join(__dirname, '..', 'db', 'relatorio.ts'), 'utf8');
function sqlDoRelatorio(nome) {
  const achado = new RegExp('const ' + nome + ' = `([\\s\\S]*?)`;').exec(FONTE_RELATORIO);
  assert.ok(achado, `${nome} não encontrado em db/relatorio.ts`);
  return achado[1];
}

function cenarioRelatorio() {
  const db = bancoVazio();
  schema().migrar(db);
  seed().semear(db);
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('T', 'restaurante', '2026-10-01', 30)`,
  );
  // Inspeção antiga (1) e a do relatório (2).
  for (const dia of ['2026-10-20', '2026-10-21']) {
    db.runSync(
      `INSERT INTO inspecao (estabelecimento_id, trilha, data_inicio, status, dia_local, itens_previstos)
       VALUES (1, 'periodico', ?, 'concluida', ?, ?)`,
      `${dia}T10:00:00.000Z`,
      dia,
      JSON.stringify(['prag_01', 'prep_11', 'edif_01']),
    );
  }
  const responder = (inspecao, item, resposta) =>
    db.runSync(
      `INSERT INTO resposta (inspecao_id, item_id, resposta, respondida_em)
       VALUES (?, ?, ?, '2026-10-21T12:00:00.000Z')`,
      inspecao,
      item,
      resposta,
    );
  responder(2, 'prep_11', 'inadequado');
  responder(2, 'edif_01', 'adequado');
  responder(2, 'mani_03', 'adequado'); // respondido sem estar previsto
  return db;
}

test('relatório: previstos sem resposta entram, e respondidos fora da lista também', () => {
  const db = cenarioRelatorio();
  const lista = db.cru.prepare(sqlDoRelatorio('SELECT_ITENS_RELATORIO')).all(
    2,
    JSON.stringify(['prag_01', 'prep_11', 'edif_01']),
  );
  const porCodigo = Object.fromEntries(lista.map((l) => [l.codigo_rdc, l.resposta]));
  assert.equal(lista.length, 4);
  assert.equal(porCodigo['4.3.1'], null, 'prag_01 previsto e sem resposta');
  assert.equal(porCodigo['4.8.11'], 'inadequado');
  assert.equal(porCodigo['4.6.3'], 'adequado', 'respondido fora da lista aparece');
});

test('relatório: inspeção antes da v12 (sem lista) mostra só os respondidos', () => {
  const db = cenarioRelatorio();
  const lista = db.cru.prepare(sqlDoRelatorio('SELECT_ITENS_RELATORIO')).all(2, null);
  assert.equal(lista.length, 3);
});

test('relatório: a ação de um inadequado vem, e a desta inspeção na frente', () => {
  const db = cenarioRelatorio();
  // Concluída, desta inspeção; e uma aberta, nascida na anterior.
  db.runSync(
    `INSERT INTO acao (estabelecimento_id, item_id, inspecao_id, descricao, prazo, status, criada_em)
     VALUES (1, 'prep_11', 2, 'desta', '2026-10-28', 'concluida', '2026-10-21T13:00:00.000Z')`,
  );
  db.runSync(
    `INSERT INTO acao (estabelecimento_id, item_id, inspecao_id, descricao, prazo, criada_em)
     VALUES (1, 'prep_11', 1, 'da anterior', '2026-10-27', '2026-10-20T13:00:00.000Z')`,
  );
  // Item adequado com ação aberta: não entra no relatório desta inspeção.
  db.runSync(
    `INSERT INTO acao (estabelecimento_id, item_id, inspecao_id, descricao, prazo, criada_em)
     VALUES (1, 'edif_01', 1, 'outra', '2026-10-27', '2026-10-20T13:00:00.000Z')`,
  );

  const acoes = db.cru.prepare(sqlDoRelatorio('SELECT_ACOES_RELATORIO')).all(1, 2, 2, 2);
  assert.deepEqual(
    acoes.map((a) => a.descricao),
    ['desta', 'da anterior'],
    'a tela fica com a primeira por item',
  );
});

test('a reincidência do item aparece na lista item a item, com o texto da trilha', () => {
  const base = dados();
  const itens = base.itens.map((item) =>
    item.codigoRdc === '4.8.8' ? { ...item, reincidencia: { vezes: 3, de: 7, naUltima: true } } : item,
  );
  const html = montarHtmlRelatorio({ ...base, itens });
  assert.match(html, /class="reincidente">Inadequado em 3 das últimas 7 diárias</);
  // Só no item que falhou antes: um selo só no relatório inteiro.
  assert.equal(html.split('class="reincidente"').length - 1, 1);

  const auditoria = montarHtmlRelatorio({
    ...base,
    inspecao: { ...base.inspecao, trilha: 'periodico' },
    itens,
  });
  assert.match(auditoria, /Inadequado na auditoria anterior/);
});

test('sem reincidência, nenhum selo no relatório', () => {
  assert.doesNotMatch(montarHtmlRelatorio(dados()), /class="reincidente"/);
});
