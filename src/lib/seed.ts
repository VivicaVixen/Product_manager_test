import type { BundleInput, AppState, AppMetrics } from "./types";

/**
 * Carga todos los bundles del dataset consolidado.
 * En producción real se leerían de /data; en serverless se importan directamente.
 */
export async function loadAllBundles(): Promise<BundleInput[]> {
  const bundles: BundleInput[] = [];
  const bundleCount = 8;

  for (let i = 1; i <= bundleCount; i++) {
    const mod = await import(`../../data/bundle_${String(i).padStart(2, "0")}.json`);
    bundles.push(mod.default as BundleInput);
  }

  return bundles;
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
