// components/PrediccionSLAPanel.tsx (NUEVO — M2.4)
// Matriz de predicción SLA/lag por carrier × ciudad. Tab condicional.
'use client';

import { useEffect, useState } from 'react';
import type { SLAPrediction } from '@/lib/sla_predictor';
import { predictSLAMatrix } from '@/lib/sla_predictor';

const CARRIER_DISPLAY_NAMES: Record<string, string> = {
  interrapidisimo: 'Interrapidísimo',
  coordinadora: 'Coordinadora',
  servientrega: 'Servientrega',
  envia: 'Envía',
};

const CIUDADES = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga'];
const CARRIERS = ['interrapidisimo', 'coordinadora', 'servientrega', 'envia'];

const SEMAFORO_ICON: Record<string, string> = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };
const SEMAFORO_BG: Record<string, string> = {
  verde: 'bg-emerald-500/10 border-emerald-500/30',
  amarillo: 'bg-amber-500/10 border-amber-500/30',
  rojo: 'bg-red-500/10 border-red-500/30',
};

export default function PrediccionSLAPanel() {
  const [matrix, setMatrix] = useState<SLAPrediction[]>([]);
  const [narrativas, setNarrativas] = useState<Record<string, string>>({});
  const [carrierFiltro, setCarrierFiltro] = useState('todos');
  const [loadingNarrativas, setLoadingNarrativas] = useState(false);

  useEffect(() => {
    const datos = predictSLAMatrix(CARRIERS, CIUDADES);
    setMatrix(datos);
  }, []);

  // M2.3: Fetch narrativas IA en batch
  useEffect(() => {
    if (matrix.length === 0) return;
    const fetchNarrativas = async () => {
      setLoadingNarrativas(true);
      const narrs: Record<string, string> = {};
      for (const pred of matrix) {
        const key = `${pred.carrier}::${pred.ciudad}`;
        try {
          const res = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'sla_predict',
              prompt: `Predicción para ${CARRIER_DISPLAY_NAMES[pred.carrier] ?? pred.carrier} en ${pred.ciudad}: lag esperado ${pred.lagEsperadoDias} días (banda ${pred.bandaInferior}–${pred.bandaSuperior}), semáforo ${pred.semaforo}, tasa de fallo esperada ${(pred.tasaFalloEsperada * 100).toFixed(0)}%, confianza ${pred.confianza}%.`,
              payload: {
                carrier: pred.carrier,
                ciudad: pred.ciudad,
                lagEsperadoDias: pred.lagEsperadoDias,
                bandaInferior: pred.bandaInferior,
                bandaSuperior: pred.bandaSuperior,
                semaforo: pred.semaforo,
                confianza: pred.confianza,
              },
            }),
          });
          const data = await res.json();
          narrs[key] = data.text ?? '';
        } catch {
          narrs[key] = `Lag esperado: ${pred.lagEsperadoDias}d, semáforo ${pred.semaforo}.`;
        }
      }
      setNarrativas(narrs);
      setLoadingNarrativas(false);
    };
    fetchNarrativas();
  }, [matrix]);

  const carriersFiltrados = carrierFiltro === 'todos'
    ? CARRIERS
    : CARRIERS.filter((c) => c === carrierFiltro);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-embarca-heading">
          🔮 Predicción de SLA / Lag de Pago
        </h2>
      </div>

      {/* M2.4: Disclaimer visible */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
        <p className="text-xs text-amber-400">
          ⚠️ <strong>Simulación:</strong> Predicción sobre histórico simulado. Bandas de confianza reflejan incertidumbre.
          En producción requiere histórico real multi-temporada.
        </p>
      </div>

      {/* Selector carrier */}
      <div className="flex gap-2 items-center">
        <label className="text-sm text-embarca-text">Filtrar carrier:</label>
        <select
          value={carrierFiltro}
          onChange={(e) => setCarrierFiltro(e.target.value)}
          className="text-sm border border-embarca-border bg-embarca-surfaceAlt text-embarca-text rounded-lg px-3 py-1.5"
        >
          <option value="todos">Todos</option>
          {CARRIERS.map((c) => (
            <option key={c} value={c}>{CARRIER_DISPLAY_NAMES[c]}</option>
          ))}
        </select>
      </div>

      {/* Matriz carrier × ciudad */}
      <div className="bg-embarca-surfaceAlt border border-embarca-border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-embarca-surfaceAlt border-b border-embarca-border">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-embarca-muted text-xs">Carrier</th>
              <th className="text-left px-3 py-2 font-medium text-embarca-muted text-xs">Ciudad</th>
              <th className="text-center px-3 py-2 font-medium text-embarca-muted text-xs">Semáforo</th>
              <th className="text-right px-3 py-2 font-medium text-embarca-muted text-xs">Lag esperado</th>
              <th className="text-right px-3 py-2 font-medium text-embarca-muted text-xs">Banda</th>
              <th className="text-right px-3 py-2 font-medium text-embarca-muted text-xs">Tasa fallo</th>
              <th className="text-center px-3 py-2 font-medium text-embarca-muted text-xs">Confianza</th>
              <th className="text-left px-3 py-2 font-medium text-embarca-muted text-xs">Narrativa IA</th>
            </tr>
          </thead>
          <tbody>
            {carriersFiltrados.map((carrier) =>
              CIUDADES.map((ciudad) => {
                const pred = matrix.find(
                  (m) => m.carrier === carrier && m.ciudad === ciudad
                );
                if (!pred) return null;
                const key = `${pred.carrier}::${pred.ciudad}`;
                const narrativa = narrativas[key] ?? '';
                const bgClass = SEMAFORO_BG[pred.semaforo] ?? '';

                return (
                  <tr key={key} className={`border-b border-embarca-border ${bgClass}`}>
                    <td className="px-3 py-2 font-medium text-xs">
                      {CARRIER_DISPLAY_NAMES[carrier] ?? carrier}
                    </td>
                    <td className="px-3 py-2 text-xs">{ciudad}</td>
                    <td className="px-3 py-2 text-center text-lg">
                      {SEMAFORO_ICON[pred.semaforo]}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {pred.lagEsperadoDias}d
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {pred.bandaInferior}–{pred.bandaSuperior}d
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {(pred.tasaFalloEsperada * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          pred.confianza >= 70
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : pred.confianza >= 40
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {pred.confianza}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-embarca-text max-w-[200px]">
                      {loadingNarrativas ? (
                        <span className="text-embarca-muted/60 italic">Generando...</span>
                      ) : narrativa ? (
                        narrativa
                      ) : (
                        <span className="text-embarca-muted/60">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
