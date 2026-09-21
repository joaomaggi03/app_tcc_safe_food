/**
 * components/MedidorScore.tsx
 * ---------------------------------------------------------------
 * O score desenhado como um MEDIDOR: um arco com degradê do rosa (0%)
 * ao verde (100%), um marcador na posição do score e o número no meio.
 *
 * Só desenha. O número vem pronto de `db/consultas.ts`, como em todo o
 * resto do app — este componente não sabe o que é item crítico nem
 * como o score é calculado.
 *
 * Como o arco é feito: o SVG não tem degradê "que segue a curva", só
 * degradê em linha reta. Um degradê da esquerda para a direita, pintado
 * num arco aberto embaixo, já dá o efeito certo — a ponta esquerda fica
 * rosa, o topo fica âmbar e a ponta direita fica verde.
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Cores from '../theme/cores';

/** Onde o arco começa (embaixo à esquerda), em graus; 0° é "3 horas". */
const ANGULO_INICIO = 150;
/** Quanto o arco percorre. 240° deixa a abertura embaixo, como um velocímetro. */
const ANGULO_TOTAL = 240;

const LARGURA = 240;
const ESPESSURA = 16;
const RAIO_MARCADOR = 11;
const RAIO = LARGURA / 2 - RAIO_MARCADOR - 2;
const CENTRO = LARGURA / 2;
// O arco termina a meia altura abaixo do centro (seno de 30° = 0,5).
const ALTURA = CENTRO + RAIO * 0.5 + RAIO_MARCADOR + 2;

/** Ponto do arco num ângulo — conta de trigonometria do ensino médio. */
function ponto(graus: number): { x: number; y: number } {
  const rad = (graus * Math.PI) / 180;
  return { x: CENTRO + RAIO * Math.cos(rad), y: CENTRO + RAIO * Math.sin(rad) };
}

const inicio = ponto(ANGULO_INICIO);
const fim = ponto(ANGULO_INICIO + ANGULO_TOTAL);
// "A" é o comando de arco do SVG. Os dois 1 dizem: o arco GRANDE (mais
// de 180°) e no sentido horário — passando por cima, não por baixo.
const ARCO = `M ${inicio.x} ${inicio.y} A ${RAIO} ${RAIO} 0 1 1 ${fim.x} ${fim.y}`;

interface Props {
  /** 0 a 100, ou null quando nada foi avaliado. */
  valor: number | null;
  /** Cor do número — a tela decide, pela faixa do score. */
  corNumero?: string;
}

export default function MedidorScore({ valor, corNumero = Cores.texto }: Props) {
  const semDados = valor === null;

  // Protege o desenho de um valor fora da faixa: o marcador nunca sai do arco.
  const limitado = semDados ? 0 : Math.min(100, Math.max(0, valor));
  const marcador = ponto(ANGULO_INICIO + (ANGULO_TOTAL * limitado) / 100);

  return (
    <View
      style={estilos.caixa}
      accessible
      accessibilityLabel={
        semDados ? 'Conformidade: nenhum item avaliado' : `Conformidade: ${valor} por cento`
      }
    >
      <Svg width={LARGURA} height={ALTURA}>
        <Defs>
          <LinearGradient id="degrade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={Cores.medidorInicio} />
            <Stop offset="0.5" stopColor={Cores.medidorMeio} />
            <Stop offset="1" stopColor={Cores.medidorFim} />
          </LinearGradient>
        </Defs>

        {/* Sem dados, o arco fica cinza e sem marcador: não é 0%. */}
        <Path
          d={ARCO}
          stroke={semDados ? Cores.borda : 'url(#degrade)'}
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          fill="none"
        />

        {semDados ? null : (
          <Circle
            cx={marcador.x}
            cy={marcador.y}
            r={RAIO_MARCADOR}
            fill={Cores.superficie}
            stroke={Cores.texto}
            strokeWidth={3}
          />
        )}
      </Svg>

      {/* O texto fica POR CIMA do desenho, centralizado no arco. */}
      <View style={estilos.centro} pointerEvents="none">
        <Text style={estilos.rotulo}>CONFORMIDADE</Text>
        <Text style={[estilos.numero, { color: semDados ? Cores.textoSuave : corNumero }]}>
          {semDados ? '—' : valor}
        </Text>
        <Text style={estilos.escala}>{semDados ? 'nada avaliado' : 'de 100'}</Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { width: LARGURA, height: ALTURA, alignSelf: 'center' },
  centro: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 18,
  },
  rotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Cores.textoSuave },
  numero: { fontSize: 64, fontWeight: '800', lineHeight: 72 },
  escala: { fontSize: 13, color: Cores.textoSuave },
});
