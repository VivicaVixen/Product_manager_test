/**
 * Utilidades de normalización de montos y fechas (C1 — RF-C1-2)
 */

/**
 * Parsea un monto en COP desde distintos formatos. NUNCA retorna NaN.
 */
export function parseMontoCOP(raw: string | number): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;

  let str = raw.trim();
  if (str === '') return null;

  // FIX C4-bis: el CSV de Envía entrega el monto ENTRECOMILLADO ("$ 85.000").
  // El split por coma conservaba las comillas -> parseInt('"$ 85000"') = NaN,
  // que envenenaba la suma del total ($0). Limpiamos comillas, $ y espacios
  // antes de parsear y garantizamos no-NaN.
  str = str.replace(/^["']+|["']+$/g, '').trim();
  str = str.replace(/\$/g, '').replace(/\s+/g, '');

  if (str === '') return null;

  let n: number;
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
      n = Math.round(parseFloat(str.replace(/,/g, '')));
    } else {
      n = parseInt(str.replace(/\./g, ''), 10);
    }
  } else {
    n = parseInt(str.replace(/,/g, ''), 10);
  }

  return Number.isFinite(n) ? n : null;
}

/**
 * Parsea una fecha desde distintos formatos a ISO YYYY-MM-DD.
 */
export function parseFecha(raw: string): string | null {
  if (!raw || raw.trim() === '') return null;

  const str = raw.trim().replace(/^["']+|["']+$/g, '').trim();

  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const isoyyyy = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoyyyy) {
    const [, y, m, d] = isoyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const ddmmmyyyy = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmmyyyy) {
    const [, d, m, y] = ddmmmyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Calcula días entre dos fechas ISO.
 */
export function diasEntre(fecha1: string, fecha2: string): number {
  const d1 = new Date(fecha1);
  const d2 = new Date(fecha2);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}
