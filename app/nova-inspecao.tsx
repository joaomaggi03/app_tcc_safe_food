/**
 * app/nova-inspecao.tsx
 * ---------------------------------------------------------------
 * Tela do CHECKLIST DINÂMICO (RF03) — rota "/nova-inspecao".
 *
 * Mostra as exigências da RDC 216 que se aplicam ao perfil do
 * estabelecimento cadastrado, agrupadas por categoria e na ordem da
 * norma. Trocar o tipo no Início muda esta lista.
 *
 * Nesta fase o checklist é SÓ LEITURA. Os botões de resposta
 * (Adequado / Inadequado / Não se Aplica / Não Observado) são a Fase 3.
 *
 * Sobre o SectionList: é o componente do React Native para listas com
 * cabeçalhos de seção. Ele recebe `sections` no formato
 * `[{ title, data: [...] }]` e só desenha o que cabe na tela — com 89
 * itens isso já faz diferença na rolagem.
 */

import { Redirect } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { checklistDoPerfil, type ItemChecklist } from '../db/consultas';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';

/** Rótulo curto de cada trilha de periodicidade (detalhada na Fase 5). */
const ROTULO_TRILHA: Record<ItemChecklist['frequencia'], string> = {
  diario: 'diário',
  periodico: 'periódico',
  semestral: 'semestral',
};

export default function TelaNovaInspecao() {
  const estabelecimento = useEstabelecimento((estado) => estado.atual);
  const carregado = useEstabelecimento((estado) => estado.carregado);

  // Enquanto o banco não foi lido, não dá para saber se existe cadastro.
  if (!carregado) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.aviso}>Carregando…</Text>
      </View>
    );
  }

  if (!estabelecimento) {
    return <Redirect href="/cadastro" />;
  }

  return <Checklist perfilId={estabelecimento.perfil_id} nome={estabelecimento.nome} />;
}

/**
 * Componente separado porque hooks (`useMemo`) não podem ficar depois
 * de um `return` condicional — a regra dos Hooks do React exige que
 * eles rodem sempre, na mesma ordem.
 */
function Checklist({ perfilId, nome }: { perfilId: string; nome: string }) {
  // Recalcula só quando o perfil muda. É isso que faz a lista trocar
  // sozinha quando você edita o tipo do estabelecimento.
  const grupos = useMemo(() => checklistDoPerfil(perfilId), [perfilId]);

  const secoes = grupos.map((grupo) => ({
    title: grupo.titulo,
    codigo: grupo.codigoRdc,
    data: grupo.itens,
  }));

  const total = grupos.reduce((soma, grupo) => soma + grupo.itens.length, 0);

  return (
    <SectionList
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      sections={secoes}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={estilos.cabecalho}>
          <Text style={estilos.titulo}>{nome}</Text>
          <Text style={estilos.subtitulo}>
            {total} exigências da RDC 216 se aplicam ao seu tipo de estabelecimento, organizadas
            em {grupos.length} categorias.
          </Text>
          <View style={estilos.aviso3}>
            <Text style={estilos.avisoTexto}>
              Nesta fase o checklist é só leitura. Responder cada item é a próxima etapa.
            </Text>
          </View>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={estilos.cabecalhoSecao}>
          <Text style={estilos.codigoSecao}>{section.codigo}</Text>
          <Text style={estilos.tituloSecao}>{section.title}</Text>
          <Text style={estilos.contagemSecao}>
            {section.data.length} {section.data.length === 1 ? 'item' : 'itens'}
          </Text>
        </View>
      )}
      renderItem={({ item }) => <LinhaItem item={item} />}
    />
  );
}

function LinhaItem({ item }: { item: ItemChecklist }) {
  return (
    <View style={estilos.item}>
      <View style={estilos.itemTopo}>
        <Text style={estilos.codigoItem}>{item.codigo_rdc}</Text>

        {/* `critico` vem do banco como 0 ou 1 (o SQLite não tem booleano). */}
        {item.critico === 1 ? (
          <View style={[estilos.selo, estilos.seloCritico]}>
            <Text style={estilos.seloCriticoTexto}>crítico</Text>
          </View>
        ) : null}

        <View
          style={[
            estilos.selo,
            item.frequencia === 'semestral' ? estilos.seloLegal : estilos.seloTrilha,
          ]}
        >
          <Text
            style={
              item.frequencia === 'semestral'
                ? estilos.seloLegalTexto
                : estilos.seloTrilhaTexto
            }
          >
            {ROTULO_TRILHA[item.frequencia]}
            {item.periodicidade_dias ? ` · ${item.periodicidade_dias}d` : ''}
          </Text>
        </View>
      </View>

      <Text style={estilos.textoItem}>{item.texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Cores.fundo },
  conteudo: { padding: 20, paddingBottom: 40 },
  centro: {
    flex: 1,
    backgroundColor: Cores.fundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aviso: { fontSize: 14, color: Cores.textoSuave },

  cabecalho: { marginBottom: 8 },
  titulo: { fontSize: 22, fontWeight: '700', color: Cores.texto },
  subtitulo: { fontSize: 14, lineHeight: 21, color: Cores.textoSecundario, marginTop: 6 },
  aviso3: {
    backgroundColor: Cores.primariaClara,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  avisoTexto: { fontSize: 12, lineHeight: 18, color: Cores.sobrePrimaria },

  cabecalhoSecao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 26,
    marginBottom: 10,
  },
  codigoSecao: {
    fontSize: 11,
    fontWeight: '700',
    color: Cores.sobrePrimaria,
    backgroundColor: Cores.primaria,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tituloSecao: { flex: 1, fontSize: 14, fontWeight: '700', color: Cores.texto },
  contagemSecao: { fontSize: 12, color: Cores.textoSuave },

  item: {
    backgroundColor: Cores.superficie,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Cores.borda,
  },
  itemTopo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  codigoItem: { flex: 1, fontSize: 12, fontWeight: '700', color: Cores.primariaTexto },
  textoItem: { fontSize: 14, lineHeight: 21, color: Cores.textoSecundario },

  selo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  seloTrilha: { backgroundColor: Cores.fundo },
  seloTrilhaTexto: { fontSize: 11, fontWeight: '600', color: Cores.textoSecundario },
  // Semestral = prazo fixado pela norma, por isso ganha a cor da marca.
  seloLegal: { backgroundColor: Cores.primariaClara },
  seloLegalTexto: { fontSize: 11, fontWeight: '700', color: Cores.sobrePrimaria },
  // A paleta não tem vermelho: o magenta faz o papel de alerta.
  seloCritico: { backgroundColor: Cores.acentoSuave },
  seloCriticoTexto: { fontSize: 11, fontWeight: '700', color: Cores.acentoForte },
});
