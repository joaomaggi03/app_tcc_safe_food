/**
 * db/supabase.ts
 * ---------------------------------------------------------------
 * O CLIENTE DO SUPABASE (RF01, Fase 6) — a única porta do app para a
 * nuvem.
 *
 * As chaves vêm de variáveis de ambiente com o prefixo EXPO_PUBLIC_,
 * gravadas no arquivo `.env.local` (fora do git). O Expo as embute no
 * app na hora de empacotar.
 *
 * SEM AS CHAVES, `supabase` é null — e o app funciona inteiro, só sem a
 * opção de backup. É a regra 1 do projeto: a nuvem é um acréscimo, e o
 * núcleo não pode depender dela nem para abrir.
 *
 * A "anon key" não é segredo: ela vai dentro do app de qualquer jeito.
 * Quem protege os dados é a RLS do banco (ver supabase/schema.sql), que
 * só deixa cada conta ver as próprias linhas.
 */

// O Supabase usa a classe URL do navegador, que o React Native não tem
// completa. Este import a instala. Tem que vir antes do createClient.
import 'react-native-url-polyfill/auto';
// Um `localStorage` guardado no próprio SQLite do expo-sqlite (que o
// projeto já tem). É onde a sessão fica salva: sem ele, fechar o app
// deslogaria o usuário.
import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL_SUPABASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const CHAVE_ANONIMA = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  URL_SUPABASE && CHAVE_ANONIMA
    ? createClient(URL_SUPABASE, CHAVE_ANONIMA, {
        auth: {
          storage: localStorage,
          autoRefreshToken: true,
          persistSession: true,
          // No celular não existe URL de retorno de login para ler.
          detectSessionInUrl: false,
        },
      })
    : null;

/** Se este build tem as chaves da nuvem. */
export function nuvemConfigurada(): boolean {
  return supabase !== null;
}
