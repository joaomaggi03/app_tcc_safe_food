/**
 * app/historico.tsx
 * ---------------------------------------------------------------
 * Tela HISTÓRICO — rota "/historico".
 *
 * Lista as inspeções já concluídas, com data e score, lendo do
 * SQLite local (offline).
 *
 * Por enquanto é só um placeholder (Fase 0).
 */

import TelaPlaceholder from '../components/TelaPlaceholder';

export default function TelaHistorico() {
  return (
    <TelaPlaceholder
      fase="Fase 0 — placeholder"
      titulo="Histórico"
      subtitulo="As inspeções já concluídas, com data e score, lidas do banco local — funciona sem internet."
      proximosPassos={[
        'Fase 1: leitura das inspeções no SQLite',
        'Fase 4: score de cada inspeção (RF04)',
        'Fase 4: resumo de conformidade por categoria',
      ]}
    />
  );
}
