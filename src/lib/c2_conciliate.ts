/**
 * C2 — Conciliación automática COD (RF-C2-1 a RF-C2-5)
 *
 * Cruza GuíaNormalizada (C1) contra Orden (libro de Embarca) por guía + monto + fecha.
 * Clasifica: cobrado / pendiente_acreditacion / discrepancia.
 * Calcula confianza. Marca para HITL si confianza < 95%.
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

const CONFIANZA_ALTA = 95;
const TOLERANCIA_TEMPORAL_DIAS = 7;

/**
 * Ejecuta C2 sobre el conjunto completo de guías normalizadas y órdenes.
 *
 * @param guias — salida de C1 (normalizadas)
 * @param ordenes — libro de verdad de Embarca
 * @param groundTruth — etiquetas verdaderas (para comparar precisión)
 * @param hitlRecordsPrevios — decisiones HITL previas que pueden alterar el estado
 */
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
  // Indexar órdenes por guía normalizada (sin prefijo)
  const ordenMap = new Map<string, Orden>();
  for (const orden of ordenes) {
    const guiaNormalizada = normalizeGuiaForCarrier(orden.guia, orden.carrier);
    ordenMap.set(`${orden.carrier}::${guiaNormalizada}`, orden);
  }

  // Indexar ground truth por guía
  const gtMap = new Map<string, GroundTruth>();
  for (const gt of groundTruth) {
    gtMap.set(`${gt.carrier}::${gt.guia}`, gt);
  }

  // Indexar HITL previos
  const hitlMap = new Map<string, HitlRecord>();
  for (const hr of hitlRecordsPrevios) {
    hitlMap.set(`${hr.tipo}::${hr.guia}`, hr);
  }

  const resultados: ConciliacionResultado[] = [];
  let autoConciliadas = 0;
  let matchingCorrecto = 0;

  for (const guia of guias) {
    const key = `${guia.transportadora}::${guia.guia_id}`;
    const orden = ordenMap.get(key);
    const gt = gtMap.get(key);
    const hitlC2 = hitlMap.get(`c2::${guia.guia_id}`);

    let resultado: ConciliacionResultado;

    // Caso: campo faltante (monto o fecha null)
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
    // Caso: no hay orden asociada (pago huérfano)
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
    // Caso: hay orden → matching
    else {
      const diffPesos = guia.monto - orden.monto_esperado_cod;
      const diffPct = orden.monto_esperado_cod > 0
        ? Math.abs(diffPesos) / orden.monto_esperado_cod * 100
        : 0;

      // Verificar tolerancia temporal
      const fechaDespacho = orden.fecha_despacho;
      const fechaPago = guia.fecha;
      const lagDias = fechaPago ? diasEntre(fechaDespacho, fechaPago) : null;
      const fueraTolerancia = lagDias !== null && lagDias > TOLERANCIA_TEMPORAL_DIAS;

      // Matching perfecto
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
      }
      // Monto coincide pero fecha fuera de tolerancia → monto ambiguo
      else if (diffPesos === 0 && fueraTolerancia) {
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
      }
      // Discrepancia de monto
      else {
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

    // Si hay decisión HITL previa, aplicar
    if (hitlC2 && hitlC2.decision) {
      resultado.clase = hitlC2.decision as ConciliacionResultado['clase'];
      resultado.confianza = 100;
      resultado.needs_hitl = false;
    }

    // Comparar con ground truth para precisión
    if (gt) {
      if (resultado.clase === gt.expected_c2_class) {
        matchingCorrecto++;
      }
    }

    if (!resultado.needs_hitl) {
      autoConciliadas++;
    }

    resultados.push(resultado);
  }

  const total = resultados.length;
  return {
    resultados,
    tasaAutoConciliacion: total > 0 ? autoConciliadas / total : 0,
    precisionMatching: total > 0 ? matchingCorrecto / total : 0,
  };
}
