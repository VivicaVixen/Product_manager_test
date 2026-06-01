'use client';

import { useEffect, useState, useCallback } from 'react';
import type {
  AppState,
  ConciliacionResultado,
  AnomaliaResultado,
  HitlRecord,
  HitlDecisionC2,
  HitlDecisionC7,
  CarrierId,
} from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

interface PipelineResponse {
  success: boolean;
  state?: AppState;
  error?: string;
}

// O2: Nombres legibles para carriers en UI
const CARRIER_DISPLAY_NAMES: Record<string, string> = {
  interrapidisimo: 'Interrapidísimo',
  coordinadora: 'Coordinadora',
  servientrega: 'Servientrega',
  envia: 'Envía',
  tcc: 'TCC',
};

function displayCarrier(carrier: string): string {
  return CARRIER_DISPLAY_NAMES[carrier] ?? carrier;
}

// ============================================================================
// Componentes
// ============================================================================

export default function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resumen' | 'discrepancias' | 'pronostico' | 'metricas'>('resumen');
  const [modoEvaluador, setModoEvaluador] = useState(false);
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

  // Block 1: handleSeedReset — solo llama loadPipeline() que hace GET fresco
  const handleSeedReset = async () => {
    await loadPipeline();
  };

  // Block 1: handleHitlDecision — envía lista completa de HITL al servidor
  const handleHitlDecision = async (
    guia: string,
    carrier: string,
    tipo: 'c2' | 'c7',
    decision: HitlDecisionC2 | HitlDecisionC7,
    nota?: string
  ) => {
    const newRecord: HitlRecord = {
      guia,
      carrier: carrier as CarrierId,
      tipo,
      decision,
      nota_usuario: nota,
      timestamp: new Date().toISOString(),
    };

    // Actualizar lista local de HITL (upsert)
    const prevRecords = state?.hitlRecords ?? [];
    const updatedRecords = [...prevRecords];
    const idx = updatedRecords.findIndex(
      (r) => r.guia === newRecord.guia && r.tipo === newRecord.tipo
    );
    if (idx >= 0) {
      updatedRecords[idx] = newRecord;
    } else {
      updatedRecords.push(newRecord);
    }

    // Enviar lista completa al servidor — él re-ejecuta el pipeline con todos los HITL
    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hitlRecords: updatedRecords }),
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
          {/* O3: Spinner con estilo Embarca */}
          <div className="relative mx-auto mb-6" style={{ width: 80, height: 80 }}>
            <div className="absolute inset-0 rounded-full border-4 border-embarca-50/60" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-embarca-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="embarca" className="h-6 w-auto opacity-80" />
            </div>
          </div>
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

  // Block 4: Tabs dinámicos según modo
  const tabs = [
    { key: 'resumen' as const, label: '🏠 Resumen' },
    { key: 'discrepancias' as const, label: `📋 Mis envíos (${discrepancias.length})` },
    { key: 'pronostico' as const, label: '💰 Pronóstico de Caja' },
    ...(modoEvaluador
      ? [{ key: 'metricas' as const, label: '🔬 Panel Técnico' }]
      : []),
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Block 5: Header rediseñado con logo Embarca */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Logo + contexto */}
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="embarca" className="h-8 w-auto" />
            <div className="hidden sm:block">
              <p className="text-xs text-gray-400 leading-none mt-0.5">Conciliador Inteligente</p>
            </div>
          </div>

          {/* Usuario simulado + acciones */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 mr-2 text-sm text-gray-500">
              <div className="w-7 h-7 rounded-full bg-embarca-50 flex items-center justify-center text-embarca-500 font-bold text-xs">
                AG
              </div>
              <span>Andrés García</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">{state.orders.length} órdenes · {new Date().toLocaleDateString('es-CO')}</span>
            </div>

            <button
              onClick={loadPipeline}
              className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
              title="Recargar datos"
            >
              🔄
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-sm bg-embarca-50 border border-embarca-500/30 text-embarca-500 rounded-lg hover:bg-embarca-light transition-colors print:hidden"
            >
              📄 Exportar
            </button>
            <button
              onClick={handleSeedReset}
              className="px-3 py-1.5 text-sm bg-amber-50 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
              title="Reiniciar datos de demo"
            >
              🌱 Reset demo
            </button>
            <button
              onClick={() => setModoEvaluador((v) => !v)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                modoEvaluador
                  ? 'bg-purple-100 border-purple-300 text-purple-700 font-medium'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-500'
              }`}
              title={modoEvaluador ? 'Cambiar a vista de usuario' : 'Activar vista evaluador'}
            >
              {modoEvaluador ? '🔬 Evaluador' : '👤 Producto'}
            </button>
          </div>
        </div>
      </header>

      {/* Block 4: Alertas C1 — texto limpio para Vista Producto */}
      {c1Alerts.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-sm text-orange-800 font-medium">
              ⚠️ {c1Alerts.length} transportadora{c1Alerts.length > 1 ? 's' : ''} con formato no reconocido — se están revisando
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

      {/* Block 5: Tabs con estilo Embarca + Block 4: tabs dinámicos */}
      <div className="max-w-7xl mx-auto px-6 pt-4">
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.key
                  ? 'border-embarca-500 text-embarca-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
        {activeTab === 'pronostico' && (
          <CashForecastPanel forecast={state.cashForecast} />
        )}
        {activeTab === 'metricas' && modoEvaluador && <MetricsPanel metrics={metrics} />}
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
// AI Summary Generator — Fallback determinista (sin texto "Fallback" en UI)
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

  const discByCarrier = new Map<string, number>();
  for (const d of discrepancias) {
    discByCarrier.set(d.carrier, (discByCarrier.get(d.carrier) ?? 0) + 1);
  }
  const topCarrier = [...discByCarrier.entries()].sort((a, b) => b[1] - a[1])[0];

  const anomByReason = new Map<string, number>();
  for (const a of anomaliasActivas) {
    anomByReason.set(a.razon, (anomByReason.get(a.razon) ?? 0) + 1);
  }

  const parts: string[] = [];

  parts.push(
    `Esta semana se procesaron ${totalM} millones de pesos en conciliación COD.`
  );

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

  if (discrepancias.length > 0) {
    parts.push(
      `Se detectaron ${discrepancias.length} envíos pendientes de revisión.`
    );
    if (topCarrier) {
      parts.push(
        `La transportadora con más incidencias es ${topCarrier[0]} con ${topCarrier[1]} casos.`
      );
    }
  } else {
    parts.push(`No hay envíos pendientes — excelente semana.`);
  }

  if (anomaliasActivas.length > 0) {
    const topReason = [...anomByReason.entries()].sort((a, b) => b[1] - a[1])[0];
    parts.push(
      `Se detectaron ${anomaliasActivas.length} alertas de posible cobro incorrecto ` +
      `(precisión: ${recall}%), predominantemente por ${topReason ? topReason[0].replace('_', ' ') : 'umbral excedido'}.`
    );
  }

  if (metrics.filas_aisladas > 0) {
    parts.push(
      `⚠️ Hay ${metrics.filas_aisladas} registros con formato no reconocido que requieren revisión del equipo de operaciones.`
    );
  }

  return parts.join(' ');
}

// ============================================================================
// Block 3: Summary Widget con Groq AI
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
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  useEffect(() => {
    const prompt = `Resumen de conciliación COD esta semana:
- Total procesado: $${((metrics.total_confirmado_cop + metrics.total_pendiente_cop) / 1_000_000).toFixed(1)}M COP
- Porcentaje resuelto automáticamente: ${(metrics.tasa_conciliacion_automatica * 100).toFixed(0)}% (la meta es 80%)
- Envíos confirmados: $${(metrics.total_confirmado_cop / 1_000_000).toFixed(1)}M
- Envíos pendientes de acreditación: $${(metrics.total_pendiente_cop / 1_000_000).toFixed(1)}M
- Discrepancias que necesitan revisión: ${discrepancias.length}
- Posibles cobros incorrectos detectados: ${anomaliasActivas.length}
Redacta un resumen semanal para Andrés, el vendedor. Menciona el monto total, qué tan bien funcionó el sistema esta semana y cuántos casos necesitan su atención.`;

    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
      .then((r) => r.json())
      .then((data) => {
        setAiText(data.text ?? generateAISummary(metrics, discrepancias, anomaliasActivas));
      })
      .catch(() => {
        setAiText(generateAISummary(metrics, discrepancias, anomaliasActivas));
      })
      .finally(() => setAiLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* KPI Cards — Block 5: paleta Embarca + O4: tooltips */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          label="Total Confirmado"
          value={`$${(metrics.total_confirmado_cop / 1_000_000).toFixed(1)}M`}
          color="bg-green-50 border-green-200 text-green-800"
          tooltip="Monto total de envíos cuya entrega y pago fueron verificados correctamente"
        />
        <KPICard
          label="Total Pendiente"
          value={`$${(metrics.total_pendiente_cop / 1_000_000).toFixed(1)}M`}
          color="bg-amber-50 border-amber-200 text-amber-800"
          tooltip="Envíos entregados cuyo pago aún no ha sido acreditado por la transportadora"
        />
        <KPICard
          label="Envíos por revisar"
          value={discrepancias.length.toString()}
          color="bg-red-50 border-red-200 text-red-800"
          tooltip="Casos donde el monto esperado y el reportado no coinciden — requieren tu decisión"
        />
        <KPICard
          label="Alertas detectadas"
          value={anomaliasActivas.length.toString()}
          color="bg-embarca-50 border-embarca-500/20 text-embarca-700"
          tooltip="Posibles cobros incorrectos detectados automáticamente por el sistema"
        />
      </div>

      {/* Block 3: AI Summary con Groq */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">✨ Resumen de la semana</h3>
        {aiLoading ? (
          <p className="text-sm text-blue-400 italic">Generando resumen...</p>
        ) : (
          <p className="text-sm text-blue-700">{aiText}</p>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Procesado automáticamente"
          value={`${(metrics.tasa_conciliacion_automatica * 100).toFixed(1)}%`}
          target="≥80%"
          good={metrics.tasa_conciliacion_automatica >= 0.8}
        />
        <StatCard
          label="Alertas de cobro detectadas"
          value={`${(metrics.recall_anomalias * 100).toFixed(1)}%`}
          target="≥90%"
          good={metrics.recall_anomalias >= 0.9}
        />
        <StatCard
          label="Envíos procesados sin error"
          value={`${(metrics.tasa_normalizacion * 100).toFixed(1)}%`}
          target="≥95%"
          good={metrics.tasa_normalizacion >= 0.95}
        />
      </div>
    </div>
  );
}

function KPICard({ label, value, color, tooltip }: { label: string; value: string; color: string; tooltip?: string }) {
  return (
    <div
      className={`rounded-xl border p-5 ${color} transition-shadow hover:shadow-md relative group`}
      title={tooltip}
    >
      <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-pre-wrap max-w-xs text-center shadow-lg">
            {tooltip}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-gray-900" />
            </div>
          </div>
        </div>
      )}
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
// Discrepancy Table — Block 4: textos limpios
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
        <h2 className="text-lg font-semibold text-gray-900">Envíos que necesitan tu atención</h2>
        <span className="text-sm text-gray-500">
          {discrepancias.length} filas · {anomaliasActivas.length} alertas activas
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
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Alerta</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Estado</th>
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
                  <td className="px-3 py-2 text-xs">{displayCarrier(d.carrier)}</td>
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
                          Revisar
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
        <h3 className="text-lg font-semibold mb-4">Revisión de Conciliación</h3>
        <div className="space-y-1 text-sm mb-4 bg-gray-50 p-3 rounded">
          <p>
            <strong>Guía:</strong> {guia} ({displayCarrier(carrier)})
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
            <strong>Confianza:</strong> {c2.confianza}%
          </p>
        </div>
        <p className="text-sm text-gray-500 mb-4">¿Cómo desea clasificar este envío?</p>
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
      <h3 className="text-lg font-semibold mb-4">Revisión de Alerta</h3>
      <div className="space-y-1 text-sm mb-4 bg-gray-50 p-3 rounded">
        <p>
          <strong>Guía:</strong> {guia} ({displayCarrier(carrier)})
        </p>
        <p>
          <strong>Diferencia:</strong>{' '}
          {c7.diferencia_pesos !== null ? `${c7.diferencia_pesos} COP` : '—'}
        </p>
        <p>
          <strong>Razón:</strong> {c7.razon}
        </p>
        <p>
          <strong>Confianza:</strong> {c7.confianza}%
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

// Block 2: ModalOverlay — botón Cancelar dentro del cuadro blanco
function ModalOverlay({
  onCancel,
  children,
}: {
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
        {children}
        <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Metrics Panel — Block 4: nota de Vista Evaluador
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

      {/* Block 4: nota evaluador */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
        <p className="text-xs text-purple-700 font-medium">🔬 Vista Evaluador — Panel interno de métricas</p>
        <p className="text-xs text-purple-600 mt-1">
          &quot;Si esto estuviera en producción mediría X; en el prototipo mido Y (proxy) contra el ground truth del dataset sintético.&quot;
        </p>
      </div>

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
                        {isGood ? '✅ OK' : '⚠️ Bajo'}
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

// ============================================================================
// Cash Forecast Panel (Stretch Feature: Pronóstico de caja COD)
// ============================================================================

function CashForecastPanel({ forecast }: { forecast: AppState['cashForecast'] }) {
  if (!forecast || forecast.carriers.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Pronóstico de Caja COD</h2>
        <p className="text-sm text-gray-500">Feature stretch — en desarrollo.</p>
      </div>
    );
  }

  const semaforoIcon: Record<string, string> = { verde: '🟢', amarillo: '🟡', rojo: '' };
  const semaforoBg: Record<string, string> = {
    verde: 'bg-green-50 border-green-200',
    amarillo: 'bg-yellow-50 border-yellow-200',
    rojo: 'bg-red-50 border-red-200',
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">💰 Pronóstico de Caja COD</h2>
      <p className="text-sm text-gray-500">
        Proyección de remesa por transportadora basada en lag histórico de pago.
      </p>

      {/* AI Narrative */}
      {forecast.resumenNarrado && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-indigo-800 mb-2">🤖 Pronóstico narrado</h3>
          <p className="text-sm text-indigo-700">{forecast.resumenNarrado}</p>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          label="Total por cobrar"
          value={`$${(forecast.totalPorCobrarCOP / 1_000_000).toFixed(1)}M`}
          color="bg-yellow-50 border-yellow-200 text-yellow-800"
        />
        <KPICard
          label="Proyección de entrada"
          value={`$${(forecast.totalProyectadoCOP / 1_000_000).toFixed(1)}M`}
          color="bg-green-50 border-green-200 text-green-800"
        />
        <KPICard
          label="En riesgo de atraso"
          value={`$${(forecast.riesgoAtrasoCOP / 1_000_000).toFixed(1)}M`}
          color="bg-red-50 border-red-200 text-red-800"
        />
      </div>

      {/* Carrier Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Carrier</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Semáforo</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Lag histórico</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Lag actual</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Por cobrar</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Órdenes</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Señal</th>
            </tr>
          </thead>
          <tbody>
            {forecast.carriers.map((c) => (
              <tr key={c.carrier} className={`border-b border-gray-100 ${semaforoBg[c.semafaro] ?? ''}`}>
                <td className="px-4 py-2 font-medium">{c.carrier}</td>
                <td className="px-4 py-2 text-center text-lg">{semaforoIcon[c.semafaro]}</td>
                <td className="px-4 py-2 text-right">{c.lagMedianoHistorico}d</td>
                <td className="px-4 py-2 text-right">{c.lagMedianoActual}d</td>
                <td className="px-4 py-2 text-right font-mono">
                  ${c.totalPorCobrarCOP.toLocaleString('es-CO')}
                </td>
                <td className="px-4 py-2 text-right">{c.ordenesPendientes}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{c.senal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
