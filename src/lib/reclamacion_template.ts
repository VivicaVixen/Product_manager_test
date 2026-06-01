// lib/reclamacion_template.ts — Generador determinista de reclamaciones (fallback M1)
// Sin IA. Plantilla fija con tono formal, neutro, en español colombiano.
import type { CarrierId } from './types';
import type { ReclamacionMotivo } from './types_reclamacion';

const CARRIER_LEGIBLE: Record<string, string> = {
  interrapidisimo: 'Interrapidísimo',
  coordinadora: 'Coordinadora',
  servientrega: 'Servientrega',
  envia: 'Envía',
  tcc: 'TCC',
};

const MOTIVO_LABEL: Record<ReclamacionMotivo, string> = {
  discrepancia_monto: 'discrepancia en el monto reportado',
  pago_no_acreditado: 'pago no acreditado',
  lag_excesivo: 'retraso excesivo en la remesa',
};

export function buildReclamacionDeterminista(
  guia: string,
  carrier: CarrierId,
  montoEsperado: number,
  montoReportado: number | null,
  diferencia: number,
  fecha: string,
  motivo: ReclamacionMotivo
): string {
  const carrierNombre = CARRIER_LEGIBLE[carrier] ?? carrier;
  const diffFormatted = diferencia.toLocaleString('es-CO');
  const esperadoFormatted = montoEsperado.toLocaleString('es-CO');
  const reportadoStr = montoReportado !== null
    ? `$${montoReportado.toLocaleString('es-CO')} COP`
    : 'no reportado';
  const fechaFormatted = fecha;

  return (
    `Señores ${carrierNombre}.\n\n` +
    `Por medio de la presente solicitamos revisión y reintegro correspondiente al envío con guía N.º ${guia}, ` +
    `con fecha de despacho ${fechaFormatted}, el cual presenta ${MOTIVO_LABEL[motivo]}. ` +
    `El monto esperado de remesa era de $${esperadoFormatted} COP, ` +
    `y el monto reportado por su operación fue de ${reportadoStr}, ` +
    `lo que genera una diferencia de $${diffFormatted} COP a favor de nuestro representado.\n\n` +
    `Agradecemos su gestión para la verificación de este caso y el reintegro del valor referido ` +
    `en el próximo ciclo de remesa. Quedamos atentos a su respuesta.`
  );
}
