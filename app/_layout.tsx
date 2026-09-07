/**
 * app/_layout.tsx
 * ---------------------------------------------------------------
 * Layout raiz do app. No expo-router, um arquivo `_layout.tsx`
 * define o "esqueleto" de navegação que envolve as telas irmãs.
 *
 * Aqui usamos <Tabs>, que cria a barra de abas de baixo.
 * Cada <Tabs.Screen name="X" /> aponta para o arquivo app/X.tsx:
 *
 *   name="index"          -> app/index.tsx          (Início)
 *   name="nova-inspecao"  -> app/nova-inspecao.tsx  (Nova Inspeção)
 *   name="historico"      -> app/historico.tsx      (Histórico)
 *
 * Ou seja: a navegação vem da estrutura de arquivos, não de uma
 * configuração central. Criar um arquivo em app/ cria uma rota.
 */

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';

export default function LayoutRaiz() {
  // Carrega o estabelecimento do banco UMA vez, quando o app abre.
  // Fica aqui, no layout raiz, porque este componente envolve todas as
  // telas — assim qualquer uma já encontra o store preenchido.
  const carregar = useEstabelecimento((estado) => estado.carregar);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <>
      <StatusBar style="dark" />

      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Cores.abaAtiva,
          tabBarInactiveTintColor: Cores.abaInativa,
          tabBarStyle: {
            backgroundColor: Cores.superficie,
            borderTopColor: Cores.borda,
          },
          headerStyle: {
            backgroundColor: Cores.superficie,
            // Faixa fina na cor da marca embaixo do cabeçalho.
            borderBottomWidth: 3,
            borderBottomColor: Cores.primaria,
          },
          headerTitleStyle: { color: Cores.texto },
          headerShadowVisible: false,
          headerTitleAlign: 'left',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Início',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" color={color} size={size} />
            ),
          }}
        />

        <Tabs.Screen
          name="nova-inspecao"
          options={{
            title: 'Nova Inspeção',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="clipboard-outline" color={color} size={size} />
            ),
          }}
        />

        <Tabs.Screen
          name="historico"
          options={{
            title: 'Histórico',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time-outline" color={color} size={size} />
            ),
          }}
        />

        {/*
          A tela de cadastro é uma rota normal (app/cadastro.tsx), mas
          `href: null` a esconde da barra de abas: ela não é um destino
          fixo, e sim algo que se abre no primeiro acesso ou ao editar.
        */}
        <Tabs.Screen
          name="cadastro"
          options={{ href: null, title: 'Estabelecimento' }}
        />

        {/*
          Mesma ideia para a execução da inspeção: ela não é uma aba, e
          sim o destino de quem escolheu uma trilha em Nova Inspeção.
          Não poderia ser aba nem se quiséssemos — ela depende do
          parâmetro `?trilha=`, e uma aba não tem como informá-lo.
        */}
        <Tabs.Screen
          name="inspecao"
          options={{ href: null, title: 'Inspeção' }}
        />

        {/* O resultado da inspeção (Fase 4), aberto ao concluir. */}
        <Tabs.Screen
          name="resultado"
          options={{ href: null, title: 'Resultado' }}
        />
      </Tabs>
    </>
  );
}
