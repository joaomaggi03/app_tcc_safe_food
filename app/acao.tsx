/**
 * app/acao.tsx
 * ---------------------------------------------------------------
 * Formulário de UMA AÇÃO CORRETIVA (RF07) — rota
 * "/acao?item=4.8.8-a&inspecao=12".
 *
 * Criar e editar são a mesma tela: se o item já tem uma ação aberta, ela
 * vem preenchida e o salvar a atualiza (`salvarAcao` decide). Dois
 * campos só, de propósito — o que vai ser feito e até quando. O público
 * é o dono de lanchonete no meio do expediente, não um gestor de
 * projetos.
 *
 * A AÇÃO GERADA DIZ O QUE ATINGIR, NÃO COMO. O app cria a ação ao
 * concluir a inspeção com o texto da exigência (`descricaoGerada`); aqui
 * o usuário acrescenta como vai resolver. O app não sugere "troque a
 * borracha da geladeira": seria inventar conteúdo que a norma não tem —
 * ela diz o que é exigido, não como consertar cada caso.
 *
 * Parâmetros:
 *  - `item`: obrigatório, o id do item da norma;
 *  - `inspecao`: opcional, de onde a ação saiu (fica gravado como origem);
 *  - `origem`: 'resultado' ou 'plano' — para onde voltar ao salvar.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ATALHOS_PRAZO, descricaoGerada, prazoDoAtalho, prazoPadraoEmDias } from '../db/acao';
import {
  diaLocalISO,
  excluirAcao,
  obterAcaoAberta,
  obterItemDaAcao,
  salvarAcao,
  type AcaoCorretiva,
  type Estabelecimento,
  type ItemDaAcao,
} from '../db/consultas';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import { formatarData, rotuloAtalhoPrazo } from '../theme/rotulos';

type Parametros = { item?: string; inspecao?: string; origem?: string };

export default function TelaAcao() {
  const parametros = useLocalSearchParams<Parametros>();
  const estabelecimento = useEstabelecimento((estado) => estado.atual);

  /**
   * Um número que muda a cada vez que a tela ganha foco.
   *
   * As rotas escondidas das abas continuam MONTADAS depois que se sai
   * delas. Sem isto, abrir a ação de outro item traria o texto digitado
   * no anterior. Usado como `key`, ele faz o formulário nascer de novo a
   * cada visita, lendo o banco do zero.
   */
  const [visita, setVisita] = useState(0);
  useFocusEffect(useCallback(() => setVisita((v) => v + 1), []));

  if (!estabelecimento) return <Redirect href="/cadastro" />;
  if (!parametros.item) return <Redirect href="/plano-acao" />;

  const inspecaoId = parametros.inspecao ? Number(parametros.inspecao) : null;

  return (
    <Formulario
      key={`${parametros.item}:${visita}`}
      estabelecimento={estabelecimento}
      itemId={parametros.item}
      inspecaoId={Number.isFinite(inspecaoId) ? inspecaoId : null}
      origem={parametros.origem === 'resultado' ? 'resultado' : 'plano'}
    />
  );
}

function Formulario({
  estabelecimento,
  itemId,
  inspecaoId,
  origem,
}: {
  estabelecimento: Estabelecimento;
  itemId: string;
  inspecaoId: number | null;
  origem: 'resultado' | 'plano';
}) {
  const router = useRouter();

  // Lidos UMA vez, na montagem: o formulário é recriado a cada visita.
  const [item] = useState<ItemDaAcao | null>(() => obterItemDaAcao(itemId));
  const [existente] = useState<AcaoCorretiva | null>(() =>
    obterAcaoAberta(estabelecimento.id, itemId),
  );

  const hoje = diaLocalISO();
  // Sem ação aberta (inspeção antiga, ou a gerada foi excluída), o campo
  // nasce com o mesmo texto que o app geraria ao concluir a inspeção.
  const [descricao, setDescricao] = useState(
    () => existente?.descricao ?? (item ? descricaoGerada(item) : ''),
  );
  const [prazo, setPrazo] = useState(
    () =>
      existente?.prazo ??
      prazoDoAtalho(
        hoje,
        prazoPadraoEmDias(item?.critico === 1),
        estabelecimento.dias_funcionamento,
      ),
  );
  const [verNorma, setVerNorma] = useState(false);

  if (!item) return <Redirect href="/plano-acao" />;

  const podeSalvar = descricao.trim().length > 0;

  /** Para onde ir depois de salvar ou excluir: de volta para onde se veio. */
  function voltar() {
    if (origem === 'resultado' && inspecaoId !== null) {
      router.replace(`/resultado?id=${inspecaoId}`);
    } else {
      router.replace('/plano-acao');
    }
  }

  function salvar() {
    if (!podeSalvar) return;
    salvarAcao({
      estabelecimentoId: estabelecimento.id,
      itemId,
      inspecaoId: existente?.inspecao_id ?? inspecaoId,
      descricao,
      prazo,
    });
    voltar();
  }

  function confirmarExclusao() {
    if (!existente) return;
    Alert.alert(
      'Excluir esta ação?',
      'Use para uma ação criada por engano. Se o problema foi resolvido, conclua a ação no plano em vez de excluir.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            excluirAcao(existente.id);
            voltar();
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={estilos.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        {/* --- O item da norma, como referência --- */}
        <View style={estilos.cartao}>
          <View style={estilos.linhaSelos}>
            <Text style={estilos.codigo}>
              {item.codigo_rdc} · {item.categoria_nome}
            </Text>
            {item.critico === 1 ? (
              <View style={estilos.seloCritico}>
                <Text style={estilos.seloCriticoTexto}>Crítico</Text>
              </View>
            ) : null}
          </View>

          {item.topicos.length > 0 ? (
            item.topicos.map((topico) => (
              <View key={topico} style={estilos.topico}>
                <Text style={estilos.marcador}>•</Text>
                <Text style={estilos.topicoTexto}>{topico}</Text>
              </View>
            ))
          ) : (
            <Text style={estilos.topicoTexto}>{item.texto}</Text>
          )}

          {item.topicos.length > 0 ? (
            <Pressable
              onPress={() => setVerNorma((v) => !v)}
              style={estilos.verNorma}
              accessibilityRole="button"
            >
              <Text style={estilos.verNormaTexto}>
                {verNorma ? 'Esconder o texto da norma' : 'Ver texto da norma'}
              </Text>
              <Ionicons
                name={verNorma ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={Cores.primariaTexto}
              />
            </Pressable>
          ) : null}
          {verNorma ? <Text style={estilos.textoNorma}>{item.texto}</Text> : null}
        </View>

        {/* --- O que vai ser feito --- */}
        <Text style={estilos.rotuloCampo}>O que vai ser feito</Text>
        <TextInput
          style={[estilos.campo, estilos.campoLongo]}
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Ex.: chamar o técnico para trocar a borracha da porta da geladeira"
          placeholderTextColor={Cores.textoSuave}
          multiline
          textAlignVertical="top"
        />

        {/* --- Até quando --- */}
        <Text style={estilos.rotuloCampo}>Até quando</Text>
        <View style={estilos.atalhos}>
          {ATALHOS_PRAZO.map((dias) => {
            const dia = prazoDoAtalho(hoje, dias, estabelecimento.dias_funcionamento);
            const ativo = dia === prazo;
            return (
              <Pressable
                key={dias}
                onPress={() => setPrazo(dia)}
                style={[estilos.atalho, ativo && estilos.atalhoAtivo]}
                accessibilityRole="radio"
                accessibilityState={{ selected: ativo }}
              >
                <Text style={[estilos.atalhoTexto, ativo && estilos.atalhoTextoAtivo]}>
                  {rotuloAtalhoPrazo(dias)}
                </Text>
                <Text style={[estilos.atalhoData, ativo && estilos.atalhoTextoAtivo]}>
                  {formatarData(dia).slice(0, 5)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={estilos.ajuda}>
          Prazo: {formatarData(prazo)}.
          {item.critico === 1 && !existente
            ? ' Item crítico: a sugestão é corrigir hoje, porque é risco direto à saúde.'
            : ''}
        </Text>

        <Pressable
          style={({ pressed }) => [
            estilos.botao,
            !podeSalvar && estilos.botaoDesativado,
            pressed && podeSalvar && estilos.pressionado,
          ]}
          onPress={salvar}
          disabled={!podeSalvar}
          accessibilityRole="button"
        >
          <Text style={[estilos.botaoTexto, !podeSalvar && estilos.botaoTextoDesativado]}>
            {existente ? 'Salvar alterações' : 'Criar ação'}
          </Text>
        </Pressable>
        {!podeSalvar ? (
          <Text style={estilos.ajudaCentro}>Descreva o que vai ser feito para salvar.</Text>
        ) : null}

        {existente ? (
          <Pressable
            onPress={confirmarExclusao}
            style={estilos.botaoExcluir}
            accessibilityRole="button"
          >
            <Text style={estilos.botaoExcluirTexto}>Excluir ação</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Cores.fundo },
  conteudo: { padding: 20, paddingBottom: 48 },

  cartao: { backgroundColor: Cores.superficie, borderRadius: 14, padding: 18 },
  linhaSelos: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  codigo: { flex: 1, fontSize: 12, fontWeight: '700', color: Cores.textoSecundario },
  seloCritico: {
    backgroundColor: Cores.acentoSuave,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  seloCriticoTexto: { fontSize: 11, fontWeight: '700', color: Cores.acentoForte },
  topico: { flexDirection: 'row', gap: 8, marginTop: 4 },
  marcador: { fontSize: 15, lineHeight: 22, color: Cores.textoSuave },
  topicoTexto: { flex: 1, fontSize: 15, lineHeight: 22, color: Cores.texto },
  verNorma: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  verNormaTexto: { fontSize: 13, fontWeight: '700', color: Cores.primariaTexto },
  textoNorma: { fontSize: 13, lineHeight: 20, color: Cores.textoSecundario, marginTop: 8 },

  rotuloCampo: {
    fontSize: 13,
    fontWeight: '700',
    color: Cores.texto,
    marginTop: 24,
    marginBottom: 8,
  },
  campo: {
    backgroundColor: Cores.superficie,
    borderWidth: 1,
    borderColor: Cores.borda,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Cores.texto,
  },
  campoLongo: { minHeight: 96 },

  atalhos: { flexDirection: 'row', gap: 8 },
  atalho: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Cores.borda,
    backgroundColor: Cores.superficie,
  },
  atalhoAtivo: { backgroundColor: Cores.primariaClara, borderColor: Cores.primaria },
  atalhoTexto: { fontSize: 14, fontWeight: '700', color: Cores.texto },
  atalhoData: { fontSize: 12, color: Cores.textoSuave, marginTop: 2 },
  atalhoTextoAtivo: { color: Cores.sobrePrimariaClara },

  ajuda: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 8 },
  ajudaCentro: { fontSize: 12, color: Cores.textoSuave, textAlign: 'center', marginTop: 8 },

  botao: {
    backgroundColor: Cores.primaria,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  botaoDesativado: { backgroundColor: Cores.borda },
  pressionado: { opacity: 0.8 },
  botaoTexto: { fontSize: 16, fontWeight: '700', color: Cores.sobrePrimaria },
  botaoTextoDesativado: { color: Cores.textoSuave },

  botaoExcluir: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  botaoExcluirTexto: { fontSize: 14, fontWeight: '700', color: Cores.acentoTexto },
});
