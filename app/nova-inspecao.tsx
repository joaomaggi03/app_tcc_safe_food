/**
 * app/nova-inspecao.tsx
 * ---------------------------------------------------------------
 * Tela NOVA INSPEÇÃO — rota "/nova-inspecao".
 *
 * É aqui que o checklist dinâmico vai viver: os itens da RDC 216
 * filtrados pelo perfil do estabelecimento, agrupados por categoria.
 *
 * Por enquanto é só um placeholder (Fase 0).
 */

import TelaPlaceholder from '../components/TelaPlaceholder';

export default function TelaNovaInspecao() {
  return (
    <TelaPlaceholder
      fase="Fase 0 — placeholder"
      titulo="Nova Inspeção"
      subtitulo="O checklist dinâmico: itens da RDC 216 filtrados pelo perfil do estabelecimento e agrupados por categoria."
      proximosPassos={[
        'Fase 2: checklist filtrado por perfil (RF03)',
        'Fase 3: respostas Adequado / Inadequado / Não se Aplica / Não Observado (RF06)',
        'Fase 3: "Não se Aplica" oculta o item nas próximas inspeções (RF09)',
      ]}
    />
  );
}
