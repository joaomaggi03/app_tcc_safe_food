/**
 * app/_layout.tsx
 * ---------------------------------------------------------------
 * Layout raiz do app. No expo-router, um arquivo `_layout.tsx`
 * define o "esqueleto" de navegação que envolve as telas irmãs.
 *
 * Aqui usamos <Tabs>, que cria a barra de abas de baixo.
 * Cada <Tabs.Screen name="X" /> aponta para o arquivo app/X.tsx.
 *
 * AS TRÊS ABAS SÃO TRÊS PERGUNTAS, não três objetos:
 *
 *   index            -> Hoje            "o que eu faço agora?"
 *   conformidade     -> Conformidade    "como estou?"
 *   estabelecimento  -> Estabelecimento "como o app está configurado?"
 *
 * O desenho anterior (Início, Nova Inspeção, Histórico) tinha dois
 * problemas que este resolve: o Início listava as três trilhas e cada
 * linha levava a Nova Inspeção, que listava as três trilhas de novo; e
 * a rotina diária, que se usa várias vezes por dia, ficava a três
 * toques — a mesma distância da auditoria, que roda uma vez por mês.
 *
 * Nova Inspeção continua existindo como ROTA (`href: null`), aberta
 * pelo "+" da aba Hoje. Deixou de ser destino fixo porque não é um
 * lugar: é uma ação, e das raras.
 */

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { reagendarAlertas } from '../db/notificacoes';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';

export default function LayoutRaiz() {
  // Carrega o estabelecimento do banco UMA vez, quando o app abre.
  // Fica aqui, no layout raiz, porque este componente envolve todas as
  // telas — assim qualquer uma já encontra o store preenchido.
  const carregar = useEstabelecimento((estado) => estado.carregar);
  const estabelecimento = useEstabelecimento((estado) => estado.atual);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Reagenda os alertas de vencimento (RF05) sempre que o app abre ou
   * o estabelecimento muda.
   *
   * Aqui, e não numa tela, porque o agendamento não pertence a nenhuma
   * tela: ele tem que acontecer mesmo que o usuário abra o app direto na
   * Conformidade. E é reagendamento completo — cancela tudo e recria —
   * para não existir uma segunda verdade sobre o que está agendado.
   *
   * A promessa é deliberadamente ignorada: se a permissão for negada, o
   * app segue inteiro, só sem alerta. Nada aqui pode travar a abertura.
   *
   * Depende do estabelecimento INTEIRO, e não só do id, porque mudar a
   * periodicidade da auditoria (aba Estabelecimento) muda o vencimento —
   * e o alerta agendado precisa acompanhar.
   */
  useEffect(() => {
    if (!estabelecimento) return;
    void reagendarAlertas(estabelecimento);
  }, [estabelecimento]);

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
            title: 'Hoje',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="today-outline" color={color} size={size} />
            ),
          }}
        />

        <Tabs.Screen
          name="conformidade"
          options={{
            title: 'Conformidade',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="stats-chart-outline" color={color} size={size} />
            ),
          }}
        />

        <Tabs.Screen
          name="estabelecimento"
          options={{
            title: 'Estabelecimento',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="storefront-outline" color={color} size={size} />
            ),
          }}
        />

        {/*
          Daqui para baixo, rotas que NÃO são abas (`href: null`): elas
          se abrem por cima do conteúdo, a partir de um toque, e não são
          destinos fixos.
        */}

        {/* A folha das três trilhas, aberta pelo "+" da aba Hoje. */}
        <Tabs.Screen
          name="nova-inspecao"
          options={{ href: null, title: 'Nova inspeção' }}
        />

        {/* O cadastro: primeiro acesso, ou edição. */}
        <Tabs.Screen
          name="cadastro"
          options={{ href: null, title: 'Estabelecimento' }}
        />

        {/*
          A execução da auditoria periódica e da semestral. Não poderia
          ser aba nem se quiséssemos: depende do parâmetro `?trilha=`, e
          uma aba não tem como informá-lo. (A diária mora na aba Hoje.)
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

        {/* O plano de ação corretiva (RF07), aberto pela aba Conformidade. */}
        <Tabs.Screen
          name="plano-acao"
          options={{ href: null, title: 'Plano de ação' }}
        />

        {/* Criar ou editar UMA ação — `?item=` e, se veio de uma inspeção, `&inspecao=`. */}
        <Tabs.Screen
          name="acao"
          options={{ href: null, title: 'Ação corretiva' }}
        />
      </Tabs>
    </>
  );
}
