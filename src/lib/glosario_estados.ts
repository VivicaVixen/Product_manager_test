/**
 * C2: Glosario de estados y clases — explicaciones para el usuario
 * Usado por los tooltips de los badges en la tabla "Mis envíos".
 */

export const GLOSARIO = {
  clase: {
    cobrado: {
      titulo: 'Cobrado',
      detalle: 'La transportadora ya te acreditó este envío. El monto coincide con lo esperado.',
      accion: 'No requiere acción.',
    },
    pendiente_acreditacion: {
      titulo: 'Pendiente de acreditación',
      detalle: 'El envío se entregó pero la transportadora aún no te ha transferido el dinero.',
      accion: 'Espera o reclama si lleva demasiado tiempo sin acreditación.',
    },
    discrepancia: {
      titulo: 'Discrepancia',
      detalle: 'El monto que reportó la transportadora no coincide con lo que esperabas cobrar.',
      accion: 'Revisa y decide: confirmar, descartar o reclamar.',
    },
  },
  estado: {
    pendiente: {
      titulo: 'Pendiente',
      detalle: 'Esta fila espera tu decisión. El sistema no pudo resolverla automáticamente.',
      accion: 'Haz clic en "Decidir" o "Revisar" para resolverla.',
    },
    resuelto: {
      titulo: 'Resuelto',
      detalle: 'Ya tomaste una decisión sobre este envío.',
      accion: 'Ninguna.',
    },
    con_alerta: {
      titulo: 'Con alerta',
      detalle: 'El sistema detectó una posible anomalía de cobro en este envío.',
      accion: 'Revísala antes de cerrar el envío.',
    },
  },
} as const;

export type ClaseKey = keyof typeof GLOSARIO.clase;
export type EstadoKey = keyof typeof GLOSARIO.estado;
