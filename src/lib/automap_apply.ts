// lib/automap_apply.ts — Aplicador determinista de mapeo aprobado (M4.3)
// NO usa IA. Aplica el mapeo aprobado de forma 100% determinista.
import type { GuiaNormalizada, CarrierId } from './types';

export type Automapping = Record<string, string | null>; // campoCanonico → nombreColumnaOrigen

/**
 * Aplica un mapeo aprobado a filas crudas TCC.
 * Retorna filas normalizadas listas para visualización.
 * No reinyecta al pipeline C2 real — solo demostración.
 */
export function applyMapping(
  rawRows: string[][],
  mapping: Automapping,
  timestamp: string = new Date().toISOString()
): GuiaNormalizada[] {
  const colIndex = new Map<string, number>();
  for (const [campoCanonico, colOrigen] of Object.entries(mapping)) {
    if (!colOrigen) continue;
    // La columna origen es el nombre; buscamos el índice en la primera fila de headers
    // Los rawRows ya son arrays de valores; asumimos orden posicional
    const idx = getColumnIndex(colOrigen);
    if (idx >= 0) {
      colIndex.set(campoCanonico, idx);
    }
  }

  const normalizadas: GuiaNormalizada[] = [];

  for (const row of rawRows) {
    const guiaIdx = colIndex.get('guia');
    if (guiaIdx === undefined || guiaIdx === undefined) continue;

    const guia = row[guiaIdx] ?? '';
    const estadoRaw = colIndex.has('estado') ? row[colIndex.get('estado')!] ?? 'novedad' : 'novedad';
    const montoRaw = colIndex.has('monto') ? row[colIndex.get('monto')!] ?? null : null;
    const fechaRaw = colIndex.has('fecha') ? row[colIndex.get('fecha')!] ?? null : null;

    const monto = montoRaw ? parseMontoSafe(montoRaw) : null;
    const fecha = fechaRaw ? parseFechaSafe(fechaRaw) : null;

    // Mapear estado al canon
    const estado = mapEstadoCanonico(estadoRaw);

    normalizadas.push({
      guia_id: guia,
      estado,
      monto,
      fecha,
      transportadora: 'tcc' as CarrierId,
      timestamp,
      raw_line: row.join('|'),
    });
  }

  return normalizadas;
}

/** Mapeo posicional: los headers genéricos del TCC corresponden a índices. */
function getColumnIndex(colName: string): number {
  const known: Record<string, number> = {
    'prefijo': 0,
    'guia': 1,
    'estado': 2,
    'monto': 3,
    'fecha': 4,
    'col_1': 5,
    'col_2': 6,
    'col_3': 7,
  };
  return known[colName] ?? -1;
}

function parseMontoSafe(raw: string): number | null {
  const cleaned = raw.replace(/[.$,]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

function parseFechaSafe(raw: string): string | null {
  // Aceptar YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Aceptar DD/MM/YYYY
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

function mapEstadoCanonico(raw: string): 'entregado' | 'en_reparto' | 'devuelto' | 'novedad' {
  const lower = raw.toLowerCase();
  if (lower.includes('entreg') || lower.includes('pagad')) return 'entregado';
  if (lower.includes('repart') || lower.includes('transit')) return 'en_reparto';
  if (lower.includes('devolv') || lower.includes('retorn')) return 'devuelto';
  return 'novedad';
}
