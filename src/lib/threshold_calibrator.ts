// lib/threshold_calibrator.ts — Recalibrador determinista de umbral C7 (M5.2)
// NO modifica c7_anomalies.ts. Solo recomienda un umbral ajustado.
import type { HITLFeedback } from './hitl_feedback';

// Umbrales originales de C7
const UMBRAL_FIJO_COP = 50_000;
const UMBRAL_FIJO_PCT = 3;

// Mínimo de muestras antes de sugerir recalibración
const MUESTRAS_MIN = 5;

export interface CalibracionResultado {
  carrier: string;
  umbralActualCOP: number;
  umbralSugeridoCOP: number;
  recallEstimado: number;   // 0–1
  precisionEstimada: number; // 0–1
  muestras: number;
  confirmarCount: number;
  descartarCount: number;
}

/**
 * Recalibra el umbral C7 para un carrier dado basándose en feedback HITL acumulado.
 * Lógica:
 * - Si muchas anomalías confirmadas están justo DEBAJO del umbral → sugerir BAJARlo.
 * - Si muchas descartadas están justo ENCIMA del umbral → sugerir SUBIRlo.
 * - Usa estadística simple (percentiles), sin ML.
 */
export function recalibrate(
  carrier: string,
  feedback: HITLFeedback[]
): CalibracionResultado {
  const carrierFeedback = feedback.filter((f) => f.carrier === carrier);
  const confirmar = carrierFeedback.filter((f) => f.decision === 'confirmar');
  const descartar = carrierFeedback.filter((f) => f.decision === 'descartar');
  const muestras = carrierFeedback.length;

  // Si no hay suficientes muestras → sugerir umbral actual
  if (muestras < MUESTRAS_MIN) {
    return {
      carrier,
      umbralActualCOP: UMBRAL_FIJO_COP,
      umbralSugeridoCOP: UMBRAL_FIJO_COP,
      recallEstimado: confirmar.length / Math.max(1, confirmar.length + 1),
      precisionEstimada: confirmar.length / Math.max(1, muestras),
      muestras,
      confirmarCount: confirmar.length,
      descartarCount: descartar.length,
    };
  }

  // Calcular umbral sugerido:
  // - Para confirmar: percentil 25 de diferencias confirmadas (si están debajo del umbral actual, bajar)
  // - Para descartar: percentil 75 de diferencias descartadas (si están encima, subir)
  const diffsConfirmar = confirmar.map((f) => Math.abs(f.diferencia)).sort((a, b) => a - b);
  const diffsDescartar = descartar.map((f) => Math.abs(f.diferencia)).sort((a, b) => a - b);

  let umbralSugerido = UMBRAL_FIJO_COP;

  if (diffsConfirmar.length >= 2) {
    // Si hay confirmadas por debajo del umbral → bajar umbral para capturarlas
    const confirmBelowUmbra = diffsConfirmar.filter((d) => d < UMBRAL_FIJO_COP);
    if (confirmBelowUmbra.length > 0) {
      // Percentil 90 de las confirmadas debajo del umbral (capturar la mayoría)
      const p90Idx = Math.min(confirmBelowUmbra.length - 1, Math.ceil(confirmBelowUmbra.length * 0.9));
      const nuevoUmbral = confirmBelowUmbra[p90Idx];
      if (nuevoUmbral < umbralSugerido) {
        umbralSugerido = Math.max(10_000, nuevoUmbral); // piso mínimo 10K
      }
    }
  }

  if (diffsDescartar.length >= 2) {
    // Si hay descartadas por encima del umbral → subir umbral para evitar falsos positivos
    const discardAboveUmbra = diffsDescartar.filter((d) => d >= UMBRAL_FIJO_COP);
    if (discardAboveUmbra.length > Math.max(1, descartar.length * 0.3)) {
      // Percentil 10 de las descartadas encima del umbral
      const p10Idx = Math.max(0, Math.floor(discardAboveUmbra.length * 0.1));
      const nuevoUmbral = discardAboveUmbra[p10Idx];
      if (nuevoUmbral > umbralSugerido) {
        umbralSugerido = Math.min(200_000, nuevoUmbral); // techo máximo 200K
      }
    }
  }

  // Estimación de recall y precisión
  // Recall = confirmadas / (confirmadas + "perdidas" debajo del umbral actual)
  const recallDenominator = confirmar.length + diffsConfirmar.filter((d) => d < UMBRAL_FIJO_COP).length;
  const recallEstimado = confirmar.length / Math.max(1, recallDenominator);

  // Precision = confirmadas / total decisiones
  const precisionEstimada = confirmar.length / Math.max(1, muestras);

  return {
    carrier,
    umbralActualCOP: UMBRAL_FIJO_COP,
    umbralSugeridoCOP: Math.round(umbralSugerido),
    recallEstimado: Math.round(recallEstimado * 100) / 100,
    precisionEstimada: Math.round(precisionEstimada * 100) / 100,
    muestras,
    confirmarCount: confirmar.length,
    descartarCount: descartar.length,
  };
}

/** Recalibra para todos los carriers presentes en el feedback. */
export function recalibrateAll(
  feedback: HITLFeedback[]
): CalibracionResultado[] {
  const carriers = [...new Set(feedback.map((f) => f.carrier))];
  return carriers.map((c) => recalibrate(c, feedback));
}
