// components/CalibracionPanel.tsx (NUEVO — M5.3)
// Panel de calibración de umbral C7 por carrier. Solo Vista Evaluador.
'use client';

import type { CalibracionResultado } from '@/lib/threshold_calibrator';

const CARRIER_DISPLAY_NAMES: Record<string, string> = {
  interrapidisimo: 'Interrapidísimo',
  coordinadora: 'Coordinadora',
  servientrega: 'Servientrega',
  envia: 'Envía',
  tcc: 'TCC',
};

export default function CalibracionPanel({
  calibraciones,
  onAplicar,
}: {
  calibraciones: CalibracionResultado[];
  onAplicar: (carrier: string, umbral: number) => void;
}) {
  if (calibraciones.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          🎯 Calibración de Umbral C7
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500">
            Aún no hay suficientes decisiones HITL para recalibrar. Toma al menos 5 decisiones por carrier.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        🎯 Calibración de Umbral C7
      </h2>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs text-amber-700">
          ⚠️ <strong>Loop cableado:</strong> En el prototipo aprende del feedback de la sesión.
          En producción: histórico real + n suficiente por carrier.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {calibraciones.map((cal) => (
          <div
            key={cal.carrier}
            className="bg-white border border-gray-200 rounded-lg p-4 space-y-3"
          >
            {/* Header */}
            <h3 className="text-sm font-semibold text-gray-800">
              {CARRIER_DISPLAY_NAMES[cal.carrier] ?? cal.carrier}
            </h3>

            {/* Umbrales */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Umbral actual</p>
                <p className="font-mono font-bold text-lg">${cal.umbralActualCOP.toLocaleString('es-CO')}</p>
              </div>
              <div>
                <p className="text-gray-500">Umbral sugerido</p>
                <p className={`font-mono font-bold text-lg ${cal.umbralSugeridoCOP !== cal.umbralActualCOP ? 'text-embarca-DEFAULT' : 'text-gray-400'}`}>
                  ${cal.umbralSugeridoCOP.toLocaleString('es-CO')}
                </p>
              </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-gray-500">Recall est.</p>
                <p className="font-mono font-medium">{(cal.recallEstimado * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-gray-500">Precisión est.</p>
                <p className="font-mono font-medium">{(cal.precisionEstimada * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-gray-500">Muestras</p>
                <p className="font-mono font-medium">{cal.muestras}</p>
              </div>
            </div>

            {/* Mini barra de confirm vs descart */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600">✅ {cal.confirmarCount}</span>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{
                    width: `${cal.muestras > 0 ? (cal.confirmarCount / cal.muestras) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-gray-400">❌ {cal.descartarCount}</span>
            </div>

            {/* Botones */}
            {cal.umbralSugeridoCOP !== cal.umbralActualCOP && cal.muestras >= 5 ? (
              <div className="flex gap-2">
                <button
                  onClick={() => onAplicar(cal.carrier, cal.umbralSugeridoCOP)}
                  className="px-3 py-1.5 text-xs bg-embarca-DEFAULT text-white rounded-lg hover:bg-embarca-dark"
                >
                  Aplicar umbral sugerido
                </button>
                <span className="text-xs text-gray-400 self-center">o mantener actual</span>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                {cal.muestras < 5 ? `Se necesitan al menos 5 muestras (actual: ${cal.muestras})` : 'Umbral óptimo'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
