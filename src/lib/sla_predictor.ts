// lib/sla_predictor.ts — Motor determinista de predicción SLA/lag (M2.2)
// NO usa IA. Calcula media móvil + desviación estándar del histórico → banda de confianza.
import type { HistoricoLagEntry } from '../../data/historico_lag';
import { HISTORICO_LAG } from '../../data/historico_lag';

export interface SLAPrediction {
  carrier: string;
  ciudad: string;
  lagEsperadoDias: number;
  bandaInferior: number;
  bandaSuperior: number;
  tasaFalloEsperada: number;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  confianza: number; // 0–100
}

/**
 * Predice el SLA de pago para un carrier × ciudad dado.
 * Usa las últimas N semanas del histórico (por defecto todas las disponibles).
 */
export function predictSLA(
  carrier: string,
  ciudad: string,
  historico: HistoricoLagEntry[] = HISTORICO_LAG
): SLAPrediction {
  const datos = historico.filter((h) => h.carrier === carrier && h.ciudad === ciudad);

  if (datos.length === 0) {
    // Sin datos → predicción neutra con confianza baja
    return {
      carrier,
      ciudad,
      lagEsperadoDias: 0,
      bandaInferior: 0,
      bandaSuperior: 0,
      tasaFalloEsperada: 0,
      semaforo: 'amarillo',
      confianza: 10,
    };
  }

  // Ordenar por semana (semana 1 = más reciente)
  const ordenados = [...datos].sort((a, b) => a.semana - b.semana);

  // Media móvil de las últimas 4 semanas (más peso a lo reciente)
  const recientes = ordenados.slice(-4);
  const lagMedia = promedio(recientes.map((d) => d.lagDiasMediano));
  const lagStd = desviacionEstandar(recientes.map((d) => d.lagDiasMediano));
  const falloMedia = promedio(recientes.map((d) => d.tasaFallo));

  // Banda de confianza = ±1 desviación estándar
  const bandaInferior = Math.max(0, Math.round((lagMedia - lagStd) * 10) / 10);
  const bandaSuperior = Math.round((lagMedia + lagStd) * 10) / 10;

  // Confianza: función del nº de semanas disponibles (más datos = más confianza)
  const confianza = Math.min(95, 30 + datos.length * 5);

  // Semáforo: comparar lagMedia con la media histórica completa
  const lagHistorico = promedio(ordenados.map((d) => d.lagDiasMediano));
  const desviacion = lagMedia - lagHistorico;
  const semaforo = desviacion > 1.5 ? 'rojo' : desviacion > 0.5 ? 'amarillo' : 'verde';

  return {
    carrier,
    ciudad,
    lagEsperadoDias: Math.round(lagMedia * 10) / 10,
    bandaInferior,
    bandaSuperior,
    tasaFalloEsperada: Math.round(falloMedia * 100) / 100,
    semaforo,
    confianza,
  };
}

/** Genera predicciones para todos los carrier × ciudad disponibles. */
export function predictSLAMatrix(
  carriers: string[] = ['interrapidisimo', 'coordinadora', 'servientrega', 'envia'],
  ciudades: string[] = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga'],
  historico: HistoricoLagEntry[] = HISTORICO_LAG
): SLAPrediction[] {
  const results: SLAPrediction[] = [];
  for (const carrier of carriers) {
    for (const ciudad of ciudades) {
      results.push(predictSLA(carrier, ciudad, historico));
    }
  }
  return results;
}

// --- Utilidades estadísticas ---

function promedio(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function desviacionEstandar(nums: number[]): number {
  if (nums.length < 2) return 0;
  const media = promedio(nums);
  const varianza = nums.reduce((sum, n) => sum + (n - media) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(varianza);
}
