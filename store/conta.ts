/**
 * store/conta.ts
 * ---------------------------------------------------------------
 * QUEM ESTÁ LOGADO (RF01, Fase 6), com Zustand.
 *
 * A verdade sobre a sessão é do Supabase: ele a guarda no aparelho e a
 * renova sozinho. Este store só a espelha para as telas, e se mantém em
 * dia pelo `onAuthStateChange` — o aviso que o Supabase dá a cada
 * entrada, saída ou renovação.
 *
 * O login é OPCIONAL. `email === null` é o estado normal de quem usa o
 * app sem conta, e nada no núcleo muda por causa disso.
 */

import { create } from 'zustand';
import { CHAVE_SESSAO, supabase } from '../db/supabase';

interface EstadoConta {
  /** O e-mail da conta logada, ou null. */
  email: string | null;
  /**
   * O id da conta logada, ou null. É ele — e não o e-mail — que decide
   * se este aparelho pertence a esta conta (`donoDoAparelho`).
   */
  usuarioId: string | null;
  /**
   * Se a sessão salva já foi lida. Sem isso, a tela mostraria "entrar"
   * por um instante mesmo para quem já está logado.
   */
  carregada: boolean;
  /**
   * Começa a acompanhar a sessão. Devolve a função que para de
   * acompanhar — o formato que o `useEffect` espera como limpeza.
   */
  acompanhar: () => () => void;
  /** Entra numa conta. Devolve a mensagem de erro, ou null se deu certo. */
  entrar: (email: string, senha: string) => Promise<string | null>;
  /**
   * Cria uma conta. `confirmar: true` quando o Supabase exige confirmar
   * o e-mail antes do primeiro login (é o padrão de um projeto novo).
   */
  criarConta: (email: string, senha: string) => Promise<{ erro: string | null; confirmar: boolean }>;
  /** Sai da conta. Os dados do aparelho FICAM — são do estabelecimento. */
  sair: () => Promise<void>;
}

/** As mensagens do Supabase vêm em inglês; as mais comuns, em português. */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme o e-mail pelo link que enviamos antes de entrar.';
  if (m.includes('already registered')) return 'Já existe uma conta com este e-mail.';
  if (m.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('invalid') && m.includes('email')) return 'E-mail inválido.';
  if (m.includes('network') || m.includes('fetch')) return 'Sem conexão com a internet.';
  return mensagem;
}

export const useConta = create<EstadoConta>((set) => ({
  email: null,
  usuarioId: null,
  carregada: false,

  acompanhar: () => {
    if (!supabase) {
      set({ carregada: true });
      return () => {};
    }

    void supabase.auth.getSession().then(({ data }) => {
      set({
        email: data.session?.user.email ?? null,
        usuarioId: data.session?.user.id ?? null,
        carregada: true,
      });
    });

    const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      set({
        email: sessao?.user.email ?? null,
        usuarioId: sessao?.user.id ?? null,
        carregada: true,
      });
    });

    return () => data.subscription.unsubscribe();
  },

  entrar: async (email, senha) => {
    if (!supabase) return 'Backup desligado neste aparelho.';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      return error ? traduzir(error.message) : null;
    } catch (erro) {
      return traduzir(String(erro));
    }
  },

  criarConta: async (email, senha) => {
    if (!supabase) return { erro: 'Backup desligado neste aparelho.', confirmar: false };
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
      if (error) return { erro: traduzir(error.message), confirmar: false };
      // Sem sessão depois do cadastro = o projeto exige confirmar o e-mail.
      return { erro: null, confirmar: !data.session };
    } catch (erro) {
      return { erro: traduzir(String(erro)), confirmar: false };
    }
  },

  sair: async () => {
    if (!supabase) return;
    // 'local': sai só deste aparelho.
    let falhou = false;
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      falhou = error !== null;
    } catch {
      falhou = true;
    }

    // SEM O SERVIDOR, O SUPABASE NÃO SAI. Com a sessão vencida, ele tenta
    // renová-la antes de sair; a renovação falha na rede e o `signOut`
    // devolve o erro SEM apagar a sessão do aparelho. Aconteceu com o
    // projeto pausado: o botão "Sair da conta" não fazia nada. Sair
    // deste aparelho não depende da nuvem — então a sessão é apagada à
    // mão, e o store avisado, já que nenhum evento do Supabase virá.
    if (falhou && CHAVE_SESSAO) {
      for (const sufixo of ['', '-code-verifier', '-user']) {
        localStorage.removeItem(CHAVE_SESSAO + sufixo);
      }
      set({ email: null, usuarioId: null });
    }
  },
}));
