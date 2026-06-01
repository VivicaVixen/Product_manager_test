/**
 * Feature Stretch (post-G4): Pronóstico de caja COD + semáforo de remesa
 *
 * Motor determinista que:
 * 1. Calcula el lag mediano de pago por carrier (histórico del dataset).
 * 2. Proyecta la remesa para órdenes despachadas sin pagar.
 * 3. Marca con semáforo la transportadora que "paga más lento que su patrón".
 *
 * D19: "Predice por transportadora cuándo y cuánto entra para las órdenes
 * despachadas aún sin pagar, y marca proactivamente a la transportadora
 * que está pagando más lento que su propio patrón histórico."
 */

import type {
  Orden,
  GroundTruth,
  ConciliacionResultado,
  CarrierId,
} from './types';
import { diasEntre } from './normalize';

const HOY = new Date('2026-05-31');

// Perfil esperado de lag por carrier (del dataset_spec.json)
const LAG_ESPERADO: Record<CarrierId, { mediana: number; normal: [number, number] }> = {
  interrapidisimo: { mediana: 3, normal: [2, 4] },
  coordinadora: { mediana: 4, normal: [3, 6] },
  servientrega: { mediana: 5, normal: [4, 7] },
  envia: { mediana: 5, normal: [3, 7] },
};

export interface CarrierForecast {
  carrier: CarrierId;
  lagMedianoHistorico: number;
  lagMedianoActual: number;
  totalPorCobrarCOP: number;
  ordenesPendientes: number;
  proyeccionEntradaCOP: number;
  diasProyectadosEntrada: number;
  semafaro: 'verde' | 'amarillo' | 'rojo';
  senal: string;
}

export interface CashForecast {
  carriers: CarrierForecast[];
  totalPorCobrarCOP: number;
  totalProyectadoCOP: number;
  riesgoAtrasoCOP: number;
  resumenNarrado: string;
}

/**
 * Ejecuta el pronóstico de caja COD sobre el estado actual.
 */
export function runCashForecast(
  ordenes: Orden[],
  groundTruth: GroundTruth[],
  conciliaciones: ConciliacionResultado[]
): CashForecast {
  // =========================================================================
  // PASO 1: Calcular lag histórico por carrier (órdenes ya cobradas)
  // =========================================================================
  const lagsPorCarrier = new Map<CarrierId, number[]>();

  for (const gt of groundTruth) {
    if (gt.true_status !== 'entregado_pagado') continue;
    if (gt.monto_real === null) continue;

    // Buscar la orden correspondiente
    const orden = ordenes.find(o =>
      o.carrier === gt.carrier &&
      `${o.carrier}::${o.guia}`.includes(gt.guia)
    );
    if (!orden) continue;

    // Buscar la conciliación para obtener la fecha de pago
    const conc = conciliaciones.find(c =>
      c.carrier === gt.carrier &&
      c.guia === gt.guia
    );
    if (!conc || !conc.monto_reportado) continue;

    // Calcular lag (días desde despacho hasta hoy, como proxy de pago)
    const lag = diasEntre(orden.fecha_despacho, HOY.toISOString().split('T')[0]);
    if (lag > 0) {
      const list = lagsPorCarrier.get(gt.carrier) ?? [];
      list.push(lag);
      lagsPorCarrier.set(gt.carrier, list);
    }
  }

  // Mediana de lags por carrier
  const lagMedianoPorCarrier = new Map<CarrierId, number>();
  for (const [carrier, lags] of lagsPorCarrier) {
    lags.sort((a, b) => a - b);
    const mid = Math.floor(lags.length / 2);
    lagMedianoPorCarrier.set(
      carrier,
      lags.length % 2 === 0 ? (lags[mid - 1] + lags[mid]) / 2 : lags[mid]
    );
  }

  // =========================================================================
  // PASO 2: Identificar órdenes pendientes de pago (pendiente_acreditacion)
  // =========================================================================
  const pendientesPorCarrier = new Map<CarrierId, { count: number; totalCOP: number; ordenes: Orden[] }>();

  for (const c of conciliaciones) {
    if (c.clase !== 'pendiente_acreditacion') continue;

    const orden = ordenes.find(o =>
      o.carrier === c.carrier &&
      (o.guia === c.guia || `${o.carrier}::${o.guia}`.includes(c.guia))
    );
    if (!orden) continue;

    const entry = pendientesPorCarrier.get(c.carrier) ?? { count: 0, totalCOP: 0, ordenes: [] };
    entry.count++;
    entry.totalCOP += orden.monto_esperado_cod;
    entry.ordenes.push(orden);
    pendientesPorCarrier.set(c.carrier, entry);
  }

  // =========================================================================
  // PASO 3: Proyección por carrier + semáforo
  // =========================================================================
  const carriers: CarrierForecast[] = [];
  let totalPorCobrarCOP = 0;
  let totalProyectadoCOP = 0;
  let riesgoAtrasoCOP = 0;

  const allCarriers: CarrierId[] = ['interrapidisimo', 'coordinadora', 'servientrega', 'envia'];

  for (const carrier of allCarriers) {
    const pendientes = pendientesPorCarrier.get(carrier) ?? { count: 0, totalCOP: 0, ordenes: [] };
    const lagHistorico = lagMedianoPorCarrier.get(carrier) ?? LAG_ESPERADO[carrier].mediana;
    const esperado = LAG_ESPERADO[carrier];

    // Calcular lag actual de las órdenes pendientes (días desde despacho hasta hoy)
    const lagsActuales = pendientes.ordenes.map(o =>
      diasEntre(o.fecha_despacho, HOY.toISOString().split('T')[0])
    ).filter(l => l > 0);

    const lagActual = lagsActuales.length > 0
      ? lagsActuales.sort((a, b) => a - b)[Math.floor(lagsActuales.length / 2)]
      : 0;

    // Proyección: días restantes para entrada
    const diasProyectados = Math.max(0, lagHistorico - (lagsActuales.length > 0 ? lagsActuales[0] : 0) + 1);

    // Semáforo
    let semafaro: 'verde' | 'amarillo' | 'rojo' = 'verde';
    let senal = 'Dentro de patrón normal';

    if (lagActual > esperado.normal[1]) {
      semafaro = 'rojo';
      senal = `Paga más lento que su patrón (lag ${lagActual}d > ${esperado.normal[1]}d esperado)`;
      riesgoAtrasoCOP += pendientes.totalCOP;
    } else if (lagActual > esperado.mediana) {
      semafaro = 'amarillo';
      senal = `Ligeramente retrasado (lag ${lagActual}d vs mediana ${esperado.mediana}d)`;
    }

    carriers.push({
      carrier,
      lagMedianoHistorico: Math.round(lagHistorico),
      lagMedianoActual: lagActual,
      totalPorCobrarCOP: pendientes.totalCOP,
      ordenesPendientes: pendientes.count,
      proyeccionEntradaCOP: pendientes.totalCOP,
      diasProyectadosEntrada: diasProyectados,
      semafaro,
      senal,
    });

    totalPorCobrarCOP += pendientes.totalCOP;
    totalProyectadoCOP += pendientes.totalCOP;
  }

  // =========================================================================
  // PASO 4: Resumen narrado (fallback determinista — mismo patrón que IA summary)
  // =========================================================================
  const resumenNarrado = generateForecastNarrative(carriers, totalPorCobrarCOP, riesgoAtrasoCOP);

  return {
    carriers,
    totalPorCobrarCOP,
    totalProyectadoCOP,
    riesgoAtrasoCOP,
    resumenNarrado,
  };
}

function generateForecastNarrative(
  carriers: CarrierForecast[],
  totalPorCobrar: number,
  riesgoAtraso: number
): string {
  const parts: string[] = [];

  parts.push(
    `Pronóstico de caja COD: hay $${(totalPorCobrar / 1_000_000).toFixed(1)}M pendientes de remesa.`
  );

  // Carrier en rojo
  const enRojo = carriers.filter(c => c.semafaro === 'rojo');
  if (enRojo.length > 0) {
    const noms = enRojo.map(c => `${c.carrier} ($${(c.totalPorCobrarCOP / 1_000_000).toFixed(1)}M en riesgo)`).join(', ');
    parts.push(`⚠️ ${noms} están pagando más lento que su patrón histórico.`);
  }

  // Carrier en amarillo
  const enAmarillo = carriers.filter(c => c.semafaro === 'amarillo');
  if (enAmarillo.length > 0) {
    const noms = enAmarillo.map(c => c.carrier).join(', ');
    parts.push(`⚡ ${noms} muestran ligeros retrasos respecto a su mediana.`);
  }

  // Carrier en verde
  const enVerde = carriers.filter(c => c.semafaro === 'verde' && c.ordenesPendientes > 0);
  if (enVerde.length > 0) {
    const noms = enVerde.map(c => c.carrier).join(', ');
    parts.push(`✅ ${noms} dentro de su patrón normal de remesa.`);
  }

  if (riesgoAtraso > 0) {
    parts.push(`💰 $${(riesgoAtraso / 1_000_000).toFixed(1)}M en riesgo de atraso esta semana.`);
  }

  return parts.join(' ');
}
