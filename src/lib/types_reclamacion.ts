// lib/types_reclamacion.ts — tipos para reclamaciones a transportadoras (M1)
// NO modificar types/index.ts existente. Este archivo importa de él si necesita el tipo de fila.
import type { CarrierId } from './types';

export type ReclamacionMotivo = 'discrepancia_monto' | 'pago_no_acreditado' | 'lag_excesivo';
export type ReclamacionEstado = 'borrador' | 'revisada' | 'enviada';

export interface Reclamacion {
  id: string;                 // `rec_${guia}`
  guia: string;
  carrier: CarrierId;
  carrierLegible: string;
  montoEsperado: number;
  montoReportado: number | null;
  diferencia: number;
  fecha: string;
  motivo: ReclamacionMotivo;
  estado: ReclamacionEstado;
  textoGenerado: string;      // redactado por IA o fallback
  fuente: string;             // trazabilidad: "Reporte {carrier} · {fecha}"
  creadaEn: string;           // ISO
}
