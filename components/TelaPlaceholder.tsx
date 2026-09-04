/**
 * components/TelaPlaceholder.tsx
 * ---------------------------------------------------------------
 * Componente visual reutilizado pelas três telas da Fase 0.
 *
 * Ele não tem lógica: só recebe um título, um subtítulo e um texto
 * ("o que vem aqui depois") e desenha o cartão na tela. Serve para
 * as telas ficarem curtas e para você ver como um componente
 * próprio é criado e reaproveitado.
 *
 * As props são tipadas em TypeScript pela interface `Props` abaixo:
 * se você esquecer de passar `titulo`, o editor avisa antes de rodar.
 */

import { StyleSheet, Text, View } from 'react-native';
import Cores from '../theme/cores';

interface Props {
  titulo: string;
  subtitulo: string;
  /** Lista de itens que essa tela vai ganhar nas próximas fases. */
  proximosPassos: string[];
  /** Fase do plano em que essa tela será implementada de verdade. */
  fase: string;
}

export default function TelaPlaceholder({ titulo, subtitulo, proximosPassos, fase }: Props) {
  return (
    <View style={estilos.container}>
      <View style={estilos.cartao}>
        <Text style={estilos.etiqueta}>{fase}</Text>
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={estilos.subtitulo}>{subtitulo}</Text>

        <View style={estilos.divisor} />

        <Text style={estilos.rotuloLista}>O que vem aqui:</Text>
        {proximosPassos.map((passo) => (
          <Text key={passo} style={estilos.itemLista}>
            {'•'}  {passo}
          </Text>
        ))}
      </View>
    </View>
  );
}

// StyleSheet.create é a forma padrão de escrever estilos em React Native.
// Os nomes lembram CSS, mas os valores são números (sem "px") e o layout
// é sempre flexbox.
const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Cores.fundo,
    padding: 20,
    justifyContent: 'center',
  },
  cartao: {
    backgroundColor: Cores.superficie,
    borderRadius: 16,
    padding: 24,
    // Sombra: iOS usa shadow*, Android usa elevation.
    shadowColor: Cores.texto,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  // Etiqueta em "pílula": aqui o verde primário aparece como
  // preenchimento, com texto verde-escuro por cima (contraste 6,5:1).
  // `overflow: hidden` é o que faz o borderRadius valer no Android.
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
    marginBottom: 12,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '700',
    color: Cores.texto,
  },
  subtitulo: {
    fontSize: 15,
    lineHeight: 22,
    color: Cores.textoSecundario,
    marginTop: 8,
  },
  divisor: {
    height: 1,
    backgroundColor: Cores.divisor,
    marginVertical: 18,
  },
  rotuloLista: {
    fontSize: 13,
    fontWeight: '600',
    color: Cores.textoSuave,
    marginBottom: 8,
  },
  itemLista: {
    fontSize: 14,
    lineHeight: 22,
    color: Cores.textoSecundario,
  },
});
