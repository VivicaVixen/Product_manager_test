// lib/tcc_reader.ts — Lectura de filas TCC aisladas (M4.1)
// LEER sin modificar C1. Expone las filas crudas del formato TCC para el módulo de automapeo.
import type { CarrierRaw, C1Alert } from './types';

export interface TccRawSample {
  headers: string[];     // columnas inferidas del formato pipe-delimited
  rows: string[][];      // 2-3 filas de muestra
  rawLines: string[];    // todas las líneas crudas
  alerts: C1Alert[];     // alertas C1 existentes para TCC
}

/**
 * Extrae una muestra de las filas TCC aisladas por C1.
 * No modifica C1 — solo lee el output existente del carrier_raw.
 */
export function getTccRawSample(carrierRaw: CarrierRaw, existingAlerts: C1Alert[]): TccRawSample {
  const raw = carrierRaw.tcc_desconocido_raw ?? '';
  if (!raw || raw.trim() === '') {
    return { headers: [], rows: [], rawLines: [], alerts: [] };
  }

  const lines = raw.trim().split('\n').filter((l) => l.trim() !== '');
  const tccAlerts = existingAlerts.filter((a) => a.fuente === 'tcc');

  // El formato TCC es pipe-delimited sin header
  // Inferir headers genéricos basados en la estructura
  const firstRow = lines[0]?.split('|') ?? [];
  const headersGenericos = inferirHeadersTCC(firstRow.length);

  const rows: string[][] = lines.slice(0, 3).map((l) => l.split('|').map((c) => c.trim()));

  return {
    headers: headersGenericos,
    rows,
    rawLines: lines,
    alerts: tccAlerts,
  };
}

/** Inferir nombres de columnas basados en la posición en el formato TCC típico. */
function inferirHeadersTCC(numCols: number): string[] {
  const headersBase = ['prefijo', 'guia', 'estado', 'monto', 'fecha'];
  if (numCols <= headersBase.length) {
    return headersBase.slice(0, numCols);
  }
  // Si hay más columnas, agregar genéricas
  const extra = numCols - headersBase.length;
  const extras = Array.from({ length: extra }, (_, i) => `col_${i + 1}`);
  return [...headersBase, ...extras];
}

/** Esquema canónico de Faro (las columnas que necesitamos mapear). */
export const SCHEMA_CANONICO = [
  'guia',
  'estado',
  'monto',
  'fecha',
  'transportadora',
] as const;
