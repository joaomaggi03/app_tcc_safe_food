/**
 * tests/dados.test.js
 * ---------------------------------------------------------------
 * Integridade do conteúdo: a norma estruturada (data/rdc216.ts) e a
 * rotina guiada (data/rotina-diaria.ts).
 *
 * Estes arquivos são editados à mão sempre que a norma ou o resumo
 * mudam, e um deslize aqui não quebra o app — ele só faz uma exigência
 * sanitária SUMIR da tela sem ninguém perceber. É o tipo de falha que só
 * um teste pega.
 *
 * Os módulos são carregados de verdade (compilados pelo `pretest`), não
 * lidos com expressão regular: o teste enxerga exatamente os mesmos
 * objetos que o app.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { rdc216, rotinaDiaria } = require('./_apoio/modulos');

const { ITENS, CATEGORIAS, PERFIS } = rdc216();
const { ROTINA_DIARIA } = rotinaDiaria();

const MOMENTOS = new Set(['abertura', 'servico', 'fechamento']);
const TRILHAS = new Set(['diario', 'periodico', 'semestral']);

test('o catálogo tem a forma esperada', () => {
  assert.equal(PERFIS.length, 6, 'os seis perfis de negócio (RF02)');
  assert.equal(CATEGORIAS.length, 12, 'as doze seções da RDC (4.1 a 4.12)');
  assert.ok(ITENS.length > 0);

  const ids = ITENS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'nenhum id de item repetido');

  const categorias = new Set(CATEGORIAS.map((c) => c.id));
  for (const item of ITENS) {
    assert.ok(categorias.has(item.categoriaId), `${item.id} aponta para categoria inexistente`);
    assert.ok(TRILHAS.has(item.frequencia), `${item.id} tem frequência inválida`);
    assert.ok(item.perfis.length > 0, `${item.id} não aparece para nenhum perfil`);
  }
});

test('todo item tem resumo em tópicos, curto o bastante para o celular', () => {
  for (const item of ITENS) {
    assert.ok(Array.isArray(item.topicos), `${item.id} sem tópicos`);
    assert.ok(item.topicos.length >= 1, `${item.id} com lista de tópicos vazia`);
    assert.ok(item.topicos.length <= 3, `${item.id} tem tópicos demais (${item.topicos.length})`);

    for (const topico of item.topicos) {
      assert.ok(topico.trim().length > 0, `${item.id} tem tópico vazio`);
      assert.ok(topico.length <= 62, `${item.id}: tópico longo demais (${topico.length})`);
    }
  }
});

/**
 * O `momento` decide em que bloco do expediente o item aparece. Se um
 * item diário ficar sem ele, o app o joga em "durante o serviço" por
 * padrão — silenciosamente, no bloco errado.
 */
test('momento do dia só existe, e sempre existe, nos itens diários', () => {
  for (const item of ITENS) {
    if (item.frequencia === 'diario') {
      assert.ok(item.momento, `${item.id} é diário e está sem momento`);
      assert.ok(MOMENTOS.has(item.momento), `${item.id} tem momento inválido: ${item.momento}`);
    } else {
      assert.equal(item.momento, undefined, `${item.id} não é diário e tem momento`);
    }
  }
});

test('apenas os itens semestrais carregam prazo legal, e ele é de 180 dias', () => {
  for (const item of ITENS) {
    if (item.frequencia === 'semestral') {
      assert.equal(item.periodicidadeDias, 180, `${item.id}: a norma fixa 180 dias`);
    } else {
      assert.equal(item.periodicidadeDias, undefined, `${item.id} não deveria ter prazo legal`);
    }
  }
});

test('item crítico pesa mais que item comum', () => {
  for (const item of ITENS) {
    assert.ok(item.peso >= 1, `${item.id} com peso inválido`);
    if (item.critico) assert.ok(item.peso > 1, `${item.id} é crítico mas pesa como comum`);
  }
});

// ---------------------------------------------------------------
// ROTINA GUIADA
// ---------------------------------------------------------------

const diarios = ITENS.filter((i) => i.frequencia === 'diario');
const cobertos = ROTINA_DIARIA.flatMap((v) => v.itens);

/**
 * A rotina é o modo padrão da diária. Um item de fora dela vira uma
 * exigência que o usuário nunca vê no dia a dia; um item repetido em
 * duas verificações seria respondido duas vezes, com respostas
 * possivelmente contraditórias.
 */
test('a rotina cobre exatamente os itens diários, sem sobra nem repetição', () => {
  const idsValidos = new Set(ITENS.map((i) => i.id));
  for (const id of cobertos) {
    assert.ok(idsValidos.has(id), `a rotina cita um item inexistente: ${id}`);
  }

  assert.equal(new Set(cobertos).size, cobertos.length, 'há item em duas verificações');

  const naoDiarios = cobertos.filter(
    (id) => ITENS.find((i) => i.id === id).frequencia !== 'diario',
  );
  assert.deepEqual(naoDiarios, [], 'a rotina cita item de outra trilha');

  const deFora = diarios.map((i) => i.id).filter((id) => !cobertos.includes(id));
  assert.deepEqual(deFora, [], 'item diário sem nenhuma verificação que o cubra');
});

test('cada verificação fica no mesmo momento dos itens que cobre', () => {
  for (const verificacao of ROTINA_DIARIA) {
    assert.ok(MOMENTOS.has(verificacao.momento), `${verificacao.id}: momento inválido`);

    for (const id of verificacao.itens) {
      const item = ITENS.find((i) => i.id === id);
      assert.equal(
        item.momento,
        verificacao.momento,
        `${verificacao.id} cobre ${id}, que é de outro momento`,
      );
    }
  }
});

test('toda verificação tem título, resumo e enunciado completo', () => {
  const ids = ROTINA_DIARIA.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'id de verificação repetido');

  for (const v of ROTINA_DIARIA) {
    assert.ok(v.titulo.trim().length > 0, `${v.id} sem título`);
    assert.ok(v.itens.length > 0, `${v.id} não cobre item nenhum`);
    assert.ok(v.topicos.length >= 1 && v.topicos.length <= 3, `${v.id}: tópicos fora de 1 a 3`);

    for (const topico of v.topicos) {
      assert.ok(topico.length <= 62, `${v.id}: tópico longo demais (${topico.length})`);
    }

    // O resumo precisa encurtar de verdade. Sem este limite, "resumo"
    // vira uma cópia do enunciado e o problema que ele resolve volta.
    const resumo = v.topicos.join(' ').length;
    assert.ok(
      resumo < v.texto.length * 0.75,
      `${v.id}: o resumo tem ${resumo} chars para um texto de ${v.texto.length} — não resume`,
    );
  }
});

/**
 * O filtro por perfil (RF03) atravessa a rotina: uma verificação cujos
 * itens não se aplicam ao perfil some da tela. Nenhum perfil pode acabar
 * com item diário órfão — coberto por nenhuma verificação visível.
 */
test('todo perfil enxerga seus itens diários através da rotina', () => {
  for (const perfil of PERFIS) {
    const doPerfil = diarios.filter((i) => i.perfis.includes(perfil.id)).map((i) => i.id);

    const visiveis = ROTINA_DIARIA.flatMap((v) =>
      v.itens.filter((id) => doPerfil.includes(id)),
    );

    assert.deepEqual(
      doPerfil.slice().sort(),
      visiveis.slice().sort(),
      `${perfil.id}: item diário que a rotina não mostra`,
    );
  }
});
