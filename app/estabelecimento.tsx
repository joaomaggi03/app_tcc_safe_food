/**
 * app/estabelecimento.tsx
 * ---------------------------------------------------------------
 * Aba ESTABELECIMENTO — rota "/estabelecimento".
 *
 * Responde "como o app está configurado?". Junta quatro coisas que
 * antes estavam espalhadas e não tinham lugar:
 *
 *  - a identificação e o botão de editar (eram o topo do Início);
 *  - o resumo do checklist que o perfil gera (era um cartão do Início);
 *  - a periodicidade da auditoria (só existia dentro do cadastro, atrás
 *    de um botão pequeno no canto);
 *  - os itens ocultos do RF09 (ficavam no rodapé de Nova Inspeção, uma
 *    tela de AÇÃO — não é onde se procura uma configuração).
 *
 * Nada aqui é do dia a dia: é a tela que se abre uma vez por mês, ou
 * quando algo precisa ser corrigido.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  contarCatalogo,
  listarItensOcultos,
  listarPerfis,
  reexibirItem,
  resumoDoPerfil,
  type Estabelecimento,
  type ItemOculto,
  type ResumoPerfil,
} from '../db/consultas';
import { alertasDisponiveis, testarAlerta } from '../db/notificacoes';
import {
  definirIntervaloPeriodico,
  obterEstabelecimentoAtualizado,
  trilhaMaisUrgente,
  statusDasTrilhas,
} from '../db/periodicidade';
import { totalDiasAbertos } from '../db/funcionamento';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import { formatarData, ROTULO_TRILHA, textoDiasAbertos } from '../theme/rotulos';

/** De quanto em quanto o botão mexe no intervalo da auditoria. */
const PASSO_DIAS = 5;

export default function TelaEstabelecimento() {
  const estabelecimento = useEstabelecimento((estado) => estado.atual);
  const carregado = useEstabelecimento((estado) => estado.carregado);

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

  return <Painel estabelecimento={estabelecimento} />;
}

function Painel({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  const router = useRouter();
  const definir = useEstabelecimento((estado) => estado.definir);

  const [resumo, setResumo] = useState<ResumoPerfil | null>(null);
  const [ocultos, setOcultos] = useState<ItemOculto[]>([]);

  const recarregar = useCallback(() => {
    setResumo(resumoDoPerfil(estabelecimento.perfil_id, estabelecimento.id));
    setOcultos(listarItensOcultos(estabelecimento.id));
  }, [estabelecimento]);

  useFocusEffect(recarregar);

  const catalogo = useMemo(() => contarCatalogo(), []);
  const nomePerfil = useMemo(
    () => listarPerfis().find((p) => p.id === estabelecimento.perfil_id)?.nome ?? '—',
    [estabelecimento.perfil_id],
  );

  /**
   * Muda o intervalo da auditoria e relê o estabelecimento do banco.
   *
   * A releitura não é zelo: `definirIntervaloPeriodico` limita o valor
   * entre 1 e 365, então o que ficou gravado pode não ser o que o botão
   * pediu. E atualizar o store é o que faz o vencimento se recalcular em
   * todas as telas — e os alertas serem reagendados no layout raiz.
   */
  function ajustarPeriodicidade(delta: number) {
    definirIntervaloPeriodico(
      estabelecimento.id,
      estabelecimento.periodicidade_auditoria_dias + delta,
    );
    definir(obterEstabelecimentoAtualizado(estabelecimento.id));
  }

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      {/* --- Identificação --- */}
      <View style={estilos.cartaoPrincipal}>
        <View style={estilos.linhaTopo}>
          <View style={estilos.flex}>
            <Text style={estilos.tipo}>{nomePerfil}</Text>
            <Text style={estilos.nome}>{estabelecimento.nome}</Text>
          </View>

          <Pressable
            onPress={() => router.push('/cadastro')}
            style={({ pressed }) => [estilos.botaoEditar, pressed && estilos.pressionado]}
            accessibilityRole="button"
            accessibilityLabel="Editar estabelecimento"
          >
            <Ionicons name="create-outline" size={18} color={Cores.sobrePrimaria} />
            <Text style={estilos.botaoEditarTexto}>Editar</Text>
          </Pressable>
        </View>

        <View style={estilos.detalhes}>
          {estabelecimento.cidade ? (
            <Detalhe icone="location-outline" texto={estabelecimento.cidade} />
          ) : null}
          {estabelecimento.responsavel ? (
            <Detalhe icone="person-outline" texto={estabelecimento.responsavel} />
          ) : null}
          {/* Sempre visível: os dias de funcionamento mudam o que o app
              cobra e como a sequência conta, então não podem ficar só
              dentro do formulário de edição. */}
          <Detalhe
            icone="calendar-outline"
            texto={textoDiasAbertos(totalDiasAbertos(estabelecimento.dias_funcionamento))}
          />
        </View>

        <Text style={estilos.dataCadastro}>
          Cadastrado em {formatarData(estabelecimento.data_cadastro)}
        </Text>
      </View>

      {/* --- O checklist que o perfil gera (RF03) --- */}
      {resumo ? (
        <View style={estilos.cartao}>
          <Text style={estilos.tituloCartao}>Seu checklist</Text>
          <Text style={estilos.notaCartao}>
            {resumo.total} exigências da RDC 216 se aplicam a este perfil, em{' '}
            {resumo.categorias} categorias.
          </Text>
          <View style={estilos.divisor} />

          <Linha rotulo="Itens do dia a dia" valor={resumo.diario} />
          <Linha rotulo="Itens da auditoria periódica" valor={resumo.periodico} />
          <Linha rotulo="Itens de prazo legal (água)" valor={resumo.semestral} />
        </View>
      ) : null}

      {/* --- Periodicidade e alertas (RF05) --- */}
      <Periodicidade
        estabelecimento={estabelecimento}
        aoAjustar={ajustarPeriodicidade}
      />

      {/* --- Itens ocultos (RF09) --- */}
      <ItensOcultos
        ocultos={ocultos}
        aoReexibir={(item) => {
          Alert.alert(
            'Voltar a exibir?',
            `O item ${item.codigo_rdc} volta a aparecer no checklist deste estabelecimento.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Voltar a exibir',
                onPress: () => {
                  reexibirItem(estabelecimento.id, item.item_id);
                  recarregar();
                },
              },
            ],
          );
        }}
      />

      <Text style={estilos.rodape}>
        Base offline: {catalogo.itens} itens da RDC 216 em {catalogo.categorias} categorias.
      </Text>
    </ScrollView>
  );
}

/**
 * O intervalo da auditoria, e o botão de testar alerta.
 *
 * Os dois juntos porque respondem à mesma pergunta: de quanto em quanto
 * tempo o app vai me cobrar, e ele consegue mesmo me avisar?
 *
 * A periódica é a ÚNICA frequência editável. A diária é 1 por definição
 * e a semestral é prazo legal da norma (180 dias) — por isso aparecem
 * como texto, não como controle: mostrar um botão que não muda nada
 * seria pior do que não mostrar.
 */
function Periodicidade({
  estabelecimento,
  aoAjustar,
}: {
  estabelecimento: Estabelecimento;
  aoAjustar: (delta: number) => void;
}) {
  const dias = estabelecimento.periodicidade_auditoria_dias;

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.tituloCartao}>Periodicidade e alertas</Text>
      <Text style={estilos.notaCartao}>
        Só a água tem prazo fixado pela norma: 180 dias. O resto é decisão sua.
      </Text>
      <View style={estilos.divisor} />

      <View style={estilos.linhaPasso}>
        <Text style={estilos.rotulo}>Auditoria periódica</Text>

        <View style={estilos.passo}>
          <Pressable
            style={({ pressed }) => [estilos.botaoPasso, pressed && estilos.pressionado]}
            onPress={() => aoAjustar(-PASSO_DIAS)}
            disabled={dias <= 1}
            accessibilityRole="button"
            accessibilityLabel="Diminuir o intervalo da auditoria"
          >
            <Ionicons
              name="remove"
              size={18}
              color={dias <= 1 ? Cores.borda : Cores.textoSecundario}
            />
          </Pressable>

          <Text style={estilos.passoValor}>{dias} dias</Text>

          <Pressable
            style={({ pressed }) => [estilos.botaoPasso, pressed && estilos.pressionado]}
            onPress={() => aoAjustar(PASSO_DIAS)}
            disabled={dias >= 365}
            accessibilityRole="button"
            accessibilityLabel="Aumentar o intervalo da auditoria"
          >
            <Ionicons
              name="add"
              size={18}
              color={dias >= 365 ? Cores.borda : Cores.textoSecundario}
            />
          </Pressable>
        </View>
      </View>

      <BotaoTestarAlerta estabelecimento={estabelecimento} />
    </View>
  );
}

/**
 * Dispara a notificação real em 5 segundos.
 *
 * Os alertas chegam na véspera do vencimento — útil na prática,
 * impossível de VER numa demonstração ou numa banca. Este botão manda o
 * aviso da trilha mais urgente com o mesmo texto que ele teria no dia.
 *
 * Saiu da tela principal no redesenho: é andaime de demonstração, e
 * andaime não fica no caminho de quem usa o app todo dia.
 */
function BotaoTestarAlerta({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  if (!alertasDisponiveis()) {
    return (
      <View style={estilos.semAlertas}>
        <Ionicons name="notifications-off-outline" size={15} color={Cores.textoSuave} />
        <Text style={estilos.semAlertasTexto}>
          Os avisos de vencimento não funcionam no Expo Go. Os prazos continuam corretos; para
          receber as notificações, é preciso um development build do app.
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [estilos.testar, pressed && estilos.pressionado]}
      onPress={async () => {
        // A trilha mais urgente é a que o alerta real citaria; se está
        // tudo em dia, a diária serve de exemplo.
        const alvo =
          trilhaMaisUrgente(estabelecimento) ?? statusDasTrilhas(estabelecimento)[0];
        const enviado = await testarAlerta(estabelecimento, alvo.trilha);

        Alert.alert(
          enviado ? 'Alerta a caminho' : 'Sem permissão',
          enviado
            ? `O aviso da trilha ${ROTULO_TRILHA[alvo.trilha].toLowerCase()} chega em 5 segundos. Você pode sair do app para vê-lo na barra de notificações.`
            : 'O aparelho não autorizou notificações para este app. O resto do app continua funcionando normalmente — só os avisos de vencimento ficam desligados.',
        );
      }}
      accessibilityRole="button"
    >
      <Ionicons name="notifications-outline" size={15} color={Cores.primariaTexto} />
      <Text style={estilos.testarTexto}>Testar alerta agora</Text>
    </Pressable>
  );
}

/**
 * Os itens que o RF09 escondeu, com a volta.
 *
 * Sem esta lista o "não se aplica" seria uma porta só de ida: um toque
 * errado esconderia uma exigência da norma para sempre.
 */
function ItensOcultos({
  ocultos,
  aoReexibir,
}: {
  ocultos: ItemOculto[];
  aoReexibir: (item: ItemOculto) => void;
}) {
  // Começa fechada: é informação de revisão, não do dia a dia.
  const [aberta, setAberta] = useState(false);

  if (ocultos.length === 0) return null;

  return (
    <View style={estilos.ocultos}>
      <Pressable
        style={estilos.ocultosCabecalho}
        onPress={() => setAberta((valor) => !valor)}
        accessibilityRole="button"
      >
        <Ionicons name="eye-off-outline" size={16} color={Cores.textoSecundario} />
        <Text style={estilos.ocultosTitulo}>
          {ocultos.length} {ocultos.length === 1 ? 'item marcado' : 'itens marcados'} como “não
          se aplica”
        </Text>
        <Ionicons
          name={aberta ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Cores.textoSuave}
        />
      </Pressable>

      {aberta
        ? ocultos.map((item) => (
            <View key={item.item_id} style={estilos.ocultoItem}>
              <Text style={estilos.ocultoCodigo}>
                {item.codigo_rdc} · {item.categoria_nome}
              </Text>
              <Text style={estilos.ocultoTexto}>{item.texto}</Text>

              <Pressable
                style={({ pressed }) => [estilos.ocultoBotao, pressed && estilos.pressionado]}
                onPress={() => aoReexibir(item)}
                accessibilityRole="button"
              >
                <Ionicons name="eye-outline" size={16} color={Cores.primariaTexto} />
                <Text style={estilos.ocultoBotaoTexto}>Voltar a exibir</Text>
              </Pressable>
            </View>
          ))
        : null}
    </View>
  );
}

function Detalhe({
  icone,
  texto,
}: {
  icone: 'location-outline' | 'person-outline' | 'calendar-outline';
  texto: string;
}) {
  return (
    <View style={estilos.detalhe}>
      <Ionicons name={icone} size={14} color={Cores.textoSecundario} />
      <Text style={estilos.detalheTexto}>{texto}</Text>
    </View>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={estilos.valor}>{valor}</Text>
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
  flex: { flex: 1 },
  pressionado: { opacity: 0.8 },

  cartaoPrincipal: {
    backgroundColor: Cores.superficie,
    borderRadius: 14,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: Cores.primaria,
  },
  linhaTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tipo: {
    fontSize: 11,
    fontWeight: '700',
    color: Cores.primariaTexto,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nome: { fontSize: 22, fontWeight: '700', color: Cores.texto, marginTop: 4 },
  botaoEditar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Cores.primaria,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  botaoEditarTexto: { fontSize: 13, fontWeight: '700', color: Cores.sobrePrimaria },
  detalhes: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  detalhe: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detalheTexto: { fontSize: 13, color: Cores.textoSecundario },
  dataCadastro: { fontSize: 12, color: Cores.textoSuave, marginTop: 12 },

  cartao: {
    backgroundColor: Cores.superficie,
    borderRadius: 14,
    padding: 18,
    marginTop: 16,
  },
  tituloCartao: { fontSize: 16, fontWeight: '700', color: Cores.texto },
  notaCartao: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 4 },
  divisor: { height: 1, backgroundColor: Cores.divisor, marginVertical: 12 },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  rotulo: { fontSize: 14, color: Cores.textoSecundario, flex: 1, paddingRight: 12 },
  valor: { fontSize: 15, fontWeight: '700', color: Cores.primariaTexto },

  linhaPasso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  passo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  botaoPasso: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Cores.borda,
    backgroundColor: Cores.fundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passoValor: {
    minWidth: 58,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: Cores.texto,
  },

  testar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Cores.borda,
  },
  testarTexto: { fontSize: 13, fontWeight: '600', color: Cores.primariaTexto },
  semAlertas: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Cores.fundo,
  },
  semAlertasTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: Cores.textoSecundario },

  ocultos: {
    marginTop: 16,
    backgroundColor: Cores.superficie,
    borderRadius: 14,
    overflow: 'hidden',
  },
  ocultosCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  ocultosTitulo: { flex: 1, fontSize: 13, fontWeight: '600', color: Cores.textoSecundario },
  ocultoItem: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Cores.divisor,
    paddingTop: 12,
  },
  ocultoCodigo: { fontSize: 12, fontWeight: '700', color: Cores.primariaTexto },
  ocultoTexto: { fontSize: 13, lineHeight: 19, color: Cores.textoSecundario, marginTop: 4 },
  ocultoBotao: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  ocultoBotaoTexto: { fontSize: 13, fontWeight: '600', color: Cores.primariaTexto },

  rodape: { fontSize: 11, color: Cores.textoSuave, textAlign: 'center', marginTop: 20 },
});
