/**
 * app/index.tsx
 * ---------------------------------------------------------------
 * Tela INÍCIO — rota "/".
 *
 * ATENÇÃO: nesta fase ela é um PAINEL DE DIAGNÓSTICO, temporário.
 * A função dele é provar, no aparelho, que a Fase 1 funcionou:
 * o banco foi criado, a norma foi carregada e o filtro por perfil
 * está montado. Na Fase 2 esta tela vira o painel de verdade
 * (perfil do estabelecimento, trilhas, último score).
 *
 * Como os dados são lidos: `useEffect` roda uma vez, logo depois da
 * primeira renderização, chama as funções de db/consultas.ts e guarda
 * o resultado com `useState`. Guardar num estado é o que faz a tela
 * se redesenhar quando os números chegam.
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  contarCatalogo,
  contarItensPorFrequencia,
  contarItensPorPerfil,
  obterEstabelecimento,
  type ContagemCatalogo,
  type Estabelecimento,
  type ItensPorFrequencia,
  type ItensPorPerfil,
} from '../db/consultas';

interface Diagnostico {
  catalogo: ContagemCatalogo;
  porPerfil: ItensPorPerfil[];
  porFrequencia: ItensPorFrequencia[];
  estabelecimento: Estabelecimento | null;
}

const NOMES_TRILHA: Record<string, string> = {
  diario: 'Diária',
  periodico: 'Periódica (auditoria)',
  semestral: 'Semestral (legal)',
};

export default function TelaInicio() {
  const [dados, setDados] = useState<Diagnostico | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    try {
      // A primeira chamada aqui é o que abre o banco, cria as tabelas
      // e roda o seed (ver db/index.ts).
      setDados({
        catalogo: contarCatalogo(),
        porPerfil: contarItensPorPerfil(),
        porFrequencia: contarItensPorFrequencia(),
        estabelecimento: obterEstabelecimento(),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  if (erro) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.tituloErro}>Erro ao abrir o banco</Text>
        <Text style={estilos.textoErro}>{erro}</Text>
      </View>
    );
  }

  if (!dados) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.subtitulo}>Carregando o banco…</Text>
      </View>
    );
  }

  const { catalogo, porPerfil, porFrequencia, estabelecimento } = dados;

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.etiqueta}>Fase 1 — diagnóstico</Text>
      <Text style={estilos.titulo}>Banco de dados local</Text>
      <Text style={estilos.subtitulo}>
        A RDC 216 foi carregada no SQLite do aparelho. Estes números vêm de consultas
        reais ao banco — se eles aparecem, o seed funcionou.
      </Text>

      <Cartao titulo="Catálogo da norma">
        <Linha rotulo="Perfis de negócio" valor={catalogo.perfis} />
        <Linha rotulo="Categorias (seções 4.1–4.12)" valor={catalogo.categorias} />
        <Linha rotulo="Itens de verificação" valor={catalogo.itens} />
        <Linha rotulo="Ligações item ↔ perfil" valor={catalogo.aplicabilidades} />
      </Cartao>

      <Cartao
        titulo="Itens por perfil"
        nota="É o filtro inteligente (RF03): cada perfil enxerga um subconjunto diferente da norma."
      >
        {porPerfil.map((p) => (
          <Linha key={p.perfil_id} rotulo={p.nome} valor={p.total} />
        ))}
      </Cartao>

      <Cartao
        titulo="Itens por trilha"
        nota="Base da Fase 5. Só a trilha semestral (água) tem prazo fixado pela norma."
      >
        {porFrequencia.map((f) => (
          <Linha
            key={f.frequencia}
            rotulo={NOMES_TRILHA[f.frequencia] ?? f.frequencia}
            valor={f.total}
          />
        ))}
      </Cartao>

      <Cartao
        titulo="Estabelecimento"
        nota="A tabela existe e está vazia — o cadastro é a Fase 2 (RF02)."
      >
        {estabelecimento ? (
          <>
            <Linha rotulo="Nome" valor={estabelecimento.nome} />
            <Linha rotulo="Perfil" valor={estabelecimento.perfil_id} />
            <Linha rotulo="Cadastrado em" valor={estabelecimento.data_cadastro} />
            <Linha
              rotulo="Auditoria a cada"
              valor={`${estabelecimento.periodicidade_auditoria_dias} dias`}
            />
          </>
        ) : (
          <Text style={estilos.vazio}>Nenhum estabelecimento cadastrado ainda.</Text>
        )}
      </Cartao>
    </ScrollView>
  );
}

// --- Pequenos componentes locais, só para não repetir estilo ---

function Cartao({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={estilos.cartao}>
      <Text style={estilos.tituloCartao}>{titulo}</Text>
      {nota ? <Text style={estilos.notaCartao}>{nota}</Text> : null}
      <View style={estilos.divisor} />
      {children}
    </View>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={estilos.valor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#F2F2F7' },
  conteudo: { padding: 20, paddingBottom: 40 },
  centro: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  etiqueta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  titulo: { fontSize: 24, fontWeight: '700', color: '#1C1C1E', marginTop: 4 },
  subtitulo: { fontSize: 14, lineHeight: 21, color: '#5A5A5F', marginTop: 8 },
  cartao: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginTop: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tituloCartao: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  notaCartao: { fontSize: 12, lineHeight: 18, color: '#8A8A8E', marginTop: 4 },
  divisor: { height: 1, backgroundColor: '#E5E5EA', marginVertical: 12 },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  rotulo: { fontSize: 14, color: '#3A3A3C', flex: 1, paddingRight: 12 },
  valor: { fontSize: 15, fontWeight: '700', color: '#2E7D32' },
  vazio: { fontSize: 14, color: '#8A8A8E', fontStyle: 'italic' },
  tituloErro: { fontSize: 18, fontWeight: '700', color: '#B3261E', marginBottom: 8 },
  textoErro: { fontSize: 13, color: '#5A5A5F', textAlign: 'center' },
});
