import type {
  AppState,
  GuiaNormalizada,
  ConciliacionResultado,
  AnomaliaResultado,
  HitlRecord,
  HitlDecisionC2,
  HitlDecisionC7,
  AppMetrics,
  C1Alert,
} from "./types";
import { emptyState, consolidateBundles, loadAllBundles } from "./seed";

/**
 * Estado global en memoria (singletons).
 * En serverless de Vercel, cada request puede tener un estado diferente,
 * pero para este prototipo usamos un módulo-level singleton.
 */
let state: AppState = emptyState();

export function getState(): AppState {
  return { ...state };
}

export async function seedReset(): Promise<AppState> {
  const bundles = await loadAllBundles();
  state = consolidateBundles(bundles);
  return getState();
}

export function resetState(): AppState {
  state = emptyState();
  return getState();
}

// --- C1: Normalización ---
export function setGuiasNormalizadas(guias: GuiaNormalizada[]): AppState {
  state.guiasNormalizadas = guias;
  return getState();
}

export function setC1Alerts(alerts: C1Alert[]): AppState {
  state.c1Alerts = alerts;
  return getState();
}

// --- C2: Conciliación ---
export function setConciliaciones(results: ConciliacionResultado[]): AppState {
  state.conciliaciones = results;
  return getState();
}

// --- C7: Anomalías ---
export function setAnomalias(results: AnomaliaResultado[]): AppState {
  state.anomalias = results;
  return getState();
}

// --- HITL ---
export function addHitlRecord(record: HitlRecord): AppState {
  // Reemplaza el record existente para la misma guía+tipo
  const idx = state.hitlRecords.findIndex(
    (r) => r.guia === record.guia && r.tipo === record.tipo
  );
  if (idx >= 0) {
    state.hitlRecords[idx] = record;
  } else {
    state.hitlRecords.push(record);
  }
  return getState();
}

// --- Métricas ---
export function setMetrics(metrics: AppMetrics): AppState {
  state.metrics = metrics;
  return getState();
}
