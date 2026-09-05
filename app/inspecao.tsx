/**
 * app/inspecao.tsx
 * ---------------------------------------------------------------
 * Tela de EXECUÇÃO DA INSPEÇÃO (RF06 + RF09) — rota "/inspecao".
 *
 * É aqui que o checklist deixa de ser leitura: cada item ganha os
 * quatro botões de resposta, e cada toque grava no SQLite na hora.
 *
 * A ROTA RECEBE A TRILHA POR PARÂMETRO: "/inspecao?trilha=diario".
 * Isso não é detalhe. A Fase 5 organiza o app em três trilhas de
 * periodicidade; se esta tela assumisse "a inspeção é sempre o checklist
 * inteiro", ela teria que ser reescrita lá. Recebendo a trilha de fora,
 * a mesma tela serve às três — muda só o parâmetro.
 *
 * Sobre parâmetros de rota no expo-router: `useLocalSearchParams()` lê o
 * que veio depois do "?" na URL. Como qualquer coisa pode chegar ali
 * (inclusive nada), validamos antes de usar.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import {
  checklistDoPerfil,
  concluirInspecao,
  iniciarInspecao,
  respostasDaInspecao,
  salvarResposta,
  TRILHAS,
  type Estabelecimento,
  type ItemChecklist,
  type Resposta,
  type Trilha,
} from '../db/consultas';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import {
  RESPOSTAS,
  ROTULO_RESPOSTA,
  ROTULO_TRILHA,
  ROTULO_TRILHA_CURTO,
} from '../theme/rotulos';

export default function TelaInspecao() {
  const estabelecimento = useEstabelecimento((estado) => estado.atual);
  const carregado = useEstabelecimento((estado) => estado.carregado);
  const parametros = useLocalSearchParams<{ trilha?: string }>();

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

  // O parâmetro é texto livre; só seguimos se for uma das três trilhas.
  const trilha = TRILHAS.find((t) => t === parametros.trilha);
  if (!trilha) {
    return <Redirect href="/nova-inspecao" />;
  }

  return (
    // A `key` faz o React tratar cada trilha como uma tela nova. Sem
    // ela, trocar de trilha reaproveitaria o componente — e com ele o
    // estado da inspeção anterior.
    <Execucao key={trilha} estabelecimento={estabelecimento} trilha={trilha} />
  );
}

function Execucao({
  estabelecimento,
  trilha,
}: {
  estabelecimento: Estabelecimento;
  trilha: Trilha;
}) {
  const router = useRouter();

  // Abre a inspeção (ou retoma a que estava em andamento) UMA vez, ao
  // montar a tela. Passar uma função para o `useState` é o jeito de
  // rodar algo só na primeira renderização: nas seguintes, ele devolve
  // o valor guardado sem executar de novo.
  const [inspecao] = useState(() => iniciarInspecao(estabelecimento.id, trilha));

  /**
   * Os itens são lidos UMA vez, de propósito.
   *
   * Se a lista fosse recalculada a cada resposta, o item que você acabou
   * de marcar como "não se aplica" sumiria da tela no mesmo instante —
   * confuso, e pior: sem chance de desfazer. O RF09 diz que ele some das
   * PRÓXIMAS inspeções. Então ele fica visível até o fim desta, e os já
   * ocultos de antes nem chegam a ser carregados.
   */
  const grupos = useMemo(
    () =>
      checklistDoPerfil(estabelecimento.perfil_id, {
        trilha,
        estabelecimentoId: estabelecimento.id,
      }),
    [estabelecimento.perfil_id, estabelecimento.id, trilha],
  );

  const itens = useMemo(() => grupos.flatMap((grupo) => grupo.itens), [grupos]);

  // Cópia em memória das respostas, para a tela reagir a cada toque.
  // A verdade continua sendo o banco: aqui começamos lendo dele, o que
  // é o que faz uma inspeção retomada aparecer já preenchida.
  const [respostas, setRespostas] = useState(() => respostasDaInspecao(inspecao.id));

  const respondidos = itens.filter((item) => respostas[item.id]).length;
  const faltam = itens.length - respondidos;

  function gravar(itemId: string, resposta: Resposta) {
    salvarResposta(inspecao.id, itemId, resposta);
    setRespostas((atual) => ({ ...atual, [itemId]: resposta }));
  }

  function responder(item: ItemChecklist, resposta: Resposta) {
    // "Não se aplica" tem efeito duradouro: some das próximas inspeções.
    // O usuário precisa saber disso ANTES, e não descobrir depois que o
    // checklist encolheu sozinho.
    const jaMarcado = respostas[item.id] === 'nao_se_aplica';

    if (resposta === 'nao_se_aplica' && !jaMarcado) {
      Alert.alert(
        'Marcar como "não se aplica"?',
        `O item ${item.codigo_rdc} deixará de aparecer nas próximas inspeções deste ` +
          'estabelecimento. Você pode voltar a exibi-lo em Nova Inspeção.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Marcar', onPress: () => gravar(item.id, resposta) },
        ],
      );
      return;
    }

    gravar(item.id, resposta);
  }

  function concluir() {
    concluirInspecao(inspecao.id);
    router.replace('/historico');
  }

  function aoConcluir() {
    if (faltam > 0) {
      Alert.alert(
        'Concluir assim mesmo?',
        faltam === 1
          ? 'Ainda falta 1 item sem resposta.'
          : `Ainda faltam ${faltam} itens sem resposta.`,
        [
          { text: 'Continuar preenchendo', style: 'cancel' },
          { text: 'Concluir', onPress: concluir },
        ],
      );
      return;
    }
    concluir();
  }

  const secoes = grupos.map((grupo) => ({
    title: grupo.titulo,
    codigo: grupo.codigoRdc,
    data: grupo.itens,
  }));

  return (
    <SectionList
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      sections={secoes}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      // `extraData` avisa a lista de que algo de fora dos itens mudou.
      // Sem isso, o SectionList não redesenharia as linhas ao responder.
      extraData={respostas}
      ListHeaderComponent={
        <Cabecalho
          nome={estabelecimento.nome}
          trilha={trilha}
          respondidos={respondidos}
          total={itens.length}
        />
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
      renderItem={({ item }) => (
        <LinhaItem
          item={item}
          resposta={respostas[item.id]}
          aoResponder={(escolha) => responder(item, escolha)}
        />
      )}
      ListEmptyComponent={
        <Text style={estilos.vazio}>
          Nenhum item nesta trilha para o seu tipo de estabelecimento.
        </Text>
      }
      ListFooterComponent={
        itens.length > 0 ? (
          <Pressable
            style={({ pressed }) => [estilos.botaoConcluir, pressed && estilos.botaoPressionado]}
            onPress={aoConcluir}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-done" size={18} color={Cores.sobrePrimaria} />
            <Text style={estilos.botaoConcluirTexto}>Concluir inspeção</Text>
          </Pressable>
        ) : null
      }
    />
  );
}

function Cabecalho({
  nome,
  trilha,
  respondidos,
  total,
}: {
  nome: string;
  trilha: Trilha;
  respondidos: number;
  total: number;
}) {
  const porcentagem = total === 0 ? 0 : Math.round((respondidos / total) * 100);

  return (
    <View style={estilos.cabecalho}>
      <Text style={estilos.etiqueta}>Inspeção {ROTULO_TRILHA[trilha].toLowerCase()}</Text>
      <Text style={estilos.titulo}>{nome}</Text>

      {/* Barra de progresso: é só uma View colorida ocupando uma fração
          da largura da outra. Isso NÃO é o score de conformidade — mede
          quanto do checklist foi respondido, não quanto está adequado.
          O score é a Fase 4. */}
      <View style={estilos.barra}>
        <View style={[estilos.barraPreenchida, { width: `${porcentagem}%` }]} />
      </View>
      <Text style={estilos.progressoTexto}>
        {respondidos} de {total} respondidos
      </Text>

      <View style={estilos.dica}>
        <Ionicons name="save-outline" size={14} color={Cores.sobrePrimaria} />
        <Text style={estilos.dicaTexto}>
          Cada resposta é salva na hora, no aparelho. Pode fechar o app e voltar depois.
        </Text>
      </View>
    </View>
  );
}

function LinhaItem({
  item,
  resposta,
  aoResponder,
}: {
  item: ItemChecklist;
  resposta: Resposta | undefined;
  aoResponder: (resposta: Resposta) => void;
}) {
  return (
    <View style={[estilos.item, resposta ? estilos.itemRespondido : null]}>
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
              item.frequencia === 'semestral' ? estilos.seloLegalTexto : estilos.seloTrilhaTexto
            }
          >
            {ROTULO_TRILHA_CURTO[item.frequencia]}
            {item.periodicidade_dias ? ` · ${item.periodicidade_dias}d` : ''}
          </Text>
        </View>
      </View>

      <Text style={estilos.textoItem}>{item.texto}</Text>

      {/* Os quatro botões do RF06. Ficam em duas linhas de dois porque
          quatro lado a lado espremem o texto em tela de celular. */}
      <View style={estilos.botoes}>
        {RESPOSTAS.map((opcao) => {
          const escolhida = resposta === opcao;
          return (
            <Pressable
              key={opcao}
              onPress={() => aoResponder(opcao)}
              style={[estilos.botao, escolhida && estiloEscolhido[opcao]]}
              accessibilityRole="radio"
              accessibilityState={{ selected: escolhida }}
              accessibilityLabel={ROTULO_RESPOSTA[opcao]}
            >
              <Text style={[estilos.botaoTexto, escolhida && estiloTextoEscolhido[opcao]]}>
                {ROTULO_RESPOSTA[opcao]}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  vazio: { fontSize: 14, color: Cores.textoSecundario, marginTop: 20 },

  cabecalho: { marginBottom: 8 },
  etiqueta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Cores.primariaTexto,
  },
  titulo: { fontSize: 22, fontWeight: '700', color: Cores.texto, marginTop: 4 },

  barra: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Cores.borda,
    marginTop: 14,
    overflow: 'hidden',
  },
  barraPreenchida: { height: 8, backgroundColor: Cores.primaria },
  progressoTexto: { fontSize: 12, color: Cores.textoSecundario, marginTop: 6 },

  dica: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Cores.primariaClara,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  dicaTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: Cores.sobrePrimaria },

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
  // Uma borda verde discreta marca o que já foi respondido, para dar
  // noção de avanço ao rolar a lista.
  itemRespondido: { borderColor: Cores.primaria },
  itemTopo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  codigoItem: { flex: 1, fontSize: 12, fontWeight: '700', color: Cores.primariaTexto },
  textoItem: { fontSize: 14, lineHeight: 21, color: Cores.textoSecundario },

  selo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  seloTrilha: { backgroundColor: Cores.fundo },
  seloTrilhaTexto: { fontSize: 11, fontWeight: '600', color: Cores.textoSecundario },
  seloLegal: { backgroundColor: Cores.primariaClara },
  seloLegalTexto: { fontSize: 11, fontWeight: '700', color: Cores.sobrePrimaria },
  seloCritico: { backgroundColor: Cores.acentoSuave },
  seloCriticoTexto: { fontSize: 11, fontWeight: '700', color: Cores.acentoForte },

  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  botao: {
    // ~metade da largura, descontando o espaço entre os dois botões.
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Cores.borda,
    backgroundColor: Cores.fundo,
  },
  botaoTexto: { fontSize: 13, fontWeight: '600', color: Cores.textoSecundario },

  botaoConcluir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Cores.primaria,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
  },
  botaoPressionado: { backgroundColor: Cores.primariaEscura },
  botaoConcluirTexto: { fontSize: 15, fontWeight: '700', color: Cores.sobrePrimaria },
});

/**
 * A cor de cada resposta quando ela está escolhida.
 *
 * Verde para adequado, magenta (o "vermelho" desta paleta) para
 * inadequado, e cinza para as duas respostas que não são julgamento de
 * conformidade — "não se aplica" e "não observado" apenas tiram o item
 * da conta, e não devem parecer erro.
 */
const estiloEscolhido = StyleSheet.create({
  adequado: { backgroundColor: Cores.primariaClara, borderColor: Cores.primaria },
  inadequado: { backgroundColor: Cores.acentoSuave, borderColor: Cores.acento },
  nao_se_aplica: { backgroundColor: Cores.borda, borderColor: Cores.textoSuave },
  nao_observado: { backgroundColor: Cores.borda, borderColor: Cores.textoSuave },
});

const estiloTextoEscolhido = StyleSheet.create({
  adequado: { color: Cores.sobrePrimaria, fontWeight: '700' },
  inadequado: { color: Cores.acentoForte, fontWeight: '700' },
  nao_se_aplica: { color: Cores.texto, fontWeight: '700' },
  nao_observado: { color: Cores.texto, fontWeight: '700' },
});
