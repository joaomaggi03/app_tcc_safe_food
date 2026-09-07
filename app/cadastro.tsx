/**
 * app/cadastro.tsx
 * ---------------------------------------------------------------
 * Tela de CADASTRO DO ESTABELECIMENTO (RF02) — rota "/cadastro".
 *
 * Serve para dois momentos, com a mesma interface:
 *  - primeiro acesso: não existe estabelecimento, então as outras telas
 *    redirecionam para cá;
 *  - edição: o botão "Editar" do Início abre esta tela já preenchida.
 *
 * A escolha do tipo é o que aciona o filtro inteligente (RF03): cada
 * opção mostra quantos itens da RDC 216 se aplicam a ela.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  contarItensPorPerfil,
  listarPerfis,
  salvarEstabelecimento,
} from '../db/consultas';
import {
  definirIntervaloPeriodico,
  INTERVALO_SEMESTRAL,
  obterEstabelecimentoAtualizado,
} from '../db/periodicidade';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';

export default function TelaCadastro() {
  const router = useRouter();
  const estabelecimento = useEstabelecimento((estado) => estado.atual);
  const definir = useEstabelecimento((estado) => estado.definir);

  const editando = estabelecimento !== null;

  // `useMemo` guarda o resultado da consulta: sem ele, o banco seria
  // relido a cada letra digitada no formulário (toda tecla redesenha
  // a tela). A lista de perfis não muda, então basta ler uma vez.
  const perfis = useMemo(() => listarPerfis(), []);
  const totaisPorPerfil = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const linha of contarItensPorPerfil()) {
      mapa[linha.perfil_id] = linha.total;
    }
    return mapa;
  }, []);

  // Estado do formulário. Se estiver editando, começa com os valores
  // que já estão no banco.
  const [nome, setNome] = useState(estabelecimento?.nome ?? '');
  const [perfilId, setPerfilId] = useState(estabelecimento?.perfil_id ?? '');
  const [cidade, setCidade] = useState(estabelecimento?.cidade ?? '');
  const [responsavel, setResponsavel] = useState(estabelecimento?.responsavel ?? '');
  // Periodicidade da AUDITORIA (RF05). Fica como texto enquanto o
  // usuário digita, porque um campo numérico controlado por número não
  // deixa apagar o último dígito para trocar de valor.
  const [periodicidade, setPeriodicidade] = useState(
    String(estabelecimento?.periodicidade_auditoria_dias ?? 30),
  );
  const [erro, setErro] = useState<string | null>(null);

  const podeSalvar = nome.trim().length > 0 && perfilId !== '';

  function aoSalvar() {
    try {
      const salvo = salvarEstabelecimento({ nome, perfilId, cidade, responsavel });

      // O intervalo é gravado à parte porque `salvarEstabelecimento`
      // preserva de propósito o valor existente na edição — ele foi
      // copiado do perfil na criação e não pode ser sobrescrito de volta
      // ao padrão só porque o usuário salvou o cadastro de novo.
      const dias = Number(periodicidade);
      if (Number.isFinite(dias) && dias > 0) {
        definirIntervaloPeriodico(salvo.id, dias);
      }

      // Grava no banco primeiro, atualiza o store depois: assim o estado
      // em memória nunca fica adiantado em relação ao disco. Relê para
      // o store receber a periodicidade já com o limite aplicado.
      definir(obterEstabelecimentoAtualizado(salvo.id));
      router.replace('/');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.tela}
      // No iOS o teclado cobre os campos; este ajuste empurra o conteúdo.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.etiqueta}>{editando ? 'Editar' : 'Primeiro acesso'}</Text>
        <Text style={estilos.titulo}>Seu estabelecimento</Text>
        <Text style={estilos.subtitulo}>
          O tipo define quais exigências da RDC 216 vão aparecer no seu checklist. Itens que não
          se aplicam ao seu caso ficam de fora desde o começo.
        </Text>

        {/* --- Nome (obrigatório) --- */}
        <Text style={estilos.rotuloCampo}>Nome do estabelecimento</Text>
        <TextInput
          style={estilos.campo}
          value={nome}
          onChangeText={setNome}
          placeholder="Ex.: Lanchonete da Praça"
          placeholderTextColor={Cores.textoSuave}
          maxLength={80}
        />

        {/* --- Tipo (obrigatório) --- */}
        <Text style={estilos.rotuloCampo}>Tipo de estabelecimento</Text>
        <View style={estilos.listaPerfis}>
          {perfis.map((perfil) => {
            const selecionado = perfil.id === perfilId;
            return (
              <Pressable
                key={perfil.id}
                onPress={() => setPerfilId(perfil.id)}
                style={[estilos.perfil, selecionado && estilos.perfilSelecionado]}
                // Acessibilidade: leitores de tela anunciam como opção marcável.
                accessibilityRole="radio"
                accessibilityState={{ selected: selecionado }}
              >
                <View style={estilos.perfilTopo}>
                  <Ionicons
                    name={selecionado ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selecionado ? Cores.primariaTexto : Cores.textoSuave}
                  />
                  <Text style={estilos.perfilNome}>{perfil.nome}</Text>
                  <Text style={estilos.perfilTotal}>{totaisPorPerfil[perfil.id] ?? 0} itens</Text>
                </View>
                <Text style={estilos.perfilDescricao}>{perfil.descricao}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* --- Campos opcionais --- */}
        <Text style={estilos.rotuloCampo}>
          Cidade <Text style={estilos.opcional}>(opcional)</Text>
        </Text>
        <TextInput
          style={estilos.campo}
          value={cidade}
          onChangeText={setCidade}
          placeholder="Ex.: Curitiba"
          placeholderTextColor={Cores.textoSuave}
          maxLength={60}
        />

        {/* --- Periodicidade da auditoria (RF05) --- */}
        <Text style={estilos.rotuloCampo}>A cada quantos dias refazer a auditoria completa</Text>
        <TextInput
          style={estilos.campo}
          value={periodicidade}
          onChangeText={(texto) => setPeriodicidade(texto.replace(/[^0-9]/g, ''))}
          placeholder="30"
          placeholderTextColor={Cores.textoSuave}
          keyboardType="number-pad"
          maxLength={3}
        />
        <Text style={estilos.ajuda}>
          Este prazo é uma boa prática assumida pelo app, e não uma exigência da RDC 216 — por
          isso você pode ajustá-lo. A rotina diária é de 1 dia, e a verificação da água é de{' '}
          {INTERVALO_SEMESTRAL} dias, este sim prazo fixado pela norma.
        </Text>

        <Text style={estilos.rotuloCampo}>
          Responsável pela manipulação <Text style={estilos.opcional}>(opcional)</Text>
        </Text>
        <TextInput
          style={estilos.campo}
          value={responsavel}
          onChangeText={setResponsavel}
          placeholder="Nome de quem responde pelo local"
          placeholderTextColor={Cores.textoSuave}
          maxLength={80}
        />
        <Text style={estilos.ajuda}>
          A seção 4.12 da RDC exige um responsável capacitado pela manipulação dos alimentos.
        </Text>

        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

        <Pressable
          onPress={aoSalvar}
          disabled={!podeSalvar}
          style={({ pressed }) => [
            estilos.botao,
            !podeSalvar && estilos.botaoDesativado,
            pressed && estilos.botaoPressionado,
          ]}
        >
          <Text style={[estilos.botaoTexto, !podeSalvar && estilos.botaoTextoDesativado]}>
            {editando ? 'Salvar alterações' : 'Criar checklist'}
          </Text>
        </Pressable>

        {!podeSalvar ? (
          <Text style={estilos.ajudaCentro}>Preencha o nome e escolha um tipo para continuar.</Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Cores.fundo },
  conteudo: { padding: 20, paddingBottom: 48 },
  etiqueta: {
    alignSelf: 'flex-start',
    backgroundColor: Cores.primaria,
    color: Cores.sobrePrimaria,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  titulo: { fontSize: 24, fontWeight: '700', color: Cores.texto, marginTop: 10 },
  subtitulo: { fontSize: 14, lineHeight: 21, color: Cores.textoSecundario, marginTop: 8 },

  rotuloCampo: {
    fontSize: 13,
    fontWeight: '700',
    color: Cores.texto,
    marginTop: 24,
    marginBottom: 8,
  },
  opcional: { fontWeight: '400', color: Cores.textoSuave },
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
  ajuda: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 8 },
  ajudaCentro: {
    fontSize: 12,
    color: Cores.textoSuave,
    textAlign: 'center',
    marginTop: 10,
  },

  listaPerfis: { gap: 10 },
  perfil: {
    backgroundColor: Cores.superficie,
    borderWidth: 1,
    borderColor: Cores.borda,
    borderRadius: 12,
    padding: 14,
  },
  perfilSelecionado: {
    borderColor: Cores.primaria,
    borderWidth: 2,
    backgroundColor: Cores.primariaClara,
  },
  perfilTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perfilNome: { fontSize: 15, fontWeight: '700', color: Cores.texto, flex: 1 },
  perfilTotal: { fontSize: 12, fontWeight: '700', color: Cores.primariaTexto },
  perfilDescricao: {
    fontSize: 13,
    lineHeight: 19,
    color: Cores.textoSecundario,
    marginTop: 6,
    marginLeft: 28,
  },

  botao: {
    backgroundColor: Cores.primaria,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  // Opacidade em vez de cor mais escura: escurecer o fundo deixaria o
  // texto verde-escuro ilegível durante o toque.
  botaoPressionado: { opacity: 0.8 },
  botaoDesativado: { backgroundColor: Cores.borda },
  botaoTexto: { fontSize: 16, fontWeight: '700', color: Cores.sobrePrimaria },
  botaoTextoDesativado: { color: Cores.textoSuave },

  erro: { fontSize: 13, color: Cores.acentoTexto, marginTop: 16 },
});
