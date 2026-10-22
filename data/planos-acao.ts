/**
 * data/planos-acao.ts
 * ---------------------------------------------------------------
 * O CATÁLOGO DE PLANOS DE AÇÃO PRONTOS — por item da norma.
 *
 * Pedido do orientador (20/10/2026), entrega 4: em vez do texto genérico
 * "Adequar ao item X da RDC 216: …", o item que falha já gera uma ação
 * com os PASSOS de correção. O orientador reconheceu que escrever isso
 * para os 89 itens seria demais; o app traz UM exemplo, e este arquivo é
 * o lugar onde os outros entrariam — o resto do código já está pronto
 * para eles.
 *
 * É DADO, NÃO CÓDIGO (mesma regra do `rdc216.ts`). Por isso:
 *  - cada passo diz a ORIGEM: um artigo da RDC 216 ou um complemento com
 *    a FONTE escrita. Complemento sem fonte não entra (regra 4 do
 *    CLAUDE.md — o app não inventa conteúdo técnico);
 *  - o texto vem revisado pelo autor contra a fonte. O rascunho em
 *    `docs/rascunhos/` NÃO é conteúdo do app até essa revisão.
 *
 * O FILTRO POR PERFIL (opção decidida em 21/10/2026): cada passo aponta,
 * em `itemRelacionado`, o item do checklist de onde ele vem. O passo só
 * aparece se esse item vale para o perfil do estabelecimento (RF03) e não
 * foi marcado "não se aplica" (RF09). Feirante não recebe "instale telas"
 * porque o item das telas não vale para feirante — a regra é a que já
 * existia.
 *
 * Ao mudar este arquivo, suba a `VERSAO_SEED` em `db/seed.ts`: é ela que
 * leva o catálogo ao SQLite dos aparelhos que já têm o app.
 */

/** De onde vem o passo: da norma, ou de uma fonte externa citada. */
export type OrigemPasso =
  | { tipo: 'norma'; codigoRdc: string }
  | { tipo: 'complemento'; fonte: string };

export interface PassoPlano {
  texto: string;
  /** Id do item (`ITENS` do rdc216.ts) que torna o passo aplicável. */
  itemRelacionado: string;
  origem: OrigemPasso;
}

export interface PlanoPronto {
  /** O item que, inadequado, recebe este plano. */
  itemId: string;
  passos: PassoPlano[];
}

/**
 * O exemplo: `prag_01` (controle de pragas, 4.3.1). Texto do rascunho em
 * `docs/rascunhos/plano-acao-prag_01.md`, aprovado pelo autor em
 * 21/10/2026. O complemento do rascunho ("anotar onde e quando a praga foi
 * vista") ficou de fora por não ter fonte. Os exemplos do passo 1
 * (restos, frestas, aberturas) são redação nossa do objetivo do 4.3.1, e
 * vêm marcados com "por exemplo". O fiscal pegou uma citação errada do
 * rascunho (POP e comprovante eram o 4.11.6, não o 4.11.4) — prova de que
 * as citações precisam ser conferidas no texto oficial antes da banca.
 */
export const PLANOS_PRONTOS: PlanoPronto[] = [
  {
    itemId: 'prag_01',
    passos: [
      // Prevenção — atacar a causa.
      {
        // O "por exemplo" separa, no texto que o usuário lê, o objetivo da
        // norma dos exemplos, que são redação nossa (achado do `fiscal`).
        texto:
          'Adotar ações contínuas para impedir a atração, o abrigo, o acesso e a proliferação de pragas — por exemplo, eliminando restos de alimento expostos, frestas e aberturas sem proteção.',
        itemRelacionado: 'prag_01',
        origem: { tipo: 'norma', codigoRdc: '4.3.1' },
      },
      {
        texto:
          'Instalar ou repor telas milimetradas removíveis nas aberturas externas das áreas de preparo e armazenamento, inclusive na exaustão.',
        itemRelacionado: 'edif_04',
        origem: { tipo: 'norma', codigoRdc: '4.1.4' },
      },
      {
        texto: 'Usar coletores de lixo com tampa acionada sem contato manual nas áreas de preparo.',
        itemRelacionado: 'resi_02',
        origem: { tipo: 'norma', codigoRdc: '4.5.2' },
      },
      {
        texto: 'Retirar o lixo com frequência e guardá-lo em local fechado, isolado dos alimentos.',
        itemRelacionado: 'resi_03',
        origem: { tipo: 'norma', codigoRdc: '4.5.3' },
      },
      // Se a prevenção não bastar — controle químico.
      {
        texto:
          'Se a prevenção não bastar, contratar empresa especializada para o controle químico, com produtos regularizados no Ministério da Saúde. O controle químico é feito pela empresa, e não pelo próprio estabelecimento.',
        itemRelacionado: 'prag_02',
        origem: { tipo: 'norma', codigoRdc: '4.3.2' },
      },
      {
        texto:
          'Seguir os procedimentos pré e pós-tratamento indicados pela empresa, protegendo alimentos, equipamentos e utensílios, e higienizar equipamentos e utensílios antes de usá-los de novo.',
        itemRelacionado: 'prag_03',
        origem: { tipo: 'norma', codigoRdc: '4.3.3' },
      },
      {
        texto: 'Guardar o comprovante de execução do serviço emitido pela empresa.',
        // O artigo é o do POP (4.11.6), mas o passo só faz sentido onde há
        // controle químico — por isso o item relacionado é o 4.3.2, que só
        // vale para fixos e food truck. Artigo citado ≠ item relacionado.
        itemRelacionado: 'prag_02',
        origem: { tipo: 'norma', codigoRdc: '4.11.6' },
      },
      // Documentação.
      {
        texto:
          'Conferir se o POP de controle de vetores e pragas existe e descreve as medidas preventivas e corretivas; atualizar se o problema mostrou uma falha nele.',
        itemRelacionado: 'docu_06',
        origem: { tipo: 'norma', codigoRdc: '4.11.6' },
      },
    ],
  },
];
