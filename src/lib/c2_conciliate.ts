/**
 * C2 — Conciliación automática COD (RF-C2-1 a RF-C2-5)
 *
 * Estrategia de matching (2 pasos):
 * 1. Guía exacta: carrier::guia_id
 * 2. Fallback por carrier+monto: para bundles donde el formato de guía difiere
 *    entre orders y carrier_raw (las guias quedan como "huerfanas" en paso 1)
 */

import type {
  GuiaNormalizada,
  Orden,
  GroundTruth,
  ConciliacionResultado,
  HitlRecord,
} from './types';
import { normalizeGuiaForCarrier } from './c1_normalize';
import { diasEntre } from './normalize';

const TOLERANCIA_TEMPORAL_DIAS = 7;

export function runC2(
  guias: GuiaNormalizada[],
  ordenes: Orden[],
  groundTruth: GroundTruth[],
  hitlRecordsPrevios: HitlRecord[] = []
): {
  resultados: ConciliacionResultado[];
  tasaAutoConciliacion: number;
  precisionMatching: number;
} {
  // Indexar ground truth por clave carrier::guia
  const gtMap = new Map<string, GroundTruth>();
  for (const gt of groundTruth) {
    gtMap.set(`${gt.carrier}::${gt.guia}`, gt);
  }

  // Indexar HITL previos
  const hitlMap = new Map<string, HitlRecord>();
  for (const hr of hitlRecordsPrevios) {
    hitlMap.set(`${hr.tipo}::${hr.guia}`, hr);
  }

  // Órdenes disponibles para matching
  const availableOrders = new Map<string, Orden>();
  for (const orden of ordenes) {
    const key = `${orden.carrier}::${normalizeGuiaForCarrier(orden.guia, orden.carrier)}`;
    availableOrders.set(key, orden);
  }

  const resultados: ConciliacionResultado[] = [];
  let autoConciliadas = 0;
  let matchingCorrecto = 0;

  // =========================================================================
  // PASO 1: Matching por guía exacta
  // =========================================================================
  const guiasSinMatch: { guia: GuiaNormalizada; gt?: GroundTruth; hitlC2?: HitlRecord }[] = [];

  for (const guia of guias) {
    const orderKey = `${guia.transportadora}::${guia.guia_id}`;
    const orden = availableOrders.get(orderKey);
    const gt = gtMap.get(orderKey);
    const hitlC2 = hitlMap.get(`c2::${guia.guia_id}`);

    if (orden) {
      availableOrders.delete(orderKey);
    }

    const resultado = processGuia(guia, orden, gt, hitlC2);

    if (gt && resultado.clase === gt.expected_c2_class) matchingCorrecto++;
    if (!resultado.needs_hitl) autoConciliadas++;
    resultados.push(resultado);

    // Si no encontró orden, guardar para fallback
    if (!orden) {
      guiasSinMatch.push({ guia, gt, hitlC2 });
    }
  }

  // =========================================================================
  // PASO 2: Fallback — matching por carrier + monto para guías huérfanas
  // =========================================================================
  const guiasResueltas = new Set<string>();

  for (const { guia, gt, hitlC2 } of guiasSinMatch) {
    if (guia.monto === null) continue;

    // Buscar orden del mismo carrier con mismo monto y fecha cercana
    const ordenCandidata = Array.from(availableOrders.values()).find(orden => {
      if (orden.carrier !== guia.transportadora) return false;
      if (orden.monto_esperado_cod !== guia.monto) return false;
      if (!guia.fecha) return false;
      const lag = diasEntre(orden.fecha_despacho, guia.fecha);
      return lag >= 0 && lag <= TOLERANCIA_TEMPORAL_DIAS + 3;
    });

    if (ordenCandidata) {
      const orderKey = `${ordenCandidata.carrier}::${normalizeGuiaForCarrier(ordenCandidata.guia, ordenCandidata.carrier)}`;
      availableOrders.delete(orderKey);
      guiasResueltas.add(`${guia.transportadora}::${guia.guia_id}`);

      // Reemplazar el resultado previo (que era pago_huerfano) con el correcto
      const idx = resultados.findIndex(r =>
        r.guia === guia.guia_id && r.carrier === guia.transportadora && r.hitl_reason === 'pago_huerfano'
      );
      if (idx >= 0) {
        const fallbackGt = gtMap.get(orderKey);
        const fallbackHitl = hitlMap.get(`c2::${ordenCandidata.guia}`);

        resultados[idx] = {
          guia: guia.guia_id,
          carrier: ordenCandidata.carrier,
          clase: 'cobrado',
          confianza: 80,
          monto_esperado: ordenCandidata.monto_esperado_cod,
          monto_reportado: guia.monto,
          diferencia_pesos: 0,
          diferencia_pct: 0,
          needs_hitl: false,
          hitl_reason: 'matched_by_monto_fecha',
        };

        // Re-calcular métricas: restar el incorrecto y sumar el correcto
        if (gt && gt.expected_c2_class === 'discrepancia') matchingCorrecto--; // era incorrecto como huerfano=discrepancia
        if (fallbackGt && resultados[idx].clase === fallbackGt.expected_c2_class) matchingCorrecto++;

        // Auto-conciliación: antes era needs_hitl=true (huerfano), ahora false
        autoConciliadas++;
      }
    }
  }

  // =========================================================================
  // PASO 3: Órdenes restantes sin pago (pago_faltante)
  // =========================================================================
  for (const [orderKey, orden] of availableOrders) {
    const gt = gtMap.get(orderKey);
    const hitlC2 = hitlMap.get(`c2::${orden.guia}`);

    const guiaNorm = normalizeGuiaForCarrier(orden.guia, orden.carrier);
    const resultado: ConciliacionResultado = {
      guia: guiaNorm,
      carrier: orden.carrier,
      clase: 'pendiente_acreditacion',
      confianza: 40,
      monto_esperado: orden.monto_esperado_cod,
      monto_reportado: null,
      diferencia_pesos: null,
      diferencia_pct: null,
      needs_hitl: true,
      hitl_reason: 'pago_faltante',
    };

    if (hitlC2 && hitlC2.decision) {
      resultado.clase = hitlC2.decision as ConciliacionResultado['clase'];
      resultado.confianza = 100;
      resultado.needs_hitl = false;
    }

    if (gt && resultado.clase === gt.expected_c2_class) matchingCorrecto++;
    if (!resultado.needs_hitl) autoConciliadas++;
    resultados.push(resultado);
  }

  const total = resultados.length;
  return {
    resultados,
    tasaAutoConciliacion: total > 0 ? autoConciliadas / total : 0,
    precisionMatching: total > 0 ? matchingCorrecto / total : 0,
  };
}

function processGuia(
  guia: GuiaNormalizada,
  orden: Orden | undefined,
  gt: GroundTruth | undefined,
  hitlC2: HitlRecord | undefined
): ConciliacionResultado {
  let resultado: ConciliacionResultado;

  if (guia.monto === null || guia.fecha === null) {
    resultado = {
      guia: guia.guia_id,
      carrier: guia.transportadora,
      clase: 'pendiente_acreditacion',
      confianza: 50,
      monto_esperado: orden?.monto_esperado_cod ?? null,
      monto_reportado: guia.monto,
      diferencia_pesos: null,
      diferencia_pct: null,
      needs_hitl: true,
      hitl_reason: 'campo_faltante',
    };
  }
  else if (!orden) {
    resultado = {
      guia: guia.guia_id,
      carrier: guia.transportadora,
      clase: 'discrepancia',
      confianza: 30,
      monto_esperado: null,
      monto_reportado: guia.monto,
      diferencia_pesos: null,
      diferencia_pct: null,
      needs_hitl: true,
      hitl_reason: 'pago_huerfano',
    };
  }
  else {
    const diffPesos = guia.monto - orden.monto_esperado_cod;
    const diffPct = orden.monto_esperado_cod > 0
      ? Math.abs(diffPesos) / orden.monto_esperado_cod * 100
      : 0;

    const lagDias = guia.fecha ? diasEntre(orden.fecha_despacho, guia.fecha) : null;
    const fueraTolerancia = lagDias !== null && lagDias > TOLERANCIA_TEMPORAL_DIAS;

    if (diffPesos === 0 && !fueraTolerancia) {
      resultado = {
        guia: guia.guia_id,
        carrier: guia.transportadora,
        clase: 'cobrado',
        confianza: 100,
        monto_esperado: orden.monto_esperado_cod,
        monto_reportado: guia.monto,
        diferencia_pesos: 0,
        diferencia_pct: 0,
        needs_hitl: false,
      };
    } else if (diffPesos === 0 && fueraTolerancia) {
      resultado = {
        guia: guia.guia_id,
        carrier: guia.transportadora,
        clase: 'cobrado',
        confianza: 70,
        monto_esperado: orden.monto_esperado_cod,
        monto_reportado: guia.monto,
        diferencia_pesos: 0,
        diferencia_pct: 0,
        needs_hitl: true,
        hitl_reason: `fecha fuera de tolerancia (lag ${lagDias}d > ${TOLERANCIA_TEMPORAL_DIAS}d)`,
      };
    } else {
      const esAnomalia = Math.abs(diffPesos) > 50000 || diffPct > 3;
      resultado = {
        guia: guia.guia_id,
        carrier: guia.transportadora,
        clase: 'discrepancia',
        confianza: esAnomalia ? 20 : 60,
        monto_esperado: orden.monto_esperado_cod,
        monto_reportado: guia.monto,
        diferencia_pesos: diffPesos,
        diferencia_pct: parseFloat(diffPct.toFixed(2)),
        needs_hitl: true,
        hitl_reason: esAnomalia
          ? `discrepancia > umbral (${diffPesos} COP, ${diffPct.toFixed(1)}%)`
          : `discrepancia menor (${diffPesos} COP)`,
      };
    }
  }

  if (hitlC2 && hitlC2.decision) {
    resultado.clase = hitlC2.decision as ConciliacionResultado['clase'];
    resultado.confianza = 100;
    resultado.needs_hitl = false;
  }

  return resultado;
}
