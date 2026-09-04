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
    backgroundColor: '#F2F2F7',
    padding: 20,
    justifyContent: 'center',
  },
  cartao: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    // Sombra: iOS usa shadow*, Android usa elevation.
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  etiqueta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  subtitulo: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5A5A5F',
    marginTop: 8,
  },
  divisor: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 18,
  },
  rotuloLista: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8A8E',
    marginBottom: 8,
  },
  itemLista: {
    fontSize: 14,
    lineHeight: 22,
    color: '#3A3A3C',
  },
});
