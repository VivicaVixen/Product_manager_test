/**
 * C7 — Detección de anomalías (RF-C7-1 a RF-C7-5)
 *
 * Umbral fijo: diferencia > COP 50.000 O > 3% → anomalía.
 * Outlier estadístico: montos que se desvían significativamente de la distribución por carrier.
 * Sesgo a falso positivo sobre falso negativo.
 */

import type {
  ConciliacionResultado,
  GroundTruth,
  AnomaliaResultado,
  HitlRecord,
} from './types';

const UMBRAL_FIJO_COP = 50000;
const UMBRAL_PCT = 3;

/**
 * Ejecuta C7 sobre los resultados de conciliación.
 */
export function runC7(
  conciliaciones: ConciliacionResultado[],
  groundTruth: GroundTruth[],
  hitlRecordsPrevios: HitlRecord[] = []
): {
  anomalias: AnomaliaResultado[];
  recall: number;
  precision: number;
  falsePositiveRate: number;
} {
  // Indexar ground truth
  const gtMap = new Map<string, GroundTruth>();
  for (const gt of groundTruth) {
    gtMap.set(gt.guia, gt);
  }

  // Indexar HITL previos de C7
  const hitlMap = new Map<string, HitlRecord>();
  for (const hr of hitlRecordsPrevios) {
    if (hr.tipo === 'c7') {
      hitlMap.set(hr.guia, hr);
    }
  }

  // Calcular estadísticas por carrier para detección de outliers
  const carrierAmounts = new Map<string, number[]>();
  for (const c of conciliaciones) {
    if (c.diferencia_pesos !== null && c.diferencia_pesos !== 0) {
      const amounts = carrierAmounts.get(c.carrier) ?? [];
      amounts.push(Math.abs(c.diferencia_pesos));
      carrierAmounts.set(c.carrier, amounts);
    }
  }

  // Calcular media y desviación estándar por carrier
  const carrierStats = new Map<string, { mean: number; std: number }>();
  for (const [carrier, amounts] of carrierAmounts) {
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length;
    const std = Math.sqrt(variance);
    carrierStats.set(carrier, { mean, std });
  }

  const anomalias: AnomaliaResultado[] = [];
  let truePositives = 0;
  let falsePositives = 0;
  let totalRealAnomalies = 0;

  for (const c of conciliaciones) {
    const gt = gtMap.get(c.guia);
    const hitlC7 = hitlMap.get(c.guia);
    const key = `${c.carrier}::${c.guia}`;

    let flag = false;
    let razon: AnomaliaResultado['razon'] = 'ninguno';
    let confianza = 0;

    // Umbral fijo (baseline)
    if (c.diferencia_pesos !== null && c.diferencia_pesos !== 0) {
      const absDiff = Math.abs(c.diferencia_pesos);
      const diffPct = c.diferencia_pct ?? 0;

      if (absDiff > UMBRAL_FIJO_COP || diffPct > UMBRAL_PCT) {
        flag = true;
        razon = 'excede_umbral_fijo';
        confianza = Math.min(100, 50 + (absDiff / UMBRAL_FIJO_COP) * 30);
      }
    }

    // Outlier estadístico: si la diferencia > 2 std de la distribución del carrier
    if (!flag && c.diferencia_pesos !== null) {
      const stats = carrierStats.get(c.carrier);
      if (stats && stats.std > 0) {
        const zScore = Math.abs(c.diferencia_pesos - stats.mean) / stats.std;
        if (zScore > 2) {
          flag = true;
          razon = 'outlier_estadistico';
          confianza = Math.min(100, 40 + zScore * 15);
        }
      }
    }

    // Si ya fue marcado en ground truth como anomalía, contar para métricas
    if (gt) {
      if (gt.is_anomaly) totalRealAnomalies++;
      if (gt.is_anomaly && flag) truePositives++;
      if (!gt.is_anomaly && flag) falsePositives++;
    }

    // Respetar decisión HITL previa
    if (hitlC7 && hitlC7.decision === 'descartar') {
      flag = false;
      razon = 'ninguno';
      confianza = 0;
    }

    anomalias.push({
      guia: c.guia,
      carrier: c.carrier,
      flag,
      confianza: Math.round(confianza),
      razon,
      diferencia_pesos: c.diferencia_pesos,
      diferencia_pct: c.diferencia_pct,
    });
  }

  return {
    anomalias,
    recall: totalRealAnomalies > 0 ? truePositives / totalRealAnomalies : 0,
    precision: (truePositives + falsePositives) > 0
      ? truePositives / (truePositives + falsePositives)
      : 0,
    falsePositiveRate: falsePositives > 0
      ? falsePositives / (anomalias.filter(a => !a.flag).length + falsePositives)
      : 0,
  };
}
