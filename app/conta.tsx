/**
 * app/conta.tsx
 * ---------------------------------------------------------------
 * CONTA E BACKUP (RF01, Fase 6).
 *
 * O login é OPCIONAL: o app funciona inteiro sem conta, e esta tela é
 * só o lugar onde se liga o backup. Ela é aberta por dois caminhos:
 *
 *  - pela aba Estabelecimento, por quem já usa o app e quer guardar os
 *    dados na nuvem. O primeiro backup leva TUDO, inclusive o que foi
 *    feito antes do login;
 *  - pelo cadastro, no primeiro acesso de um celular novo: "já uso o
 *    app" → entra → o histórico é restaurado da nuvem.
 *
 * Três estados: backup desligado neste build (sem as chaves do
 * Supabase), deslogado (formulário) e logado (resumo do backup).
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  contaDoAparelho,
  fazerBackup,
  restaurarDaNuvem,
  ultimoBackup,
  type ResultadoBackup,
} from '../db/sincronizacao';
import { nuvemConfigurada } from '../db/supabase';
import { useConta } from '../store/conta';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';

export default function TelaConta() {
  const email = useConta((estado) => estado.email);
  const carregada = useConta((estado) => estado.carregada);

  if (!nuvemConfigurada()) return <NuvemDesligada />;

  if (!carregada) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={Cores.primaria} />
      </View>
    );
  }

  return email ? <Logado email={email} /> : <Entrar />;
}

// ---------------------------------------------------------------

function NuvemDesligada() {
  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>Backup desligado neste aparelho</Text>
        <Text style={estilos.texto}>
          Este build do app não tem as chaves do servidor de backup. Tudo o mais funciona
          normalmente: as inspeções ficam guardadas no próprio celular.
        </Text>
        <Text style={estilos.ajuda}>
          Para ligar: crie o arquivo .env.local com EXPO_PUBLIC_SUPABASE_URL e
          EXPO_PUBLIC_SUPABASE_ANON_KEY e reinicie o Metro.
        </Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------

function Entrar() {
  const entrar = useConta((estado) => estado.entrar);
  const criarConta = useConta((estado) => estado.criarConta);
  const estabelecimento = useEstabelecimento((estado) => estado.atual);

  const [emailDigitado, setEmailDigitado] = useState('');
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const podeEnviar = emailDigitado.trim().length > 3 && senha.length >= 6 && !ocupado;

  /**
   * Com dados no aparelho, o primeiro backup sobe tudo o que já existe.
   *
   * Aparelho VAZIO não é tratado aqui: assim que o login dá certo, esta
   * tela troca sozinha para a de quem está logado, e é ela que restaura
   * (ver `Restaurar`). Fazer aqui perderia a mensagem de erro junto com
   * o formulário.
   */
  function depoisDeEntrar() {
    if (estabelecimento) void fazerBackup();
  }

  async function aoEntrar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const falha = await entrar(emailDigitado, senha);
    if (falha) setErro(falha);
    else depoisDeEntrar();
    setOcupado(false);
  }

  async function aoCriar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const { erro: falha, confirmar } = await criarConta(emailDigitado, senha);
    if (falha) setErro(falha);
    else if (confirmar) {
      setAviso('Conta criada. Abra o link que enviamos para o seu e-mail e depois toque em Entrar.');
    } else depoisDeEntrar();
    setOcupado(false);
  }

  return (
    <ScrollView
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      keyboardShouldPersistTaps="handled"
    >
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>Guarde suas inspeções na nuvem</Text>
        <Text style={estilos.texto}>
          {estabelecimento
            ? 'Com uma conta, o histórico deste celular é copiado para a nuvem — inclusive o que você já fez até aqui. Se o celular se perder, é só entrar na mesma conta em outro.'
            : 'Já usava o app em outro celular? Entre na mesma conta e o histórico volta para este.'}
        </Text>
        <Text style={estilos.ajuda}>
          A conta é opcional. Sem ela, o app funciona igual, só sem cópia na nuvem.
        </Text>
      </View>

      <Text style={estilos.rotuloCampo}>E-mail</Text>
      <TextInput
        style={estilos.campo}
        value={emailDigitado}
        onChangeText={setEmailDigitado}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="voce@exemplo.com"
        placeholderTextColor={Cores.textoSuave}
      />

      <Text style={estilos.rotuloCampo}>Senha</Text>
      <TextInput
        style={estilos.campo}
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
        autoComplete="password"
        placeholder="Pelo menos 6 caracteres"
        placeholderTextColor={Cores.textoSuave}
      />

      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
      {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}

      <Pressable
        onPress={aoEntrar}
        disabled={!podeEnviar}
        style={({ pressed }) => [
          estilos.botao,
          !podeEnviar && estilos.botaoDesativado,
          pressed && estilos.pressionado,
        ]}
      >
        {ocupado ? (
          <ActivityIndicator color={Cores.sobrePrimaria} />
        ) : (
          <Text style={[estilos.botaoTexto, !podeEnviar && estilos.botaoTextoDesativado]}>
            Entrar
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={aoCriar}
        disabled={!podeEnviar}
        style={({ pressed }) => [estilos.botaoSecundario, pressed && estilos.pressionado]}
      >
        <Text style={[estilos.botaoSecundarioTexto, !podeEnviar && estilos.botaoTextoDesativado]}>
          Criar conta
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------

/** '2026-09-26T14:03:21.000Z' → '26/09 às 11:03' (no fuso do aparelho). */
function quando(iso: string): string {
  const data = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)} às ${dois(data.getHours())}:${dois(data.getMinutes())}`;
}

function textoDoResultado(resultado: ResultadoBackup): string {
  if (resultado.ok) {
    return resultado.enviadas === 0
      ? 'Tudo já estava na nuvem.'
      : `Backup feito: ${resultado.enviadas} registro(s) enviado(s).`;
  }
  if (resultado.motivo === 'erro') return `Não foi possível agora: ${resultado.mensagem}`;
  if (resultado.motivo === 'outra_conta') return 'O histórico deste celular é de outra conta.';
  return 'Não foi possível agora.';
}

/**
 * Aparelho VAZIO com conta logada: traz o histórico da nuvem.
 *
 * Tenta sozinho ao abrir, e oferece "Tentar de novo" se falhar (sem
 * internet, por exemplo). Só oferece o cadastro do zero quando a nuvem
 * responde que a conta não tem nada — cadastrar depois de uma FALHA
 * criaria um segundo estabelecimento na conta.
 */
function Restaurar() {
  const router = useRouter();
  const sair = useConta((estado) => estado.sair);
  const carregarEstabelecimento = useEstabelecimento((estado) => estado.carregar);
  const [situacao, setSituacao] = useState<'tentando' | 'falhou' | 'vazia'>('tentando');
  const [erro, setErro] = useState<string | null>(null);

  const tentar = useCallback(async () => {
    setSituacao('tentando');
    const resultado = await restaurarDaNuvem();
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      setSituacao('falhou');
    } else if (resultado.restaurado) {
      carregarEstabelecimento();
      Alert.alert('Histórico restaurado', 'Seus dados voltaram para este celular.');
      router.replace('/');
    } else {
      setSituacao('vazia');
    }
  }, [carregarEstabelecimento, router]);

  useEffect(() => {
    void tentar();
  }, [tentar]);

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <View style={estilos.cartao}>
        {situacao === 'tentando' ? (
          <>
            <Text style={estilos.titulo}>Procurando seu histórico…</Text>
            <ActivityIndicator style={estilos.espaco} color={Cores.primaria} />
          </>
        ) : situacao === 'falhou' ? (
          <>
            <Text style={estilos.titulo}>Não foi possível restaurar agora</Text>
            <Text style={estilos.texto}>{erro}</Text>
            <Text style={estilos.ajuda}>
              Confira a internet e tente de novo. Se cadastrar o estabelecimento antes disso, a
              conta fica com dois.
            </Text>
          </>
        ) : (
          <>
            <Text style={estilos.titulo}>Esta conta ainda não tem histórico</Text>
            <Text style={estilos.texto}>
              Nada foi guardado na nuvem com ela. Cadastre o estabelecimento para começar — o
              backup passa a acontecer sozinho.
            </Text>
          </>
        )}
      </View>

      {situacao === 'falhou' ? (
        <Pressable
          onPress={() => void tentar()}
          style={({ pressed }) => [estilos.botao, pressed && estilos.pressionado]}
        >
          <Text style={estilos.botaoTexto}>Tentar de novo</Text>
        </Pressable>
      ) : null}

      {situacao === 'vazia' ? (
        <Pressable
          onPress={() => router.replace('/cadastro')}
          style={({ pressed }) => [estilos.botao, pressed && estilos.pressionado]}
        >
          <Text style={estilos.botaoTexto}>Cadastrar estabelecimento</Text>
        </Pressable>
      ) : null}

      {situacao !== 'tentando' ? (
        <Pressable
          onPress={() => void sair()}
          style={({ pressed }) => [estilos.botaoSecundario, pressed && estilos.pressionado]}
        >
          <Text style={estilos.botaoSairTexto}>Sair da conta</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Logado({ email }: { email: string }) {
  const estabelecimento = useEstabelecimento((estado) => estado.atual);
  if (!estabelecimento) return <Restaurar />;
  return <Resumo email={email} />;
}

function Resumo({ email }: { email: string }) {
  const sair = useConta((estado) => estado.sair);
  const [dono, setDono] = useState(() => contaDoAparelho());
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const recarregar = useCallback(() => {
    void ultimoBackup().then(setUltimo);
    setDono(contaDoAparelho());
  }, []);

  // O histórico deste celular já foi para OUTRA conta (um aparelho, uma
  // conta — ver `donoDoAparelho` em db/backup.ts). Compara pelo ID, a
  // mesma régua do `fazerBackup`: o e-mail do dono pode não ter sido
  // gravado, e aí a tela deixaria de avisar o que o backup recusa.
  const usuarioId = useConta((estado) => estado.usuarioId);
  const deOutraConta = dono !== null && usuarioId !== null && dono.id !== usuarioId;

  useFocusEffect(recarregar);

  async function aoFazerBackup() {
    setOcupado(true);
    setMensagem(null);
    const resultado = await fazerBackup();
    setMensagem(textoDoResultado(resultado));
    recarregar();
    setOcupado(false);
  }

  function aoSair() {
    Alert.alert(
      'Sair da conta?',
      'Os dados continuam neste celular. Só o backup para de acontecer até você entrar de novo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => void sair() },
      ],
    );
  }

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Conta</Text>
        <Text style={estilos.titulo}>{email}</Text>

        <Text style={[estilos.rotulo, estilos.espaco]}>Último backup</Text>
        <Text style={estilos.texto}>{ultimo ? quando(ultimo) : 'Ainda não foi feito.'}</Text>

        <Text style={estilos.ajuda}>
          O backup acontece sozinho ao abrir o app e ao concluir uma inspeção. Sem internet, ele
          espera a próxima vez — nada se perde, porque tudo continua no celular.
        </Text>
      </View>

      {deOutraConta ? (
        <View style={[estilos.cartao, estilos.espaco]}>
          <Text style={estilos.titulo}>Backup parado</Text>
          <Text style={estilos.texto}>
            O histórico deste celular já está guardado{' '}
            {dono?.email ? `na conta ${dono.email}` : 'em outra conta'}. Um aparelho faz
            backup para uma conta só: entre nela para continuar.
          </Text>
        </View>
      ) : null}

      {mensagem ? <Text style={estilos.aviso}>{mensagem}</Text> : null}

      <Pressable
        onPress={aoFazerBackup}
        disabled={ocupado || deOutraConta}
        style={({ pressed }) => [
          estilos.botao,
          deOutraConta && estilos.botaoDesativado,
          pressed && estilos.pressionado,
        ]}
      >
        {ocupado ? (
          <ActivityIndicator color={Cores.sobrePrimaria} />
        ) : (
          <Text style={estilos.botaoTexto}>Fazer backup agora</Text>
        )}
      </Pressable>

      <Pressable
        onPress={aoSair}
        style={({ pressed }) => [estilos.botaoSecundario, pressed && estilos.pressionado]}
      >
        <Text style={estilos.botaoSairTexto}>Sair da conta</Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Cores.fundo },
  conteudo: { padding: 20, paddingBottom: 48 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Cores.fundo },

  cartao: { backgroundColor: Cores.superficie, borderRadius: 14, padding: 18 },
  rotulo: { fontSize: 12, fontWeight: '700', color: Cores.textoSecundario },
  espaco: { marginTop: 16 },
  titulo: { fontSize: 17, fontWeight: '700', color: Cores.texto, marginTop: 2 },
  texto: { fontSize: 15, lineHeight: 22, color: Cores.texto, marginTop: 8 },
  ajuda: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 12 },

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

  erro: { fontSize: 14, lineHeight: 20, color: Cores.acentoTexto, marginTop: 16 },
  aviso: { fontSize: 14, lineHeight: 20, color: Cores.textoSecundario, marginTop: 16 },

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

  botaoSecundario: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  botaoSecundarioTexto: { fontSize: 15, fontWeight: '700', color: Cores.primariaTexto },
  botaoSairTexto: { fontSize: 14, fontWeight: '700', color: Cores.acentoTexto },
});
