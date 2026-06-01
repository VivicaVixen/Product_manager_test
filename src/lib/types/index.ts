// ============================================================================
// Tipos compartidos para el Conciliador Inteligente — Embarca IA-First
// Contrato: dataset_spec.json §entidades
// ============================================================================

// --- Orden (libro de verdad de Embarca) ---
export interface Orden {
  order_id: string;          // p.ej. "EMB-100001"
  guia: string;              // número de guía del carrier
  carrier: CarrierId;
  tipo_pago: "COD";
  monto_esperado_cod: number; // COP entero
  fecha_despacho: string;     // YYYY-MM-DD
  vendedor_id: string;        // p.ej. "V-0420"
  ciudad_destino: string;
}

// --- Ground Truth (etiqueta verdadera por guía) ---
export interface GroundTruth {
  guia: string;
  carrier: CarrierId;
  true_status: TrueStatus;
  monto_esperado: number | null;
  monto_real: number | null;
  is_discrepancy: boolean;
  discrepancy_type: DiscrepancyType;
  is_anomaly: boolean;
  anomaly_reason: AnomalyReason;
  expected_c2_class: C2Class;
  expected_needs_hitl: boolean;
  expected_c7_flag: boolean;
  expected_estado_canonico: EstadoCanonico | null;
}

// --- Guía Normalizada (salida de C1) ---
export interface GuiaNormalizada {
  guia_id: string;
  estado: EstadoCanonico;
  monto: number | null;       // null si campo faltante
  fecha: string | null;       // ISO YYYY-MM-DD, null si campo faltante
  transportadora: CarrierId;
  timestamp: string;          // ISO del procesamiento
  raw_line?: string;          // para trazabilidad de error
}

// --- Alerta C1 (formato desconocido / TCC) ---
export interface C1Alert {
  fuente: string;             // p.ej. "tcc"
  guia_o_linea: string;
  razon: string;
}

// --- Resultado de Conciliación (salida de C2) ---
export interface ConciliacionResultado {
  guia: string;
  carrier: CarrierId;
  clase: C2Class;             // cobrado | pendiente_acreditacion | discrepancia
  confianza: number;          // 0–100
  monto_esperado: number | null;
  monto_reportado: number | null;
  diferencia_pesos: number | null;
  diferencia_pct: number | null;
  needs_hitl: boolean;
  hitl_reason?: string;
}

// --- Anomalía (salida de C7) ---
export interface AnomaliaResultado {
  guia: string;
  carrier: CarrierId;
  flag: boolean;
  confianza: number;          // 0–100
  razon: AnomalyReason;
  diferencia_pesos: number | null;
  diferencia_pct: number | null;
}

// --- HITL Decision ---
export type HitlDecisionC2 = "cobrado" | "pendiente_acreditacion" | "discrepancia_abierta";
export type HitlDecisionC7 = "confirmar_discrepancia" | "descartar" | "reclamar";

export interface HitlRecord {
  guia: string;
  carrier: CarrierId;
  tipo: "c2" | "c7";
  decision: HitlDecisionC2 | HitlDecisionC7 | null; // null = pendiente
  nota_usuario?: string;
  timestamp: string;
}

// ============================================================================
// Enums y tipos auxiliares
// ============================================================================

export type CarrierId = "interrapidisimo" | "coordinadora" | "servientrega" | "envia";
export type CarrierDesconocido = "tcc";

export type TrueStatus = "entregado_pagado" | "pendiente" | "discrepancia";

export type DiscrepancyType =
  | "ninguno"
  | "monto_menor"
  | "monto_mayor"
  | "pago_faltante"
  | "pago_huerfano"
  | "guia_duplicada"
  | "monto_ambiguo"
  // Extensiones del dataset generado (casos adicionales válidos)
  | "novedad_texto_libre"
  | "campo_faltante"
  | "discrepancia_bajo_umbral";

export type AnomalyReason =
  | "ninguno"
  | "excede_umbral_fijo"
  | "outlier_estadistico"
  | "patron_transportadora"
  // Extensiones del dataset (stretch feature: pagos tarde)
  | "lag_pago_superado"
  | "outlier_alto_valor"
  | "retraso_excesivo";

export type C2Class = "cobrado" | "pendiente_acreditacion" | "discrepancia";

export type EstadoCanonico = "entregado" | "en_reparto" | "devuelto" | "novedad";

// ============================================================================
// Bundle (estructura de entrada del dataset)
// ============================================================================

export interface BundleInput {
  batch_id: number;
  seed: number;
  orders: Orden[];
  carrier_raw: CarrierRaw;
  ground_truth: GroundTruth[];
  expected_c1_alerts: C1Alert[];
}

export interface CarrierRaw {
  interrapidisimo_csv: string;
  coordinadora_csv: string;
  servientrega_jsonl: string;
  envia_csv: string;
  tcc_desconocido_raw: string;
}

// ============================================================================
// Pronóstico de caja COD (stretch feature)
// ============================================================================

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

// ============================================================================
// Estado global de la aplicación (en memoria)
// ============================================================================

export interface AppState {
  loaded: boolean;
  currentBatch: number;
  orders: Orden[];
  groundTruth: GroundTruth[];
  c1Alerts: C1Alert[];
  guiasNormalizadas: GuiaNormalizada[];
  conciliaciones: ConciliacionResultado[];
  anomalias: AnomaliaResultado[];
  hitlRecords: HitlRecord[];
  metrics: AppMetrics;
  cashForecast: CashForecast;  // Stretch: pronóstico de caja
}

export interface AppMetrics {
  // C1
  tasa_normalizacion: number;       // % filas procesadas sin error
  filas_aisladas: number;           // count de alertas C1

  // C2
  tasa_conciliacion_automatica: number; // % filas cerradas sin HITL
  precision_matching: number;       // % vs ground truth

  // C7
  recall_anomalias: number;         // % discrepancias reales detectadas
  precision_c7: number;             // % anomalías marcadas que son reales
  false_positive_rate: number;      // % descartadas por usuario

  // General
  total_confirmado_cop: number;
  total_pendiente_cop: number;
  total_discrepancias: number;
}
