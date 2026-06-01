// lib/hitl_feedback.ts — Registro de feedback HITL para recalibración C7 (M5.1)
// Acumula decisiones HITL en estado cliente + localStorage.
// NO modifica el pipeline. Solo registra.
import type { CarrierId } from './types';

export interface HITLFeedback {
  guia: string;
  carrier: CarrierId;
  diferencia: number;   // diferencia_pesos de la fila
  decision: 'confirmar' | 'descartar';
  timestamp: string;    // ISO
}

const STORAGE_KEY = 'faro_hitl_feedback_v1';

/** Carga feedback acumulado desde localStorage. */
export function loadFeedback(): HITLFeedback[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HITLFeedback[]) : [];
  } catch {
    return [];
  }
}

/** Guarda una nueva decisión de feedback. */
export function saveFeedback(feedback: HITLFeedback): HITLFeedback[] {
  if (typeof window === 'undefined') return [];
  const existing = loadFeedback();
  const updated = [...existing, feedback];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage lleno o no disponible
  }
  return updated;
}

/** Limpia todo el feedback acumulado. */
export function clearFeedback(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}
