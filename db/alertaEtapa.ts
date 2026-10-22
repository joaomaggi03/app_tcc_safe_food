/**
 * db/alertaEtapa.ts
 * ---------------------------------------------------------------
 * QUANDO AVISAR QUE CADA ETAPA DA DIÁRIA ABRIU — puro, sem banco.
 *
 * Pedido do orientador (20/10/2026), entrega 3. Com as janelas
 * (`db/janela.ts`), cada etapa da diária só aceita resposta num horário;
 * o alerta avisa quando é hora de cada uma, para ela não virar
 * pendência por esquecimento.
 *
 * AS REGRAS (decididas com o autor em 21/10/2026):
 *  - "Antes de abrir": 30 min ANTES da abertura. A janela dessa etapa
 *    começa à meia-noite, e um alerta às 00:00 não serve a ninguém; meia
 *    hora antes é quando a conferência acontece de verdade.
 *  - "Durante o serviço": na hora da abertura — quando a janela abre.
 *  - "No fechamento": 30 min antes do fechamento — idem.
 *  - Só em DIA ABERTO (máscara de funcionamento).
 *  - Etapa FEITA hoje (todos os itens dela respondidos) não é avisada; a
 *    diária concluída conta como todas feitas.
 *  - SEM HORÁRIO cadastrado, nenhum alerta de etapa: sem horário não há
 *    janela. O lembrete diário da trilha (RF05) continua valendo.
 *  - Agenda os próximos `DIAS_A_FRENTE` dias, com o horário do cadastro.
 *    O agendamento é refeito a cada abertura do app, então a semana
 *    "anda" sozinha.
 *
 * As antecedências reaproveitam as tolerâncias das janelas: mudar uma
 * sem a outra faria o alerta tocar com a etapa ainda fechada.
 */

import type { MomentoDia } from '../data/rdc216';
import { somarDias } from './datas';
import { abreNoDia } from './funcionamento';
import { ANTECEDENCIA_FECHAMENTO, TOLERANCIA_ABERTURA, type Horarios } from './janela';

/** Quantos dias, contando hoje, ficam agendados. 7 × 3 = 21 alertas no máximo. */
export const DIAS_A_FRENTE = 7;

/** Minutos antes da abertura em que o alerta de "antes de abrir" toca. */
export const ANTECEDENCIA_ALERTA_ABERTURA = TOLERANCIA_ABERTURA;

export interface AlertaEtapa {
  momento: MomentoDia;
  /** O dia local do alerta ('AAAA-MM-DD'). */
  dia: string;
  /** Minuto do dia em que toca. */
  minuto: number;
}

export interface EntradaAlertas {
  horarios: Horarios | null;
  diasFuncionamento: string | null;
  hoje: string;
  /** Minuto de agora: alerta de hoje que já passou não é agendado. */
  minutoAgora: number;
  /** Etapas da diária de HOJE já completas. */
  feitasHoje: ReadonlySet<MomentoDia>;
}

/** O minuto do dia em que o alerta de cada etapa toca. */
export function minutoDoAlerta(momento: MomentoDia, horarios: Horarios): number {
  switch (momento) {
    case 'abertura':
      // Abrir antes das 00:30 jogaria o alerta para o dia anterior; nesse
      // caso raro ele toca à meia-noite, junto com a abertura da janela.
      return Math.max(0, horarios.abertura - ANTECEDENCIA_ALERTA_ABERTURA);
    case 'servico':
      return horarios.abertura;
    case 'fechamento':
      return horarios.fechamento - ANTECEDENCIA_FECHAMENTO;
  }
}

/** Os alertas de etapa a agendar, em ordem de dia e hora. */
export function alertasDeEtapa(entrada: EntradaAlertas): AlertaEtapa[] {
  const { horarios } = entrada;
  if (!horarios) return [];

  const alertas: AlertaEtapa[] = [];
  for (let passo = 0; passo < DIAS_A_FRENTE; passo++) {
    const dia = somarDias(entrada.hoje, passo);
    if (!abreNoDia(entrada.diasFuncionamento, dia)) continue;

    for (const momento of ['abertura', 'servico', 'fechamento'] as MomentoDia[]) {
      const minuto = minutoDoAlerta(momento, horarios);
      if (passo === 0) {
        if (minuto <= entrada.minutoAgora) continue;
        if (entrada.feitasHoje.has(momento)) continue;
      }
      alertas.push({ momento, dia, minuto });
    }
  }
  return alertas;
}
