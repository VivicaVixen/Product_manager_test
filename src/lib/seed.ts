import type { BundleInput, AppState, AppMetrics } from "./types";

// Imports estáticos — webpack los resuelve en build time.
// Los 8 bundles del dataset.
import bundle01 from "../../data/bundle_01.json";
import bundle02 from "../../data/bundle_02.json";
import bundle03 from "../../data/bundle_03.json";
import bundle04 from "../../data/bundle_04.json";
import bundle05 from "../../data/bundle_05.json";
import bundle06 from "../../data/bundle_06.json";
import bundle07 from "../../data/bundle_07.json";
import bundle08 from "../../data/bundle_08.json";

const ALL_BUNDLES: BundleInput[] = [
  bundle01 as BundleInput,
  bundle02 as BundleInput,
  bundle03 as BundleInput,
  bundle04 as BundleInput,
  bundle05 as BundleInput,
  bundle06 as BundleInput,
  bundle07 as BundleInput,
  bundle08 as BundleInput,
];

/**
 * Carga todos los bundles del dataset consolidado.
 * En serverless los bundles ya están embebidos en el build.
 */
export async function loadAllBundles(): Promise<BundleInput[]> {
  return ALL_BUNDLES;
}

/**
 * Consolida todos los bundles en un solo AppState.
 */
export function consolidateBundles(bundles: BundleInput[]): AppState {
  const orders: AppState["orders"] = [];
  const groundTruth: AppState["groundTruth"] = [];
  const c1Alerts: AppState["c1Alerts"] = [];

  for (const bundle of bundles) {
    orders.push(...bundle.orders);
    groundTruth.push(...bundle.ground_truth);
    c1Alerts.push(...bundle.expected_c1_alerts);
  }

  return {
    loaded: true,
    currentBatch: bundles.length,
    orders,
    groundTruth,
    c1Alerts,
    guiasNormalizadas: [],
    conciliaciones: [],
    anomalias: [],
    hitlRecords: [],
    metrics: emptyMetrics(),
  };
}

/**
 * Estado inicial vacío (antes de seed).
 */
export function emptyState(): AppState {
  return {
    loaded: false,
    currentBatch: 0,
    orders: [],
    groundTruth: [],
    c1Alerts: [],
    guiasNormalizadas: [],
    conciliaciones: [],
    anomalias: [],
    hitlRecords: [],
    metrics: emptyMetrics(),
  };
}

function emptyMetrics(): AppMetrics {
  return {
    tasa_normalizacion: 0,
    filas_aisladas: 0,
    tasa_conciliacion_automatica: 0,
    precision_matching: 0,
    recall_anomalias: 0,
    precision_c7: 0,
    false_positive_rate: 0,
    total_confirmado_cop: 0,
    total_pendiente_cop: 0,
    total_discrepancias: 0,
  };
}
