/**
 * store/estabelecimento.ts
 * ---------------------------------------------------------------
 * O ESTADO GLOBAL do estabelecimento atual, com Zustand.
 *
 * O PROBLEMA QUE ISSO RESOLVE
 * Duas telas precisam saber qual é o estabelecimento: o Início e o
 * checklist. Se cada uma consultasse o banco por conta própria, ao
 * trocar o tipo no Início a tela de checklist continuaria mostrando a
 * lista do perfil antigo — ela não teria como saber que algo mudou.
 *
 * COMO FUNCIONA
 * `create` monta uma "caixinha" com dados e funções. Qualquer tela lê
 * dela com o hook `useEstabelecimento(...)`. Quando alguém chama `set`,
 * TODA tela que lê aquele pedaço se redesenha sozinha.
 *
 * Repare que o Zustand não substitui o banco: o SQLite continua sendo a
 * verdade que sobrevive a fechar o app. O store é só uma cópia em
 * memória, para as telas conversarem entre si sem reconsultar o disco.
 */

import { create } from 'zustand';
import { obterEstabelecimento, type Estabelecimento } from '../db/consultas';

interface EstadoEstabelecimento {
  /** O estabelecimento cadastrado, ou null se ainda não houver nenhum. */
  atual: Estabelecimento | null;
  /**
   * Se o banco já foi consultado. Sem isso, `atual === null` teria dois
   * significados ("não carregou ainda" e "não existe") e o app mandaria
   * o usuário para o cadastro por um instante mesmo já tendo cadastro.
   */
  carregado: boolean;
  /** Lê o banco e preenche o store. Chamado uma vez, no layout raiz. */
  carregar: () => void;
  /** Atualiza o store depois de salvar no banco. */
  definir: (estabelecimento: Estabelecimento) => void;
}

export const useEstabelecimento = create<EstadoEstabelecimento>((set) => ({
  atual: null,
  carregado: false,

  carregar: () => set({ atual: obterEstabelecimento(), carregado: true }),

  definir: (estabelecimento) => set({ atual: estabelecimento, carregado: true }),
}));
