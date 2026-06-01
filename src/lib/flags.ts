// lib/flags.ts — control central de features v3. Default OFF = comportamiento v3.0 intacto.
export const FLAGS = {
  M1_reclamaciones: false,   // Redactor de reclamaciones (T3)
  M2_prediccion_sla: false,  // Predicción de lag/SLA por carrier×ciudad
  M4_automapeo: false,       // Auto-mapeo asistido de formatos TCC
  M5_recall_loop: false,     // Loop HITL → recalibración de umbral C7
} as const;
export type FlagKey = keyof typeof FLAGS;
