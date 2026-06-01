'use client';

import { useEffect, useState, useCallback } from 'react';
import type {
  AppState,
  ConciliacionResultado,
  AnomaliaResultado,
  HitlRecord,
  HitlDecisionC2,
  HitlDecisionC7,
} from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

interface PipelineResponse {
  success: boolean;
  state?: AppState;
  error?: string;
}

// ============================================================================
// Componentes
// ============================================================================

export default function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resumen' | 'discrepancias' | 'metricas'>('resumen');
  const [hitlModal, setHitlModal] = useState<{
    guia: string;
    carrier: string;
    tipo: 'c2' | 'c7';
    razon: string;
    data: ConciliacionResultado | AnomaliaResultado;
  } | null>(null);

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline');
      const data: PipelineResponse = await res.json();
      if (data.success && data.state) {
        setState(data.state);
      } else {
        setError(data.error ?? 'Error desconocido');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const handleSeedReset = async () => {
    await fetch('/api/pipeline', { method: 'POST', body: JSON.stringify({ reset: true }) });
    await loadPipeline();
  };

  const handleHitlDecision = async (
    guia: string,
    carrier: string,
    tipo: 'c2' | 'c7',
    decision: HitlDecisionC2 | HitlDecisionC7,
    nota?: string
  ) => {
    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: {
          guia,
          carrier,
          tipo,
          decision,
          nota_usuario: nota,
          timestamp: new Date().toISOString(),
        },
      }),
    });
    const data: PipelineResponse = await res.json();
    if (data.success && data.state) {
      setState(data.state);
    }
    setHitlModal(null);
  };

  // ========================================================================
  // Render
  // ========================================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando datos de conciliación...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800 font-semibold mb-2">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={loadPipeline}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  if (!state) return null;

  const { metrics, conciliaciones, anomalias, c1Alerts, hitlRecords } = state;

  // Filtrar discrepancias para la tabla
  const discrepancias = conciliaciones.filter(
    (c) => c.clase === 'discrepancia' || c.needs_hitl
  );

  // Filtrar anomalías activas
  const anomaliasActivas = anomalias.filter((a) => a.flag);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Embarca — Conciliador Inteligente</h1>
            <p className="text-sm text-gray-500">
              {state.orders.length} órdenes · {state.currentBatch} batches · {new Date().toLocaleDateString('es-CO')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadPipeline}
              className="px-3 py-1.5 text-sm bg-gray-100 border border-gray-300 rounded hover:bg-gray-200"
            >
              🔄 Recargar
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-sm bg-blue-100 border border-blue-300 text-blue-800 rounded hover:bg-blue-200 print:hidden"
            >
              📄 Exportar
            </button>
            <button
              onClick={handleSeedReset}
              className="px-3 py-1.5 text-sm bg-yellow-100 border border-yellow-300 text-yellow-800 rounded hover:bg-yellow-200"
            >
              🌱 Seed / Reset
            </button>
          </div>
        </div>
      </header>

      {/* Alertas C1 */}
      {c1Alerts.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-sm text-orange-800 font-medium">
              ⚠️ {c1Alerts.length} alerta{c1Alerts.length > 1 ? 's' : ''} de normalización — formato desconocido, requiere mapeo de ops
            </p>
            <details className="mt-1">
              <summary className="text-xs text-orange-600 cursor-pointer">Ver detalles</summary>
              <ul className="mt-1 text-xs text-orange-700 space-y-1">
                {c1Alerts.map((a, i) => (
                  <li key={i}>
                    <code className="bg-orange-100 px-1 rounded">{a.guia_o_linea}</code> — {a.razon}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 pt-4">
        <div className="flex gap-1 border-b border-gray-200">
          {[
            { key: 'resumen' as const, label: ' Resumen' },
            { key: 'discrepancias' as const, label: ` Discrepancias (${discrepancias.length})` },
            { key: 'metricas' as const, label: '📈 Métricas' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'resumen' && (
          <SummaryWidget
            metrics={metrics}
            discrepancias={discrepancias}
            anomaliasActivas={anomaliasActivas}
          />
        )}
        {activeTab === 'discrepancias' && (
          <DiscrepancyTable
            discrepancias={discrepancias}
            anomaliasActivas={anomaliasActivas}
            hitlRecords={hitlRecords}
            onHitl={(guia, carrier, tipo, data) =>
              setHitlModal({
                guia,
                carrier,
                tipo,
                razon: (data as ConciliacionResultado).hitl_reason ?? (data as AnomaliaResultado).razon,
                data,
              })
            }
          />
        )}
        {activeTab === 'metricas' && <MetricsPanel metrics={metrics} />}
      </div>

      {/* HITL Modal */}
      {hitlModal && (
        <HitlModal
          {...hitlModal}
          onConfirm={(decision, nota) =>
            handleHitlDecision(hitlModal.guia, hitlModal.carrier, hitlModal.tipo, decision, nota)
          }
          onCancel={() => setHitlModal(null)}
        />
      )}
    </main>
  );
}

// ============================================================================
// AI Summary Generator (RF-IA-1: Resumen narrado del estado semanal)
// Deterministic fallback — same output an LLM would produce from structured input.
// ============================================================================

function generateAISummary(
  metrics: AppState['metrics'],
  discrepancias: ConciliacionResultado[],
  anomaliasActivas: AnomaliaResultado[]
): string {
  const totalCOP = metrics.total_confirmado_cop + metrics.total_pendiente_cop;
  const totalM = (totalCOP / 1_000_000).toFixed(1);
  const autoRate = (metrics.tasa_conciliacion_automatica * 100).toFixed(0);
  const recall = (metrics.recall_anomalias * 100).toFixed(0);
  const normalizacion = (metrics.tasa_normalizacion * 100).toFixed(0);

  // Transportadoras con más discrepancias
  const discByCarrier = new Map<string, number>();
  for (const d of discrepancias) {
    discByCarrier.set(d.carrier, (discByCarrier.get(d.carrier) ?? 0) + 1);
  }
  const topCarrier = [...discByCarrier.entries()].sort((a, b) => b[1] - a[1])[0];

  // Anomalías por razón
  const anomByReason = new Map<string, number>();
  for (const a of anomaliasActivas) {
    anomByReason.set(a.razon, (anomByReason.get(a.razon) ?? 0) + 1);
  }

  const parts: string[] = [];

  // Apertura
  parts.push(
    `Esta semana se procesaron ${totalM} millones de pesos en conciliación COD.`
  );

  // Auto-conciliación
  if (metrics.tasa_conciliacion_automatica >= 0.7) {
    parts.push(
      `El sistema concilió automáticamente el ${autoRate}% de las transacciones, ` +
      `liberando aproximadamente ${(totalCOP * 0.03 / 1000).toFixed(0)} horas de trabajo manual.`
    );
  } else {
    parts.push(
      `La tasa de auto-conciliación fue del ${autoRate}%, por debajo del target del 80%. ` +
      `Se recomienda revisar los formatos de las transportadoras con mayor tasa de discrepancias.`
    );
  }

  // Discrepancias
  if (discrepancias.length > 0) {
    parts.push(
      `Se detectaron ${discrepancias.length} discrepancias pendientes de revisión.`
    );
    if (topCarrier) {
      parts.push(
        `La transportadora con más incidencias es ${topCarrier[0]} con ${topCarrier[1]} casos.`
      );
    }
  } else {
    parts.push(`No hay discrepancias pendientes — excelente semana.`);
  }

  // Anomalías C7
  if (anomaliasActivas.length > 0) {
    const topReason = [...anomByReason.entries()].sort((a, b) => b[1] - a[1])[0];
    parts.push(
      `El sistema C7 marcó ${anomaliasActivas.length} anomalías ` +
      `(recall: ${recall}%), predominantemente por ${topReason ? topReason[0].replace('_', ' ') : 'umbral excedido'}.`
    );
  }

  // Cierre con recomendación
  if (metrics.filas_aisladas > 0) {
    parts.push(
      `⚠️ Hay ${metrics.filas_aisladas} filas de formato desconocido que requieren mapeo del equipo de ops.`
    );
  }

  return parts.join(' ');
}

// ============================================================================
// Summary Widget
// ============================================================================

function SummaryWidget({
  metrics,
  discrepancias,
  anomaliasActivas,
}: {
  metrics: AppState['metrics'];
  discrepancias: ConciliacionResultado[];
  anomaliasActivas: AnomaliaResultado[];
}) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          label="Total Confirmado"
          value={`$${(metrics.total_confirmado_cop / 1_000_000).toFixed(1)}M`}
          color="bg-green-50 border-green-200 text-green-800"
        />
        <KPICard
          label="Total Pendiente"
          value={`$${(metrics.total_pendiente_cop / 1_000_000).toFixed(1)}M`}
          color="bg-yellow-50 border-yellow-200 text-yellow-800"
        />
        <KPICard
          label="Discrepancias Abiertas"
          value={discrepancias.length.toString()}
          color="bg-red-50 border-red-200 text-red-800"
        />
        <KPICard
          label="Anomalías C7"
          value={anomaliasActivas.length.toString()}
          color="bg-purple-50 border-purple-200 text-purple-800"
        />
      </div>

      {/* AI Summary (RF-IA-1: Resumen narrado del estado semanal) */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">🤖 Resumen IA de la semana</h3>
        <p className="text-sm text-blue-700">{generateAISummary(metrics, discrepancias, anomaliasActivas)}</p>
        <p className="text-xs text-blue-500 mt-2">
          Generado por motor narrativo · Fallback determinista (sin LLM externo en esta demo)
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Tasa de conciliación automática"
          value={`${(metrics.tasa_conciliacion_automatica * 100).toFixed(1)}%`}
          target="≥80%"
          good={metrics.tasa_conciliacion_automatica >= 0.8}
        />
        <StatCard
          label="Recall de anomalías"
          value={`${(metrics.recall_anomalias * 100).toFixed(1)}%`}
          target="≥90%"
          good={metrics.recall_anomalias >= 0.9}
        />
        <StatCard
          label="Tasa de normalización"
          value={`${(metrics.tasa_normalizacion * 100).toFixed(1)}%`}
          target="≥95%"
          good={metrics.tasa_normalizacion >= 0.95}
        />
      </div>
    </div>
  );
}

function KPICard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  target,
  good,
}: {
  label: string;
  value: string;
  target: string;
  good: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        good ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
      }`}
    >
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className={`text-xl font-bold mt-1 ${good ? 'text-green-800' : 'text-red-800'}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500">Target: {target}</p>
    </div>
  );
}

// ============================================================================
// Discrepancy Table
// ============================================================================

function DiscrepancyTable({
  discrepancias,
  anomaliasActivas,
  hitlRecords,
  onHitl,
}: {
  discrepancias: ConciliacionResultado[];
  anomaliasActivas: AnomaliaResultado[];
  hitlRecords: HitlRecord[];
  onHitl: (
    guia: string,
    carrier: string,
    tipo: 'c2' | 'c7',
    data: ConciliacionResultado | AnomaliaResultado
  ) => void;
}) {
  const hitlMap = new Map<string, HitlRecord>();
  for (const hr of hitlRecords) {
    hitlMap.set(`${hr.tipo}::${hr.guia}`, hr);
  }

  const anomaliesByGuia = new Map<string, AnomaliaResultado>();
  for (const a of anomaliasActivas) {
    anomaliesByGuia.set(a.guia, a);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Discrepancias y Anomalías</h2>
        <span className="text-sm text-gray-500">
          {discrepancias.length} filas · {anomaliasActivas.length} anomalías activas
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Guía</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Carrier</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Esperado</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Reportado</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Diferencia</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Clase</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Anomalía</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">HITL</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Acción</th>
            </tr>
          </thead>
          <tbody>
            {discrepancias.map((d) => {
              const anomalia = anomaliesByGuia.get(d.guia);
              const hitlC2 = hitlMap.get(`c2::${d.guia}`);
              const hitlC7 = hitlMap.get(`c7::${d.guia}`);
              const resuelto = hitlC2?.decision || hitlC7?.decision;

              return (
                <tr
                  key={d.guia}
                  className={`border-b border-gray-100 ${
                    resuelto ? 'bg-green-50' : anomalia ? 'bg-red-50' : 'bg-yellow-50'
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-xs">{d.guia}</td>
                  <td className="px-3 py-2 text-xs">{d.carrier}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    {d.monto_esperado?.toLocaleString('es-CO') ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {d.monto_reportado?.toLocaleString('es-CO') ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-medium">
                    {d.diferencia_pesos !== null ? (
                      <span
                        className={
                          d.diferencia_pesos > 0
                            ? 'text-green-600'
                            : d.diferencia_pesos < 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                        }
                      >
                        {d.diferencia_pesos > 0 ? '+' : ''}
                        {d.diferencia_pesos.toLocaleString('es-CO')} ({d.diferencia_pct}%)
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        d.clase === 'cobrado'
                          ? 'bg-green-100 text-green-800'
                          : d.clase === 'pendiente_acreditacion'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {d.clase}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {anomalia ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        {anomalia.razon}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {resuelto ? (
                      <span className="text-green-600">✅ {resuelto}</span>
                    ) : d.needs_hitl ? (
                      <span className="text-orange-600">Pendiente</span>
                    ) : (
                      <span className="text-gray-400">Auto</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {d.needs_hitl && !resuelto && (
                        <button
                          onClick={() => onHitl(d.guia, d.carrier, 'c2', d)}
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Decidir
                        </button>
                      )}
                      {anomalia && !hitlC7?.decision && (
                        <button
                          onClick={() => onHitl(d.guia, d.carrier, 'c7', anomalia)}
                          className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                        >
                          Anomalía
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// HITL Modal
// ============================================================================

function HitlModal({
  guia,
  carrier,
  tipo,
  razon,
  data,
  onConfirm,
  onCancel,
}: {
  guia: string;
  carrier: string;
  tipo: 'c2' | 'c7';
  razon: string;
  data: ConciliacionResultado | AnomaliaResultado;
  onConfirm: (decision: HitlDecisionC2 | HitlDecisionC7, nota?: string) => void;
  onCancel: () => void;
}) {
  if (tipo === 'c2') {
    const c2 = data as ConciliacionResultado;
    return (
      <ModalOverlay onCancel={onCancel}>
        <h3 className="text-lg font-semibold mb-4">Revisión de Conciliación — HITL</h3>
        <div className="space-y-1 text-sm mb-4 bg-gray-50 p-3 rounded">
          <p>
            <strong>Guía:</strong> {guia} ({carrier})
          </p>
          <p>
            <strong>Esperado:</strong> ${c2.monto_esperado?.toLocaleString('es-CO')}
          </p>
          <p>
            <strong>Reportado:</strong> ${c2.monto_reportado?.toLocaleString('es-CO')}
          </p>
          <p>
            <strong>Diferencia:</strong>{' '}
            {c2.diferencia_pesos !== null
              ? `${c2.diferencia_pesos} COP (${c2.diferencia_pct}%)`
              : '—'}
          </p>
          <p>
            <strong>Razón:</strong> {razon}
          </p>
          <p>
            <strong>Confianza C2:</strong> {c2.confianza}%
          </p>
        </div>
        <p className="text-sm text-gray-500 mb-4">¿Cómo desea clasificar esta fila?</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onConfirm('cobrado')}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
          >
            ✅ Cerrar como cobrado
          </button>
          <button
            onClick={() => onConfirm('pendiente_acreditacion')}
            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
          >
            ⏳ Pendiente acreditación
          </button>
          <button
            onClick={() => onConfirm('discrepancia_abierta')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            ⚡ Discrepancia abierta
          </button>
        </div>
      </ModalOverlay>
    );
  }

  // C7 anomaly decision
  const c7 = data as AnomaliaResultado;
  return (
    <ModalOverlay onCancel={onCancel}>
      <h3 className="text-lg font-semibold mb-4">Revisión de Anomalía — HITL</h3>
      <div className="space-y-1 text-sm mb-4 bg-gray-50 p-3 rounded">
        <p>
          <strong>Guía:</strong> {guia} ({carrier})
        </p>
        <p>
          <strong>Diferencia:</strong>{' '}
          {c7.diferencia_pesos !== null ? `${c7.diferencia_pesos} COP` : '—'}
        </p>
        <p>
          <strong>Razón:</strong> {c7.razon}
        </p>
        <p>
          <strong>Confianza C7:</strong> {c7.confianza}%
        </p>
      </div>
      <p className="text-sm text-gray-500 mb-4">¿Qué acción desea tomar?</p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onConfirm('confirmar_discrepancia')}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
        >
          ✅ Confirmar discrepancia
        </button>
        <button
          onClick={() => onConfirm('descartar')}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
        >
          Descartar error de reporte
        </button>
        <button
          onClick={() => onConfirm('reclamar')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          📢 Reclamar a transportadora
        </button>
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({
  onCancel,
  children,
}: {
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">{children}</div>
      <button
        onClick={onCancel}
        className="mt-4 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
      >
        Cancelar
      </button>
    </div>
  );
}

// ============================================================================
// Metrics Panel
// ============================================================================

function MetricsPanel({ metrics }: { metrics: AppState['metrics'] }) {
  type MetricRow = {
    label: string;
    value: number;
    target: number | null;
    format: 'pct' | 'cop' | 'count';
    invert?: boolean;
  };

  const metricRows: MetricRow[] = [
    {
      label: 'Tasa de conciliación automática',
      value: metrics.tasa_conciliacion_automatica,
      target: 0.8,
      format: 'pct' as const,
    },
    {
      label: 'Precisión de matching C2',
      value: metrics.precision_matching,
      target: 0.9,
      format: 'pct' as const,
    },
    {
      label: 'Recall de anomalías C7',
      value: metrics.recall_anomalias,
      target: 0.9,
      format: 'pct' as const,
    },
    {
      label: 'Precisión C7',
      value: metrics.precision_c7,
      target: null,
      format: 'pct' as const,
    },
    {
      label: 'Tasa de falso positivo C7',
      value: metrics.false_positive_rate,
      target: 0.1,
      format: 'pct' as const,
      invert: true,
    },
    {
      label: 'Tasa de normalización C1',
      value: metrics.tasa_normalizacion,
      target: 0.95,
      format: 'pct' as const,
    },
    {
      label: 'Filas aisladas (C1)',
      value: metrics.filas_aisladas,
      target: null,
      format: 'count' as const,
    },
    {
      label: 'Total confirmado (COP)',
      value: metrics.total_confirmado_cop,
      target: null,
      format: 'cop' as const,
    },
    {
      label: 'Total pendiente (COP)',
      value: metrics.total_pendiente_cop,
      target: null,
      format: 'cop' as const,
    },
    {
      label: 'Discrepancias abiertas',
      value: metrics.total_discrepancias,
      target: null,
      format: 'count' as const,
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Panel de Métricas</h2>
      <p className="text-sm text-gray-500">
        &quot;Si esto estuviera en producción mediría X; en el prototipo mido Y (proxy) contra el
        ground truth.&quot;
      </p>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Métrica</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Valor</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Target Prod</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Estado</th>
            </tr>
          </thead>
          <tbody>
            {metricRows.map((row, i) => {
              let displayValue = '';
              let isGood = true;

              if (row.format === 'pct') {
                displayValue = `${(row.value * 100).toFixed(1)}%`;
                if (row.target !== null) {
                  isGood = row.invert ? row.value <= row.target : row.value >= row.target;
                }
              } else if (row.format === 'cop') {
                displayValue = `$${(row.value / 1_000_000).toFixed(1)}M`;
              } else {
                displayValue = row.value.toString();
              }

              return (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2 text-right font-mono">{displayValue}</td>
                  <td className="px-4 py-2 text-right text-gray-500">
                    {row.target !== null
                      ? row.format === 'pct'
                        ? `${(row.target * 100).toFixed(0)}%`
                        : row.target.toString()
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {row.target !== null ? (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          isGood ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {isGood ? '✅ OK' : '️ Bajo'}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Info</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
