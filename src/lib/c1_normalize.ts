/**
 * C1 — Normalización multi-transportadora (RF-C1-1 a RF-C1-5)
 *
 * Parsea los 4 formatos heterogéneos de carrier_raw + TCC desconocido
 * y los normaliza a GuiaNormalizada + C1Alert.
 */

import type {
  CarrierRaw,
  GuiaNormalizada,
  C1Alert,
  CarrierId,
} from './types';
import { parseMontoCOP, parseFecha } from './normalize';

/**
 * Mapeo de estados crudos → estado canónico por carrier.
 */
const ESTADO_MAP: Record<string, Record<string, string>> = {
  interrapidisimo: {
    'ENTREGADO': 'entregado',
    'EN REPARTO': 'en_reparto',
    'DEVUELTO': 'devuelto',
  },
  coordinadora: {
    'Entregado': 'entregado',
    'EnRuta': 'en_reparto',
    'Devuelto': 'devuelto',
  },
  servientrega: {
    '200': 'entregado',
    '150': 'en_reparto',
    '400': 'devuelto',
    '0': 'novedad',
  },
  envia: {
    'Entregado OK': 'entregado',
    'En reparto': 'en_reparto',
    'Devuelto al origen': 'devuelto',
    '': 'novedad',
  },
};

/**
 * Normaliza el número de guía de una orden al formato del carrier_raw.
 * Ej: "IR-2400100123" → "2400100123", "CO-99000001" → "99000001",
 *     "SE-77000001" → "SE77000001" (solo quita el guion), "EN-CD00001" → "EN-CD00001" (ya igual).
 */
export function normalizeGuiaForCarrier(guia: string, carrier: CarrierId): string {
  switch (carrier) {
    case 'interrapidisimo':
      // "IR-2400100123" → "2400100123"
      return guia.replace(/^IR-/, '');
    case 'coordinadora':
      // "CO-99000001" → "99000001"
      return guia.replace(/^CO-/, '');
    case 'servientrega':
      // "SE-77000001" → "SE77000001"
      return guia.replace('SE-', 'SE');
    case 'envia':
      // "EN-CD00001" → ya viene así en carrier_raw
      return guia;
  }
}

/**
 * Parsea Interrapidisimo CSV.
 * Header: guia,estado_envio,valor_recaudo,fecha_pago,ciudad
 * Monto: "85.000" (miles con punto)
 * Fecha: DD/MM/YYYY
 */
export function parseInterrapidisimo(
  raw: string,
  timestamp: string
): { guias: GuiaNormalizada[]; errores: string[] } {
  const lines = raw.trim().split('\n');
  const guias: GuiaNormalizada[] = [];
  const errores: string[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 4) {
      errores.push(`Interrapidisimo línea ${i + 1}: formato incompleto`);
      continue;
    }

    const [guia, estadoCrudo, montoRaw, fechaRaw, ciudad] = parts;
    const monto = parseMontoCOP(montoRaw);
    const fecha = parseFecha(fechaRaw);
    const estado = ESTADO_MAP.interrapidisimo[estadoCrudo?.trim()] ?? 'novedad';

    guias.push({
      guia_id: guia.trim(),
      estado: estado as GuiaNormalizada['estado'],
      monto,
      fecha,
      transportadora: 'interrapidisimo',
      timestamp,
      raw_line: lines[i],
    });
  }

  return { guias, errores };
}

/**
 * Parsea Coordinadora CSV.
 * Header: NumeroGuia;Estado;ValorCOD;FechaLiquidacion
 * Monto: "85000.00" (decimal con punto)
 * Fecha: YYYY-MM-DD
 */
export function parseCoordinadora(
  raw: string,
  timestamp: string
): { guias: GuiaNormalizada[]; errores: string[] } {
  const lines = raw.trim().split('\n');
  const guias: GuiaNormalizada[] = [];
  const errores: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 4) {
      errores.push(`Coordinadora línea ${i + 1}: formato incompleto`);
      continue;
    }

    const [guia, estadoCrudo, montoRaw, fechaRaw] = parts;
    const monto = parseMontoCOP(montoRaw);
    const fecha = parseFecha(fechaRaw);
    const estado = ESTADO_MAP.coordinadora[estadoCrudo?.trim()] ?? 'novedad';

    guias.push({
      guia_id: guia.trim(),
      estado: estado as GuiaNormalizada['estado'],
      monto,
      fecha,
      transportadora: 'coordinadora',
      timestamp,
      raw_line: lines[i],
    });
  }

  return { guias, errores };
}

/**
 * Parsea Servientrega JSONL.
 * Formato: {"guia_servientrega": str, "status_code": int, "monto_recaudado": number, "fecha": "YYYY-MM-DD"}
 */
export function parseServientrega(
  raw: string,
  timestamp: string
): { guias: GuiaNormalizada[]; errores: string[] } {
  const lines = raw.trim().split('\n');
  const guias: GuiaNormalizada[] = [];
  const errores: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(lines[i]);
    } catch {
      errores.push(`Servientrega línea ${i + 1}: JSON inválido`);
      continue;
    }

    const guia = (obj.guia_servientrega as string) ?? '';
    const statusCode = String(obj.status_code ?? '0');
    const monto = typeof obj.monto_recaudado === 'number'
      ? Math.round(obj.monto_recaudado)
      : null;
    const fecha = parseFecha(obj.fecha as string ?? '');
    const estado = ESTADO_MAP.servientrega[statusCode] ?? 'novedad';

    guias.push({
      guia_id: guia.trim(),
      estado: estado as GuiaNormalizada['estado'],
      monto,
      fecha,
      transportadora: 'servientrega',
      timestamp,
      raw_line: lines[i],
    });
  }

  return { guias, errores };
}

/**
 * Parsea Envía CSV (tipo Excel con campos vacíos y texto libre).
 * Header: Guía,Novedad,Recaudo (COP),Fecha de pago,Observación
 * Monto: "$ 85.000" o vacío
 * Fecha: DD-MM-YYYY o vacío
 * Novedad: texto libre — si no mapea por regla, es caso "novedad_texto_libre"
 */
export function parseEnvia(
  raw: string,
  timestamp: string
): { guias: GuiaNormalizada[]; novedadesTextoLibre: { guia: string; texto: string; linea: number }[]; errores: string[] } {
  const lines = raw.trim().split('\n');
  const guias: GuiaNormalizada[] = [];
  const novedadesTextoLibre: { guia: string; texto: string; linea: number }[] = [];
  const errores: string[] = [];

  // Estados mapeables por regla
  const ESTADOS_ENVIA_MAPABLES = new Set(['Entregado OK', 'En reparto', 'Devuelto al origen', '']);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(',');
    if (parts.length < 2) {
      errores.push(`Envía línea ${i + 1}: formato incompleto`);
      continue;
    }

    const [guia, novedad, montoRaw, fechaRaw, ...observacionParts] = parts;
    const observacion = observacionParts.join(',');
    const novedadTrimmed = (novedad ?? '').trim();

    // Detectar si la novedad es texto libre no mapeable
    if (!ESTADOS_ENVIA_MAPABLES.has(novedadTrimmed)) {
      // Texto libre no mapeable por regla → caso novedad_texto_libre
      const guiaId = (guia ?? '').trim();
      novedadesTextoLibre.push({
        guia: guiaId,
        texto: novedadTrimmed,
        linea: i + 1,
      });

      // Aún así emitimos la guía normalizada con estado "novedad"
      guias.push({
        guia_id: guiaId,
        estado: 'novedad',
        monto: null,
        fecha: null,
        transportadora: 'envia',
        timestamp,
        raw_line: line,
      });
      continue;
    }

    const monto = parseMontoCOP(montoRaw ?? '');
    const fecha = parseFecha(fechaRaw ?? '');
    const estado = ESTADO_MAP.envia[novedadTrimmed] ?? 'novedad';

    guias.push({
      guia_id: (guia ?? '').trim(),
      estado: estado as GuiaNormalizada['estado'],
      monto,
      fecha,
      transportadora: 'envia',
      timestamp,
      raw_line: line,
    });
  }

  return { guias, novedadesTextoLibre, errores };
}

/**
 * Parsea TCC desconocido → solo genera alertas (RF-C1-4).
 * Formato: pipe-delimited sin header, p.ej. "TCC|0099887766|PAGADO|85000|2026-05-06"
 */
export function parseTCC(
  raw: string
): C1Alert[] {
  if (!raw || raw.trim() === '') return [];

  const lines = raw.trim().split('\n');
  return lines
    .filter(l => l.trim() !== '')
    .map(line => ({
      fuente: 'tcc',
      guia_o_linea: line.trim(),
      razon: 'carrier no reconocido — formato no mapeado',
    }));
}

/**
 * Pipeline C1 completo: normaliza los 4 carriers + TCC.
 * Retorna guias normalizadas, novedades texto libre y alertas.
 */
export function runC1(
  carrierRaw: CarrierRaw,
  timestamp: string = new Date().toISOString()
): {
  guias: GuiaNormalizada[];
  novedadesTextoLibre: { guia: string; texto: string; linea: number }[];
  alertas: C1Alert[];
  errores: string[];
  tasaNormalizacion: number;
} {
  const { guias: ir, errores: irErr } = parseInterrapidisimo(carrierRaw.interrapidisimo_csv, timestamp);
  const { guias: co, errores: coErr } = parseCoordinadora(carrierRaw.coordinadora_csv, timestamp);
  const { guias: se, errores: seErr } = parseServientrega(carrierRaw.servientrega_jsonl, timestamp);
  const { guias: en, novedadesTextoLibre, errores: enErr } = parseEnvia(carrierRaw.envia_csv, timestamp);
  const alertas = parseTCC(carrierRaw.tcc_desconocido_raw);

  const allGuias = [...ir, ...co, ...se, ...en];
  const allErrores = [...irErr, ...coErr, ...seErr, ...enErr];
  const totalFilas = allGuias.length + alertas.length;

  return {
    guias: allGuias,
    novedadesTextoLibre,
    alertas,
    errores: allErrores,
    tasaNormalizacion: totalFilas > 0 ? allGuias.length / totalFilas : 0,
  };
}
