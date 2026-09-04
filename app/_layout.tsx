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

// Cor de destaque do app (verde de "conformidade").
const COR_ATIVA = '#2E7D32';
const COR_INATIVA = '#8A8A8E';

export default function LayoutRaiz() {
  return (
    <>
      <StatusBar style="dark" />

      <Tabs
        screenOptions={{
          tabBarActiveTintColor: COR_ATIVA,
          tabBarInactiveTintColor: COR_INATIVA,
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTitleStyle: { color: '#1C1C1E' },
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
      </Tabs>
    </>
  );
}
