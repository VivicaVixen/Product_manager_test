/**
 * Pipeline orquestador: C1 → C2 → C7 → Métricas
 * Ejecuta la cadena completa sobre el dataset seed.
 */

import type {
  BundleInput,
  Orden,
  GroundTruth,
  GuiaNormalizada,
  ConciliacionResultado,
  AnomaliaResultado,
  HitlRecord,
  C1Alert,
  AppState,
  AppMetrics,
} from './types';
import { runC1, normalizeGuiaForCarrier } from './c1_normalize';
import { runC2 } from './c2_conciliate';
import { runC7 } from './c7_anomalies';

/**
 * Ejecuta el pipeline completo sobre un conjunto de bundles.
 * Retorna el estado listo para el dashboard.
 */
export function runPipeline(
  bundles: BundleInput[],
  prevHitl: HitlRecord[] = []
): AppState {
  const timestamp = new Date().toISOString();

  // Consolidar datos
  const orders: Orden[] = [];
  const groundTruth: GroundTruth[] = [];
  const c1Alerts: C1Alert[] = [];

  for (const bundle of bundles) {
    orders.push(...bundle.orders);
    groundTruth.push(...bundle.ground_truth);
    c1Alerts.push(...bundle.expected_c1_alerts);
  }

  // C1: Normalizar todos los carrier_raw
  const allGuias: GuiaNormalizada[] = [];
  const allNovedadesTextoLibre: { guia: string; texto: string; linea: number }[] = [];

  for (const bundle of bundles) {
    const c1Result = runC1(bundle.carrier_raw, timestamp);
    allGuias.push(...c1Result.guias);
    allNovedadesTextoLibre.push(...c1Result.novedadesTextoLibre);
  }

  const tasaNormalizacion = allGuias.length > 0
    ? allGuias.length / (allGuias.length + c1Alerts.length)
    : 0;

  // C2: Conciliación
  const c2Result = runC2(allGuias, orders, groundTruth, prevHitl);

  // C7: Anomalías
  const c7Result = runC7(c2Result.resultados, groundTruth, prevHitl);

  // Calcular métricas de dashboard
  const metrics = calculateMetrics(
    c2Result.resultados,
    c7Result.anomalias,
    c1Alerts,
    tasaNormalizacion,
    c2Result.tasaAutoConciliacion,
    c2Result.precisionMatching,
    c7Result
  );

  return {
    loaded: true,
    currentBatch: bundles.length,
    orders,
    groundTruth,
    c1Alerts,
    guiasNormalizadas: allGuias,
    conciliaciones: c2Result.resultados,
    anomalias: c7Result.anomalias,
    hitlRecords: prevHitl,
    metrics,
  };
}

function calculateMetrics(
  conciliaciones: ConciliacionResultado[],
  anomalias: AnomaliaResultado[],
  c1Alerts: C1Alert[],
  tasaNorm: number,
  tasaAutoConciliacion: number,
  precisionMatching: number,
  c7Result: ReturnType<typeof runC7>
): AppMetrics {
  let totalConfirmadoCOP = 0;
  let totalPendienteCOP = 0;
  let totalDiscrepancias = 0;

  for (const c of conciliaciones) {
    switch (c.clase) {
      case 'cobrado':
        totalConfirmadoCOP += c.monto_reportado ?? 0;
        break;
      case 'pendiente_acreditacion':
        totalPendienteCOP += c.monto_esperado ?? 0;
        break;
      case 'discrepancia':
        totalDiscrepancias++;
        totalPendienteCOP += c.monto_esperado ?? 0;
        break;
    }
  }

  return {
    tasa_normalizacion: tasaNorm,
    filas_aisladas: c1Alerts.length,
    tasa_conciliacion_automatica: tasaAutoConciliacion,
    precision_matching: precisionMatching,
    recall_anomalias: c7Result.recall,
    precision_c7: c7Result.precision,
    false_positive_rate: c7Result.falsePositiveRate,
    total_confirmado_cop: totalConfirmadoCOP,
    total_pendiente_cop: totalPendienteCOP,
    total_discrepancias: totalDiscrepancias,
  };
}
