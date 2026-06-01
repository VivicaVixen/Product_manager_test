/**
 * Utilidades de normalización de montos y fechas (C1 — RF-C1-2)
 */

/**
 * Parsea un monto en COP desde distintos formatos:
 * - "85.000" (miles con punto)
 * - "$ 85.000" (con símbolo y espacio)
 * - "85000.00" (decimal con punto)
 * - 85000 (número crudo)
 * - "" (vacío → null)
 * Retorna entero COP o null.
 */
export function parseMontoCOP(raw: string | number): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Math.round(raw);

  let str = raw.trim();
  if (str === '') return null;

  // Quitar símbolo de moneda y espacios
  str = str.replace(/^\$\s*/, '');

  if (str === '') return null;

  // Detectar formato: si tiene punto decimal (.00) → es decimal
  // Si tiene punto como separador de miles (85.000) → quitar puntos
  if (str.includes('.')) {
    const parts = str.split('.');
    // Si la parte después del último punto tiene exactamente 2 dígitos → es decimal
    if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
      // Formato decimal: "85000.00"
      return Math.round(parseFloat(str.replace(/,/g, '')));
    }
    // Formato miles con punto: "85.000"
    return parseInt(str.replace(/\./g, ''), 10);
  }

  // Sin punto: entero directo
  return parseInt(str, 10);
}

/**
 * Parsea una fecha desde distintos formatos a ISO YYYY-MM-DD.
 * - "DD/MM/YYYY" (Interrapidisimo)
 * - "YYYY-MM-DD" (Coordinadora, Servientrega)
 * - "DD-MM-YYYY" (Envía)
 * - "" (vacío → null)
 */
export function parseFecha(raw: string): string | null {
  if (!raw || raw.trim() === '') return null;

  const str = raw.trim();

  // DD/MM/YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY-MM-DD (ya ISO)
  const isoyyyy = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoyyyy) {
    const [, y, m, d] = isoyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-MM-YYYY
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
