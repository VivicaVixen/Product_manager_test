// data/historico_lag.ts — SIMULADO: histórico sintético para demo de predicción SLA (M2)
// En producción: histórico real de conciliación.
// Estructura: { carrier, ciudad, semana, lagDiasMediano, tasaFallo }
// 4 transportadoras × 5 ciudades × 12 semanas

export interface HistoricoLagEntry {
  carrier: string;
  ciudad: string;
  semana: number;        // 1–12 (semanas atrás)
  lagDiasMediano: number;
  tasaFallo: number;     // 0–1
}

// Patrones base por carrier (lag mediano, tasa de fallo)
const CARRIER_BASE: Record<string, { lag: number; fallo: number }> = {
  interrapidisimo: { lag: 4, fallo: 0.08 },
  coordinadora:    { lag: 5, fallo: 0.12 },
  servientrega:    { lag: 3, fallo: 0.05 },
  envia:           { lag: 6, fallo: 0.15 },
};

const CIUDADES = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga'];

// Variación por ciudad (algunas ciudades son más lentas)
const CIUDAD_DELTA: Record<string, number> = {
  'Bogotá': 0,
  'Medellín': -0.5,
  'Cali': 0.5,
  'Barranquilla': 1.5,
  'Bucaramanga': 1,
};

// Seed determinista para variación pseudo-random
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

export const HISTORICO_LAG: HistoricoLagEntry[] = (() => {
  const rng = seededRandom(42);
  const entries: HistoricoLagEntry[] = [];

  for (const carrier of Object.keys(CARRIER_BASE)) {
    const base = CARRIER_BASE[carrier];
    for (const ciudad of CIUDADES) {
      const ciudadDelta = CIUDAD_DELTA[ciudad] ?? 0;
      for (let semana = 1; semana <= 12; semana++) {
        // Variación aleatoria controlada
        const lagVariacion = (rng() - 0.5) * 2; // ±1 día
        const falloVariacion = (rng() - 0.5) * 0.1; // ±5%
        const lag = Math.max(1, Math.round((base.lag + ciudadDelta + lagVariacion) * 10) / 10);
        const fallo = Math.max(0, Math.min(1, Math.round((base.fallo + falloVariacion) * 100) / 100));
        entries.push({ carrier, ciudad, semana, lagDiasMediano: lag, tasaFallo: fallo });
      }
    }
  }

  return entries;
})();

// SIMULADO — histórico sintético para demo de predicción. En prod: histórico real de conciliación.
