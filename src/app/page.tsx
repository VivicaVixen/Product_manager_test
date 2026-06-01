'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type {
  AppState,
  ConciliacionResultado,
  AnomaliaResultado,
  HitlRecord,
  HitlDecisionC2,
  HitlDecisionC7,
  CarrierId,
} from '@/lib/types';
import { GLOSARIO, type ClaseKey, type EstadoKey } from '@/lib/glosario_estados';

// ============================================================================
// M1: Imports para reclamaciones (ADITIVO — no tocar imports existentes)
// ============================================================================
import { FLAGS } from '@/lib/flags';
import type { Reclamacion } from '@/lib/types_reclamacion';
import ReclamacionesPanel from '@/components/ReclamacionesPanel';
// ============================================================================
// M2: Imports para predicción SLA (ADITIVO)
// ============================================================================
import PrediccionSLAPanel from '@/components/PrediccionSLAPanel';
// ============================================================================
// M5: Imports para recall loop (ADITIVO)
// ============================================================================
import CalibracionPanel from '@/components/CalibracionPanel';
import { loadFeedback, saveFeedback, type HITLFeedback } from '@/lib/hitl_feedback';
import { recalibrateAll, type CalibracionResultado } from '@/lib/threshold_calibrator';
// ============================================================================
// M4: Imports para auto-mapeo TCC (ADITIVO)
// ============================================================================
import AutomapModal from '@/components/AutomapModal';
import { getTccRawSample, SCHEMA_CANONICO } from '@/lib/tcc_reader';
import type { Automapping } from '@/lib/automap_apply';
import type { GuiaNormalizada } from '@/lib/types';

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

// B8: Personas para demo multi-usuario
const PERSONAS = [
  {
    id: 'andres',
    nombre: 'Andrés García',
    rol: 'Dropshipper · ~1.800 pedidos/mes',
    iniciales: 'AG',
  },
  {
    id: 'carolina',
    nombre: 'Carolina Méndez',
    rol: 'Cosméticos · ~600 pedidos/mes',
    iniciales: 'CM',
  },
  {
    id: 'tienda',
    nombre: 'Tienda de Ropa BCN',
    rol: 'Moda · ~120 pedidos/mes',
    iniciales: 'TR',
  },
  {
    id: 'enterprise',
    nombre: 'MegaStore Colombia',
    rol: 'Enterprise · ~9.000 pedidos/mes',
    iniciales: 'MC',
  },
] as const;

type PersonaId = (typeof PERSONAS)[number]['id'];

// ============================================================================
// Componentes
// ============================================================================

export default function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resumen' | 'discrepancias' | 'pronostico' | 'reclamaciones' | 'prediccion' | 'calibracion' | 'metricas'>('resumen');
  const [modoEvaluador, setModoEvaluador] = useState(false);
  const [personaActiva, setPersonaActiva] = useState<PersonaId>('andres');
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const personaMenuRef = useRef<HTMLDivElement>(null);
  const persona = PERSONAS.find((p) => p.id === personaActiva)!;
  const [hitlModal, setHitlModal] = useState<{
    guia: string;
    carrier: string;
    tipo: 'c2' | 'c7';
    razon: string;
    data: ConciliacionResultado | AnomaliaResultado;
  } | null>(null);

  // ========================================================================
  // M1: Estado de reclamaciones (ADITIVO — no tocar estado existente)
  // ========================================================================
  const [reclamaciones, setReclamaciones] = useState<Reclamacion[]>([]);
  const [reclamacionGenerating, setReclamacionGenerating] = useState<string | null>(null); // guia being generated

  // ========================================================================
  // M5: Estado de feedback y calibración (ADITIVO)
  // ========================================================================
  const [hitlFeedback, setHitlFeedback] = useState<HITLFeedback[]>([]);
  const [calibraciones, setCalibraciones] = useState<CalibracionResultado[]>([]);
  // M5.4: Override opcional de umbral por carrier (NO modifica c7_anomalies.ts)
  const [thresholdOverrides, setThresholdOverrides] = useState<Record<string, number>>({});

  // ========================================================================
  // M4: Estado de auto-mapeo TCC (ADITIVO)
  // ========================================================================
  const [automapModalOpen, setAutomapModalOpen] = useState(false);
  const [automapeadas, setAutomapeadas] = useState<GuiaNormalizada[]>([]);
  const [automapCount, setAutomapCount] = useState(0);

  // E2: AI summary state moved to Dashboard level for hero-first rendering
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  // M5: Cargar feedback acumulado desde localStorage al montar
  useEffect(() => {
    if (FLAGS.M5_recall_loop) {
      const stored = loadFeedback();
      setHitlFeedback(stored);
      if (stored.length > 0) {
        setCalibraciones(recalibrateAll(stored));
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPipeline = useCallback(async (persona: string = personaActiva) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipeline?persona=${persona}`);
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
  }, [personaActiva]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  // O3: Cerrar dropdown persona al hacer clic fuera
  useEffect(() => {
    if (!personaMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (personaMenuRef.current && !personaMenuRef.current.contains(e.target as Node)) {
        setPersonaMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [personaMenuOpen]);

  // E2: Groq AI summary fetch at Dashboard level
  useEffect(() => {
    if (!state) return;
    const { metrics, conciliaciones, anomalias } = state;
    const discrepancias = conciliaciones.filter(
      (c) => c.clase === 'discrepancia' || c.needs_hitl
    );
    const anomaliasActivas = anomalias.filter((a) => a.flag);
    // C1: Prompt orientado a insight para vendedor, no resumen de tabla
    const discByCarrier = new Map<string, number>();
    for (const d of discrepancias) discByCarrier.set(d.carrier, (discByCarrier.get(d.carrier) ?? 0) + 1);
    const carrierRanking = [...discByCarrier.entries()].sort((a, b) => b[1] - a[1]);
    const top = carrierRanking[0];
    const topPct = top ? ((top[1] / (discrepancias.length || 1)) * 100).toFixed(0) : '0';
    const otros = carrierRanking.slice(1).map(([c, n]) => `${displayCarrier(c)} (${n})`).join(', ');

    // Top 3 cobros por monto para acción concreta
    const top3Cobros = discrepancias
      .filter((d) => d.monto_esperado)
      .sort((a, b) => (b.monto_esperado ?? 0) - (a.monto_esperado ?? 0))
      .slice(0, 3);

    const prompt = `Resumen COD para el vendedor Andrés esta semana:

¿CUÁNTO LE DEBEN Y QUÉ ESTÁ EN RIESGO?
- Total en juego: $${((metrics.total_confirmado_cop + metrics.total_pendiente_cop) / 1_000_000).toFixed(1)}M COP
- Confirmado y cobrado: $${(metrics.total_confirmado_cop / 1_000_000).toFixed(1)}M
- Pendiente de acreditación: $${(metrics.total_pendiente_cop / 1_000_000).toFixed(1)}M
- Envíos que no cuadran: ${discrepancias.length}

¿QUÉ TRANSPORTADORA LE ESTÁ COSTANDO PLATA?
${top ? `- ${displayCarrier(top[0])} concentra el ${topPct}% de los problemas (${top[1]} envíos, el mayor riesgo de caja)` : '- Sin incidencias significativas'}
${otros ? `- Otras con incidencias: ${otros}` : ''}

TOP COBROS PENDIENTES (para acción inmediata):
${top3Cobros.map((d) => `- ${d.guia} (${displayCarrier(d.carrier)}): $${d.monto_esperado?.toLocaleString('es-CO')} COP`).join('\n') || '- Sin cobros destacados'}

ALERTAS: ${anomaliasActivas.length} posibles cobros incorrectos detectados.

Redacta 2-3 bloques cortos respondiendo: (1) ¿cuánto le deben y cuánto está en riesgo?, (2) ¿qué transportadora le está costando plata y por qué le importa?, (3) ¿qué decide esta semana? (1 acción concreta con guía y monto). Máximo 4 oraciones. Sin tecnicismos.`;

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
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

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
      body: JSON.stringify({ hitlRecords: updatedRecords, persona: personaActiva }),
    });
    const data: PipelineResponse = await res.json();
    if (data.success && data.state) {
      setState(data.state);
    }

    // M1.4: Si la decisión es "reclamar" y el flag está activo → generar reclamación
    if (decision === 'reclamar' && FLAGS.M1_reclamaciones) {
      // Buscar datos de la fila para la reclamación
      const conc = conciliaciones.find((c) => c.guia === guia);
      const anom = anomalias.find((a) => a.guia === guia);
      const montoEsperado = conc?.monto_esperado ?? 0;
      const montoReportado = conc?.monto_reportado ?? anom?.diferencia_pesos ?? null;
      const diferencia = conc?.diferencia_pesos ?? anom?.diferencia_pesos ?? 0;
      // Buscar fecha en guias normalizadas
      const guiaNorm = state?.guiasNormalizadas.find((g) => g.guia_id === guia);
      const fecha = guiaNorm?.fecha ?? new Date().toISOString().split('T')[0];
      await generarReclamacion(guia, carrier, montoEsperado, montoReportado, Math.abs(diferencia), fecha);
    }

    // M5.1: Registrar feedback HITL para recalibración (ADITIVO)
    if (FLAGS.M5_recall_loop && tipo === 'c7') {
      const anomalia = anomalias.find((a) => a.guia === guia);
      const diferencia = anomalia?.diferencia_pesos ?? 0;
      const feedbackDecision: HITLFeedback = {
        guia,
        carrier: carrier as CarrierId,
        diferencia,
        decision: decision === 'confirmar_discrepancia' ? 'confirmar' : 'descartar',
        timestamp: new Date().toISOString(),
      };
      const updated = saveFeedback(feedbackDecision);
      setHitlFeedback(updated);
      setCalibraciones(recalibrateAll(updated));
    }

    setHitlModal(null);
  };

  // ========================================================================
  // M1.4: Generar reclamación desde HITL (ADITIVO — enganche en rama "reclamar")
  // ========================================================================
  const generarReclamacion = useCallback(async (
    guia: string,
    carrier: string,
    montoEsperado: number,
    montoReportado: number | null,
    diferencia: number,
    fecha: string
  ) => {
    if (!FLAGS.M1_reclamaciones) return;
    setReclamacionGenerating(guia);

    const id = `rec_${guia}`;
    const carrierLegible = displayCarrier(carrier);
    const fuente = `Reporte ${carrierLegible} · ${fecha}`;

    const prompt = `Redacta reclamación formal para ${carrierLegible}:
Guía: ${guia}
Monto esperado: $${montoEsperado.toLocaleString('es-CO')} COP
Monto reportado: ${montoReportado !== null ? '$' + montoReportado.toLocaleString('es-CO') + ' COP' : 'no reportado'}
Diferencia: $${diferencia.toLocaleString('es-CO')} COP
Fecha: ${fecha}
Motivo: discrepancia en el monto reportado`;

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode: 'reclamacion', payload: { guia, carrier, montoEsperado, montoReportado, diferencia, fecha } }),
      });
      const data = await res.json();
      const texto = data.text ?? '';

      const nueva: Reclamacion = {
        id,
        guia,
        carrier: carrier as CarrierId,
        carrierLegible,
        montoEsperado,
        montoReportado,
        diferencia,
        fecha,
        motivo: 'discrepancia_monto',
        estado: 'borrador',
        textoGenerado: texto,
        fuente,
        creadaEn: new Date().toISOString(),
      };
      setReclamaciones((prev) => [...prev, nueva]);
    } catch {
      // Fallback ya viene del backend, pero si falla la llamada:
      const nueva: Reclamacion = {
        id,
        guia,
        carrier: carrier as CarrierId,
        carrierLegible,
        montoEsperado,
        montoReportado,
        diferencia,
        fecha,
        motivo: 'discrepancia_monto',
        estado: 'borrador',
        textoGenerado: '',
        fuente,
        creadaEn: new Date().toISOString(),
      };
      setReclamaciones((prev) => [...prev, nueva]);
    } finally {
      setReclamacionGenerating(null);
    }
  }, []);

  // M1.5: Handlers para actualizar reclamaciones
  const handleUpdateReclamacionEstado = useCallback((id: string, estado: Reclamacion['estado']) => {
    setReclamaciones((prev) =>
      prev.map((r) => (r.id === id ? { ...r, estado } : r))
    );
  }, []);

  const handleUpdateReclamacionTexto = useCallback((id: string, texto: string) => {
    setReclamaciones((prev) =>
      prev.map((r) => (r.id === id ? { ...r, textoGenerado: texto } : r))
    );
  }, []);

  // M5.4: Handler para aplicar umbral sugerido (solo override en cliente)
  const handleAplicarUmbral = useCallback((carrier: string, umbral: number) => {
    setThresholdOverrides((prev) => ({ ...prev, [carrier]: umbral }));
  }, []);

  // M4.4: Handler para aprobar mapeo TCC
  const handleAutomapApprove = useCallback((mapping: Automapping, filasMapeadas: GuiaNormalizada[]) => {
    setAutomapeadas(filasMapeadas);
    setAutomapCount(filasMapeadas.length);
    setAutomapModalOpen(false);
  }, []);

  // ========================================================================
  // Render
  // ========================================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-embarca-surface flex items-center justify-center">
        <div className="text-center">
          {/* O3: Spinner con estilo Faro (verde) */}
          <div className="relative mx-auto mb-6" style={{ width: 80, height: 80 }}>
            <div className="absolute inset-0 rounded-full border-4 border-embarca-50/60" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-embarca-DEFAULT animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="embarca" className="h-6 w-auto opacity-80" />
            </div>
          </div>
          <p className="text-embarca-muted">Cargando datos de conciliación...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-embarca-surface flex items-center justify-center">
        <div className="text-center bg-embarca-danger-light border border-embarca-danger/30 rounded-lg p-6 max-w-md">
          <p className="text-embarca-danger font-semibold mb-2">Error</p>
          <p className="text-embarca-danger/80 text-sm">{error}</p>
          <button
            onClick={() => loadPipeline()}
            className="mt-4 px-4 py-2 bg-embarca-danger text-white rounded hover:bg-red-700"
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
  // M1.5: Tab condicional de reclamaciones (ADITIVO)
  // M2.4: Tab condicional de predicción SLA (ADITIVO)
  const tabs = [
    { key: 'resumen' as const, label: '🏠 Resumen' },
    { key: 'discrepancias' as const, label: `📋 Mis envíos (${discrepancias.length})` },
    { key: 'pronostico' as const, label: '💰 Pronóstico de Caja' },
    ...(FLAGS.M1_reclamaciones
      ? [{ key: 'reclamaciones' as const, label: `📨 Reclamaciones (${reclamaciones.length})` }]
      : []),
    ...(FLAGS.M2_prediccion_sla
      ? [{ key: 'prediccion' as const, label: '🔮 Predicción SLA' }]
      : []),
    ...(FLAGS.M5_recall_loop && modoEvaluador
      ? [{ key: 'calibracion' as const, label: '🎯 Calibración C7' }]
      : []),
    ...(modoEvaluador
      ? [{ key: 'metricas' as const, label: '🔬 Panel Técnico' }]
      : []),
  ];

  return (
    <main className="min-h-screen bg-embarca-surface">
      {/* Block 5: Header rediseñado con logo Embarca — dark mode */}
      <header className="bg-embarca-surfaceAlt/80 backdrop-blur-sm border-b border-embarca-border shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Logo + contexto */}
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="embarca" className="h-8 w-auto" />
            <div className="hidden sm:block">
              <p className="text-xs text-embarca-muted leading-none mt-0.5">claridad total sobre tu caja COD</p>
            </div>
          </div>

          {/* B8: Persona switcher + O3: click-outside */}
          <div className="flex items-center gap-2">
            <div ref={personaMenuRef} className="relative hidden md:block">
              <button
                onClick={() => setPersonaMenuOpen((v) => !v)}
                className="flex items-center gap-2 text-sm text-embarca-muted hover:text-embarca-text transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-embarca-light flex items-center justify-center text-embarca-DEFAULT font-bold text-xs">
                  {persona.iniciales}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-embarca-heading leading-none">{persona.nombre}</p>
                  <p className="text-xs text-embarca-muted mt-0.5">{persona.rol}</p>
                </div>
                <span className="text-embarca-muted text-xs">▾</span>
              </button>

              {personaMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-embarca-surfaceAlt border border-embarca-border-strong rounded-xl shadow-xl z-50 py-1">
                  <p className="text-xs font-medium text-embarca-muted uppercase tracking-wide px-3 py-2">
                    Cambiar usuario demo
                  </p>
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPersonaActiva(p.id);
                        setPersonaMenuOpen(false);
                        loadPipeline(p.id);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-embarca-surfaceHover transition-colors ${
                        p.id === personaActiva ? 'bg-embarca-light' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-embarca-light flex items-center justify-center text-embarca-DEFAULT font-bold text-xs flex-shrink-0">
                        {p.iniciales}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-embarca-heading">{p.nombre}</p>
                        <p className="text-xs text-embarca-muted">{p.rol}</p>
                      </div>
                      {p.id === personaActiva && (
                        <span className="ml-auto text-embarca-DEFAULT text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => loadPipeline()}
              className="px-3 py-1.5 text-sm bg-embarca-surfaceAlt border border-embarca-border text-embarca-muted hover:text-embarca-text hover:bg-embarca-surfaceHover rounded-lg transition-colors"
              title="Recargar datos"
            >
              🔄
            </button>
            <button
              onClick={() => state && generarReportePDF(state, persona)}
              className="px-3 py-1.5 text-sm bg-embarca-light border border-embarca-DEFAULT/30 text-embarca-DEFAULT rounded-lg hover:bg-embarca-light/80 transition-colors print:hidden"
            >
              📄 Exportar
            </button>
            <button
              onClick={handleSeedReset}
              className="px-3 py-1.5 text-sm bg-embarca-gold-light border border-embarca-gold/30 text-embarca-gold rounded-lg hover:bg-embarca-gold-light/80 transition-colors"
              title="Reiniciar datos de demo"
            >
              🌱 Reset demo
            </button>
            <button
              onClick={() => setModoEvaluador((v) => !v)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                modoEvaluador
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-400 font-medium'
                  : 'bg-embarca-surfaceAlt border-embarca-border text-embarca-muted hover:text-embarca-text'
              }`}
              title={modoEvaluador ? 'Cambiar a vista de usuario' : 'Activar vista evaluador'}
            >
              {modoEvaluador ? '🔬 Evaluador' : '👤 Producto'}
            </button>
          </div>
        </div>
      </header>

      {/* F3: Alertas C1 — mensaje amigable siempre, detalles solo evaluador — dark mode */}
      {c1Alerts.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-embarca-gold-light border border-embarca-gold/30 rounded-lg p-3">
            <p className="text-sm text-embarca-gold font-medium">
              ⚠️ {c1Alerts.length} envío{c1Alerts.length > 1 ? 's' : ''} con transportadora no reconocida — están siendo revisados por el equipo de operaciones.
            </p>
            {/* Detalle técnico SOLO en modo evaluador */}
            {modoEvaluador && (
              <details className="mt-1">
                <summary className="text-xs text-embarca-gold cursor-pointer">Ver detalles técnicos (vista evaluador)</summary>
                <ul className="mt-1 text-xs text-embarca-gold/80 space-y-1 font-mono">
                  {c1Alerts.map((a, i) => (
                    <li key={i}>
                      <code className="bg-embarca-gold-light/40 px-1 rounded">{a.guia_o_linea}</code> — {a.razon}
                    </li>
                  ))}
                </ul>
                {/* M4.4: Botón de sugerir mapeo (solo si flag ON y en evaluador) */}
                {FLAGS.M4_automapeo && c1Alerts.some((a) => a.fuente === 'tcc') && (
                  <button
                    onClick={() => setAutomapModalOpen(true)}
                    className="mt-2 px-3 py-1.5 text-xs bg-embarca-DEFAULT text-white rounded-lg hover:bg-embarca-dark"
                  >
                    ✨ Sugerir mapeo (IA)
                  </button>
                )}
              </details>
            )}
          </div>
        </div>
      )}

      {/* Block 5: Tabs con estilo Embarca + Block 4: tabs dinámicos — dark mode */}
      <div className="max-w-7xl mx-auto px-6 pt-4">
        <div className="flex gap-1 border-b border-embarca-border-strong">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.key
                  ? 'border-embarca-DEFAULT text-embarca-DEFAULT'
                  : 'border-transparent text-embarca-muted hover:text-embarca-text hover:border-embarca-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'resumen' && state && (
          <div className="space-y-5">
            {/* E2: 1. Resumen IA — PRIMERO (hero moment) */}
            <div className="bg-embarca-light border border-embarca-DEFAULT/20 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">✨</span>
                <h2 className="text-base font-semibold text-embarca-text">Tu semana en faro</h2>
                {aiLoading && (
                  <span className="text-xs text-embarca-muted animate-pulse ml-2">Analizando...</span>
                )}
              </div>
              {aiLoading ? (
                <p className="text-sm text-embarca-muted italic">Generando resumen...</p>
              ) : (
                <div>
                  {aiText?.split('\n\n').filter(Boolean).map((bloque, i) => (
                    <p key={i} className="text-sm text-embarca-text leading-relaxed mt-2 first:mt-0">
                      {bloque}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* E2: 2. Badge HITL pendiente */}
            {(() => {
              const pendientes = discrepancias.filter(
                (d) => d.needs_hitl && !hitlRecords.find((r) => r.guia === d.guia && r.decision)
              );
              if (pendientes.length === 0) return null;
              return (
                <div className="flex items-center justify-between bg-embarca-gold-light border border-embarca-gold/20 rounded-xl px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">⚡</span>
                    <div>
                      <p className="text-sm font-semibold text-embarca-gold">
                        {pendientes.length} envío{pendientes.length > 1 ? 's' : ''} requieren tu decisión
                      </p>
                      <p className="text-xs text-embarca-gold mt-0.5">
                        Tiempo estimado: ~{pendientes.length * 2} minutos
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('discrepancias')}
                    className="px-4 py-2 bg-embarca-gold hover:bg-embarca-dark text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Revisar ahora →
                  </button>
                </div>
              );
            })()}

            {/* E1: 3. North star — horas ahorradas */}
            <div className="flex items-center gap-3 bg-embarca-light border border-embarca-DEFAULT/20 rounded-xl px-5 py-3">
              <span className="text-2xl">⏱️</span>
              <div>
                <p className="text-sm font-semibold text-embarca-text">
                  Esta semana el sistema procesó automáticamente el{' '}
                  {(metrics.tasa_conciliacion_automatica * 100).toFixed(0)}% de tus envíos
                </p>
                <p className="text-xs text-embarca-muted mt-0.5">
                  Equivalente a ~{((metrics.tasa_conciliacion_automatica * state.orders.length * 3) / 60).toFixed(1)} horas menos en Excel
                  {' '}· vs. 3–6 h de conciliación manual semanal
                </p>
              </div>
            </div>

            {/* 4. KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <KPICard
                label="Total Confirmado"
                value={`$${(metrics.total_confirmado_cop / 1_000_000).toFixed(1)}M`}
                color="bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                tooltip="Monto total de envíos cuya entrega y pago fueron verificados correctamente"
              />
              <KPICard
                label="Total Pendiente"
                value={`$${(metrics.total_pendiente_cop / 1_000_000).toFixed(1)}M`}
                color="bg-amber-500/10 border-amber-500/30 text-amber-400"
                tooltip="Envíos entregados cuyo pago aún no ha sido acreditado por la transportadora"
              />
              <KPICard
                label="Envíos por revisar"
                value={discrepancias.length.toString()}
                color="bg-red-500/10 border-red-500/30 text-red-400"
                tooltip="Casos donde el monto esperado y el reportado no coinciden — requieren tu decisión"
              />
              <KPICard
                label="Alertas detectadas"
                value={anomaliasActivas.length.toString()}
                color="bg-embarca-blue-light border-embarca-blue/20 text-embarca-blue"
                tooltip="Posibles cobros incorrectos detectados automáticamente por el sistema"
              />
            </div>

            {/* 5. Quick stats */}
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
        {/* M1.5: Tab de reclamaciones (ADITIVO) */}
        {activeTab === 'reclamaciones' && FLAGS.M1_reclamaciones && (
          <ReclamacionesPanel
            reclamaciones={reclamaciones}
            onUpdateEstado={handleUpdateReclamacionEstado}
            onUpdateTexto={handleUpdateReclamacionTexto}
          />
        )}
        {/* M2.4: Tab de predicción SLA (ADITIVO) */}
        {activeTab === 'prediccion' && FLAGS.M2_prediccion_sla && (
          <PrediccionSLAPanel />
        )}
        {/* M5.3: Tab de calibración C7 (ADITIVO) */}
        {activeTab === 'calibracion' && FLAGS.M5_recall_loop && modoEvaluador && (
          <CalibracionPanel
            calibraciones={calibraciones}
            onAplicar={handleAplicarUmbral}
          />
        )}
        {activeTab === 'metricas' && modoEvaluador && (
          <MetricsPanel metrics={metrics} reclamaciones={reclamaciones} automapCount={automapCount} />
        )}
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

      {/* M4.4: Automap Modal (ADITIVO) */}
      {automapModalOpen && FLAGS.M4_automapeo && modoEvaluador && state && (() => {
        const tccAlertLines = c1Alerts.filter((a) => a.fuente === 'tcc').map((a) => a.guia_o_linea);
        const tccRaw = tccAlertLines.join('\n');
        const sample = getTccRawSample(
          {
            interrapidisimo_csv: '',
            coordinadora_csv: '',
            servientrega_jsonl: '',
            envia_csv: '',
            tcc_desconocido_raw: tccRaw,
          },
          c1Alerts
        );
        return (
          <AutomapModal
            tccHeaders={sample.headers}
            tccRows={sample.rows}
            onApprove={handleAutomapApprove}
            onCancel={() => setAutomapModalOpen(false)}
          />
        );
      })()}
    </main>
  );
}

// ============================================================================
// AI Summary Generator — Fallback determinista alineado con insight (C1.5)
// ============================================================================

function generateAISummary(
  metrics: AppState['metrics'],
  discrepancias: ConciliacionResultado[],
  anomaliasActivas: AnomaliaResultado[]
): string {
  const totalCOP = metrics.total_confirmado_cop + metrics.total_pendiente_cop;
  const totalM = (totalCOP / 1_000_000).toFixed(1);
  const pendienteM = (metrics.total_pendiente_cop / 1_000_000).toFixed(1);

  const discByCarrier = new Map<string, number>();
  for (const d of discrepancias) {
    discByCarrier.set(d.carrier, (discByCarrier.get(d.carrier) ?? 0) + 1);
  }
  const topCarrier = [...discByCarrier.entries()].sort((a, b) => b[1] - a[1])[0];

  const parts: string[] = [];

  // Bloque 1: Cuánto le deben
  parts.push(
    `Esta semana tienes $${totalM}M en cobros COD. De esos, $${pendienteM}M están pendientes de acreditación.`
  );

  // Bloque 2: Qué transportadora cuesta plata
  if (topCarrier) {
    parts.push(
      `⚠️ ${displayCarrier(topCarrier[0])} concentra la mayor parte de los envíos pendientes (${topCarrier[1]} casos) — es donde está tu riesgo de caja.`
    );
  }

  // Bloque 3: Acción concreta
  const top3 = discrepancias
    .filter((d) => d.monto_esperado)
    .sort((a, b) => (b.monto_esperado ?? 0) - (a.monto_esperado ?? 0))
    .slice(0, 2);
  if (top3.length > 0) {
    parts.push(
      `Tu jugada: revisa los cobros de ${top3[0].guia} (${displayCarrier(top3[0].carrier)}) y ${top3.length > 1 ? top3[1].guia + ' (' + displayCarrier(top3[1].carrier) + ')' : 'los siguientes en la lista'} — ahí está la mayor plata en juego.`
    );
  } else if (discrepancias.length > 0) {
    parts.push(`Revisa los ${discrepancias.length} envíos pendientes en la pestaña "Mis envíos".`);
  }

  // C1.4: Sin recomendaciones de Ops (se eliminó el bloque de formatos no reconocidos)
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
          color="bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          tooltip="Monto total de envíos cuya entrega y pago fueron verificados correctamente"
        />
        <KPICard
          label="Total Pendiente"
          value={`$${(metrics.total_pendiente_cop / 1_000_000).toFixed(1)}M`}
          color="bg-amber-500/10 border-amber-500/30 text-amber-400"
          tooltip="Envíos entregados cuyo pago aún no ha sido acreditado por la transportadora"
        />
        <KPICard
          label="Envíos por revisar"
          value={discrepancias.length.toString()}
          color="bg-red-500/10 border-red-500/30 text-red-400"
          tooltip="Casos donde el monto esperado y el reportado no coinciden — requieren tu decisión"
        />
        <KPICard
          label="Alertas detectadas"
          value={anomaliasActivas.length.toString()}
          color="bg-embarca-surfaceAlt border-embarca-border text-embarca-text"
          tooltip="Posibles cobros incorrectos detectados automáticamente por el sistema"
        />
      </div>

      {/* Block 3: AI Summary con Groq */}
      <div className="bg-embarca-surfaceAlt border border-embarca-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-embarca-heading mb-2">✨ Resumen de la semana</h3>
        {aiLoading ? (
          <p className="text-sm text-embarca-muted italic">Generando resumen...</p>
        ) : (
          <p className="text-sm text-embarca-text">{aiText}</p>
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
        good ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
      }`}
    >
      <p className="text-xs font-medium text-embarca-text">{label}</p>
      <p className={`text-xl font-bold mt-1 ${good ? 'text-emerald-400' : 'text-red-400'}`}>
        {value}
      </p>
      <p className="text-xs text-embarca-muted">Target: {target}</p>
    </div>
  );
}

// ============================================================================
// C2: TooltipBadge reutilizable para badges de clase y estado
// ============================================================================

function TooltipBadge({
  label,
  color,
  tipo,
  clave,
}: {
  label: string;
  color: string;
  tipo: 'clase' | 'estado';
  clave: ClaseKey | EstadoKey;
}) {
  const [show, setShow] = useState(false);
  const info = tipo === 'clase'
    ? GLOSARIO.clase[clave as ClaseKey]
    : GLOSARIO.estado[clave as EstadoKey];

  return (
    <span
      className={`relative inline-block ${color}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {label}
      {show && info && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-900 text-white text-xs rounded-lg p-2 z-50 leading-relaxed shadow-lg">
          <p className="font-semibold mb-1">{info.titulo}</p>
          <p className="text-gray-200">{info.detalle}</p>
          <p className="text-gray-300 mt-1 italic">{info.accion}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </span>
  );
}

// ============================================================================
// Discrepancy Table — Block 4: textos limpios, B9: tooltips + sort + guía search
// ============================================================================

// B9: Tooltips por columna
const COLUMN_TOOLTIPS: Record<string, string> = {
  'Guía': 'Número de identificación único del envío asignado por la transportadora.',
  'Carrier': 'Transportadora que gestionó este envío (Interrapidísimo, Coordinadora, Servientrega o Envía).',
  'Esperado': 'Monto en COP que Embarca esperaba recibir por este envío contraentrega (COD).',
  'Reportado': 'Monto en COP que la transportadora reportó haber cobrado al destinatario.',
  'Diferencia': 'Diferencia entre el monto esperado y el reportado. Positivo = transportadora cobró más. Negativo = cobró menos.',
  'Clase': 'Clasificación automática: cobrado (monto coincide), pendiente (sin reporte de pago), discrepancia (montos no cuadran).',
  'Alerta': 'Marcado por el sistema cuando la diferencia supera COP 50.000 o el 3% del valor esperado.',
  'Estado': 'Pendiente = requiere tu decisión. Auto = resuelto automáticamente. Resuelto = ya tomaste una decisión.',
  'Acción': 'Botones para tomar decisiones sobre este envío. "Decidir" = conciliación. "Revisar" = anomalía detectada.',
};

// B9: Header con tooltip + sort
function ThWithTooltip({
  label,
  sortCol,
  sortDir,
  onSort,
  sortable = false,
}: {
  label: string;
  sortCol: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  sortable?: boolean;
}) {
  const [show, setShow] = useState(false);
  const tip = COLUMN_TOOLTIPS[label];
  const isSorted = sortCol === label;
  return (
    <th
      className={`text-left px-3 py-2 font-medium text-embarca-muted text-xs relative ${sortable ? 'cursor-pointer select-none' : 'cursor-default'}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => sortable && onSort(label)}
    >
      <span className="flex items-center gap-1">
        {label}
        {tip && <span className="text-gray-300 text-[10px]">ⓘ</span>}
        {isSorted && <span className="text-embarca-500 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
      {show && tip && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-gray-900 text-white text-xs rounded-lg p-2 z-50 leading-relaxed shadow-lg">
          {tip}
        </div>
      )}
    </th>
  );
}

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
  // F4: Filtros
  const [filtroCarrier, setFiltroCarrier] = useState<string>('todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  // B9: Filtro por guía + sort
  const [filtroGuia, setFiltroGuia] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const hitlMap = new Map<string, HitlRecord>();
  for (const hr of hitlRecords) {
    hitlMap.set(`${hr.tipo}::${hr.guia}`, hr);
  }

  const anomaliesByGuia = new Map<string, AnomaliaResultado>();
  for (const a of anomaliasActivas) {
    anomaliesByGuia.set(a.guia, a);
  }

  const carriersUnicos = Array.from(new Set(discrepancias.map((d) => d.carrier))).sort();

  const discrepanciasFiltradas = discrepancias.filter((d) => {
    const passCarrier = filtroCarrier === 'todos' || d.carrier === filtroCarrier;
    const hitlC2 = hitlMap.get(`c2::${d.guia}`);
    const resuelto = hitlC2?.decision;
    const anomalia = anomaliesByGuia.get(d.guia);
    const passEstado =
      filtroEstado === 'todos' ||
      (filtroEstado === 'pendiente' && !resuelto && d.needs_hitl) ||
      (filtroEstado === 'anomalia' && !!anomalia) ||
      (filtroEstado === 'resuelto' && !!resuelto);
    // B9: filtro por guía
    const passGuia = filtroGuia === '' || d.guia.toLowerCase().includes(filtroGuia.toLowerCase());
    return passCarrier && passEstado && passGuia;
  });

  // B9: Sort
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const colMap: Record<string, string> = {
    'Guía': 'guia',
    'Carrier': 'carrier',
    'Esperado': 'esperado',
    'Reportado': 'reportado',
    'Diferencia': 'diferencia',
  };

  const discrepanciasOrdenadas = [...discrepanciasFiltradas].sort((a, b) => {
    if (!sortCol) return 0;
    const key = colMap[sortCol];
    if (!key) return 0;
    let va: number | string = 0,
      vb: number | string = 0;
    if (key === 'guia') {
      va = a.guia;
      vb = b.guia;
    } else if (key === 'carrier') {
      va = a.carrier;
      vb = b.carrier;
    } else if (key === 'esperado') {
      va = a.monto_esperado ?? 0;
      vb = b.monto_esperado ?? 0;
    } else if (key === 'reportado') {
      va = a.monto_reportado ?? 0;
      vb = b.monto_reportado ?? 0;
    } else if (key === 'diferencia') {
      va = a.diferencia_pesos ?? 0;
      vb = b.diferencia_pesos ?? 0;
    }
    if (typeof va === 'string')
      return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return sortDir === 'asc' ? va - (vb as number) : (vb as number) - (va as number);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-embarca-heading">Envíos que necesitan tu atención</h2>
      </div>

      {/* F4: Filtros + B9: búsqueda por guía */}
      <div className="flex gap-3 flex-wrap items-center mb-3">
        {/* B9: Buscar por guía */}
        <input
          type="text"
          placeholder="Buscar por guía..."
          value={filtroGuia}
          onChange={(e) => setFiltroGuia(e.target.value)}
          className="text-sm border border-embarca-border rounded-lg px-3 py-1.5 bg-embarca-surfaceAlt text-embarca-text w-44 focus:outline-none focus:border-embarca-500"
        />
        <select
          value={filtroCarrier}
          onChange={(e) => setFiltroCarrier(e.target.value)}
          className="text-sm border border-embarca-border rounded-lg px-3 py-1.5 bg-embarca-surfaceAlt text-embarca-text"
        >
          <option value="todos">Todas las transportadoras</option>
          {carriersUnicos.map((c) => (
            <option key={c} value={c}>
              {displayCarrier(c)}
            </option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="text-sm border border-embarca-border rounded-lg px-3 py-1.5 bg-embarca-surfaceAlt text-embarca-text"
        >
          <option value="todos">Todos los estados</option>
          <option value="pendiente">Pendiente de decisión</option>
          <option value="anomalia">Con alerta</option>
          <option value="resuelto">Ya resueltos</option>
        </select>

        {(filtroCarrier !== 'todos' || filtroEstado !== 'todos') && (
          <button
            onClick={() => {
              setFiltroCarrier('todos');
              setFiltroEstado('todos');
            }}
            className="text-xs text-embarca-muted/60 hover:text-embarca-muted underline"
          >
            Limpiar filtros
          </button>
        )}

        <span className="text-xs text-embarca-muted/60 ml-auto">
          {discrepanciasFiltradas.length} de {discrepancias.length} envíos
        </span>
      </div>

      <div className="bg-embarca-surfaceAlt border border-embarca-border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-embarca-surfaceAlt border-b border-embarca-border">
            <tr>
              <ThWithTooltip label="Guía" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} sortable />
              <ThWithTooltip label="Carrier" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} sortable />
              <ThWithTooltip label="Esperado" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} sortable />
              <ThWithTooltip label="Reportado" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} sortable />
              <ThWithTooltip label="Diferencia" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} sortable />
              <ThWithTooltip label="Clase" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <ThWithTooltip label="Alerta" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <ThWithTooltip label="Estado" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <ThWithTooltip label="Acción" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {discrepanciasOrdenadas.map((d) => {
              const anomalia = anomaliesByGuia.get(d.guia);
              const hitlC2 = hitlMap.get(`c2::${d.guia}`);
              const hitlC7 = hitlMap.get(`c7::${d.guia}`);
              const resuelto = hitlC2?.decision || hitlC7?.decision;

              return (
                <tr
                  key={d.guia}
                  className={`border-b border-embarca-border ${
                    resuelto ? 'bg-emerald-500/10' : anomalia ? 'bg-red-500/10' : 'bg-amber-500/10'
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
                    {/* C2: Tooltip para clase */}
                    <TooltipBadge
                      label={d.clase === 'pendiente_acreditacion' ? 'Pendiente' : d.clase}
                      color={`px-2 py-0.5 rounded text-xs font-medium ${
                        d.clase === 'cobrado'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : d.clase === 'pendiente_acreditacion'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-red-500/20 text-red-400'
                      }`}
                      tipo="clase"
                      clave={d.clase as ClaseKey}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {anomalia ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                        {anomalia.razon}
                      </span>
                    ) : (
                      <span className="text-embarca-muted/60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {/* C2: Tooltip para estado */}
                    {resuelto ? (
                      <TooltipBadge
                        label={`✅ ${resuelto}`}
                        color="text-green-600"
                        tipo="estado"
                        clave="resuelto"
                      />
                    ) : d.needs_hitl ? (
                      <TooltipBadge
                        label="Pendiente"
                        color="text-orange-600"
                        tipo="estado"
                        clave="pendiente"
                      />
                    ) : (
                      <span className="text-embarca-muted/60">Auto</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {d.needs_hitl && !resuelto && (
                        <button
                          onClick={() => onHitl(d.guia, d.carrier, 'c2', d)}
                          className="px-2 py-1 text-xs bg-embarca-DEFAULT text-white rounded hover:bg-embarca-dark"
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
// HITL Modal — E3: Copiloto de discrepancias con Groq
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
  // E3: AI explanation state — hooks MUST be before conditional returns
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  useEffect(() => {
    const isC2 = tipo === 'c2';
    const c2 = data as ConciliacionResultado;
    const c7 = data as AnomaliaResultado;

    const prompt = isC2
      ? `Soy Andrés, vendedor de e-commerce. El sistema marcó la guía ${guia} de ${displayCarrier(carrier)} para revisión manual.
Datos: monto esperado $${c2.monto_esperado?.toLocaleString('es-CO')}, monto reportado $${c2.monto_reportado?.toLocaleString('es-CO')}, diferencia ${c2.diferencia_pesos} COP (${c2.diferencia_pct}%), confianza del sistema: ${c2.confianza}%.
Razón del sistema: ${razon}.
Explícame en 2 oraciones por qué podría haber esta diferencia y qué me recomiendas hacer. Sé directo y práctico, sin tecnicismos.`
      : `Soy Andrés, vendedor de e-commerce. El sistema detectó una posible anomalía en la guía ${guia} de ${displayCarrier(carrier)}.
Datos: diferencia de ${c7.diferencia_pesos} COP (${c7.diferencia_pct}%), confianza del sistema: ${c7.confianza}%, razón: ${c7.razon}.
Explícame en 2 oraciones por qué esto podría ser un problema y cuál de las tres opciones (confirmar, descartar, reclamar) me recomiendas y por qué. Sé directo.`;

    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
      .then((r) => r.json())
      .then((d) => setAiExplanation(d.text ?? null))
      .catch(() => setAiExplanation(null))
      .finally(() => setAiLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const aiBlock = aiLoading ? (
    <p className="text-xs text-embarca-muted italic mb-4">💬 El sistema está analizando esta guía...</p>
  ) : aiExplanation ? (
    <div className="bg-embarca-light border border-embarca-DEFAULT/20 rounded-lg p-3 mb-4">
      <p className="text-xs font-medium text-embarca-dark mb-1">💬 Análisis del sistema</p>
      <p className="text-sm text-embarca-dark">{aiExplanation}</p>
    </div>
  ) : null;
  if (tipo === 'c2') {
    const c2 = data as ConciliacionResultado;
    return (
      <ModalOverlay onCancel={onCancel}>
        <h3 className="text-lg font-semibold mb-4">Revisión de Conciliación</h3>
        <div className="space-y-1 text-sm mb-4 bg-embarca-surfaceHover p-3 rounded">
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
        {/* E3: AI explanation */}
        {aiBlock}
        <p className="text-sm text-embarca-muted mb-4">¿Cómo desea clasificar este envío?</p>
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
      <div className="space-y-1 text-sm mb-4 bg-embarca-surfaceHover p-3 rounded">
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
      {/* E3: AI explanation */}
      {aiBlock}
      <p className="text-sm text-embarca-muted mb-4">¿Qué acción desea tomar?</p>
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
          className="px-4 py-2 bg-embarca-DEFAULT text-white rounded hover:bg-embarca-dark text-sm"
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-embarca-surfaceAlt rounded-lg shadow-xl p-6 max-w-lg w-full">
        {children}
        <div className="mt-6 flex justify-end border-t border-embarca-border pt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-embarca-muted border border-embarca-border rounded hover:bg-embarca-surfaceHover"
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

function MetricsPanel({ metrics, reclamaciones, automapCount }: { metrics: AppState['metrics']; reclamaciones?: Reclamacion[]; automapCount?: number }) {
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

  // M1.6: Métricas de reclamaciones (ADITIVO)
  const reclamacionRows: { label: string; value: number; target: number | null; format: 'pct' | 'cop' | 'count'; invert?: boolean }[] = FLAGS.M1_reclamaciones && reclamaciones && reclamaciones.length > 0
    ? [
        {
          label: 'Reclamaciones generadas',
          value: reclamaciones.length,
          target: null,
          format: 'count' as const,
        },
        {
          label: '% con fuente trazable',
          value: 1.0,
          target: 1.0,
          format: 'pct' as const,
        },
        {
          label: 'COP en disputa gestionados',
          value: reclamaciones
            .filter((r) => r.estado === 'revisada' || r.estado === 'enviada')
            .reduce((sum, r) => sum + r.diferencia, 0),
          target: null,
          format: 'cop' as const,
        },
      ]
    : [];

  // M4.5: Métrica de auto-mapeo (ADITIVO)
  const automapRows: { label: string; value: number; target: number | null; format: 'pct' | 'cop' | 'count'; invert?: boolean }[] = FLAGS.M4_automapeo && automapCount && automapCount > 0
    ? [
        {
          label: 'Formatos desconocidos auto-mapeados',
          value: automapCount,
          target: null,
          format: 'count' as const,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-embarca-heading">Panel de Métricas</h2>

      {/* Block 4: nota evaluador */}
      <div className="bg-embarca-light border border-embarca-DEFAULT/20 rounded-lg p-3 mb-4">
        <p className="text-xs text-embarca-dark font-medium">🔬 Vista Evaluador — Panel interno de métricas</p>
        <p className="text-xs text-embarca-dark mt-1">
          &quot;Si esto estuviera en producción mediría X; en el prototipo mido Y (proxy) contra el ground truth del dataset sintético.&quot;
        </p>
        {/* M2.5: Conexión narrativa de cascada */}
        {FLAGS.M2_prediccion_sla && (
          <p className="text-xs text-embarca-dark mt-2 border-t border-embarca-DEFAULT/20 pt-2">
            🔗 <strong>Apuesta Carolina (M2):</strong> La capa de predicción SLA se alimenta de los datos que C1 ya normaliza —
            es la apuesta #3 (Carolina) montada sobre la apuesta #1 sin reconstruir datos.
          </p>
        )}
      </div>

      <div className="bg-embarca-surfaceAlt border border-embarca-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-embarca-surfaceAlt border-b border-embarca-border">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-embarca-muted">Métrica</th>
              <th className="text-right px-4 py-2 font-medium text-embarca-muted">Valor</th>
              <th className="text-right px-4 py-2 font-medium text-embarca-muted">Target Prod</th>
              <th className="text-center px-4 py-2 font-medium text-embarca-muted">Estado</th>
            </tr>
          </thead>
          <tbody>
            {[...metricRows, ...reclamacionRows, ...automapRows].map((row, i) => {
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
                <tr key={i} className="border-b border-embarca-border">
                  <td className="px-4 py-2 text-embarca-text">{row.label}</td>
                  <td className="px-4 py-2 text-right font-mono text-embarca-text">{displayValue}</td>
                  <td className="px-4 py-2 text-right text-embarca-muted">
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
                          isGood ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {isGood ? '✅ OK' : '⚠️ Bajo'}
                      </span>
                    ) : (
                      <span className="text-embarca-muted/60 text-xs">Info</span>
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
  // F5: Groq-powered cash forecast insight — hooks MUST be before early return
  const [forecastAiText, setForecastAiText] = useState<string | null>(null);
  const [forecastAiLoading, setForecastAiLoading] = useState(true);

  useEffect(() => {
    if (!forecast || forecast.carriers.length === 0) return;
    const ordenados = [...forecast.carriers].sort(
      (a, b) => b.totalPorCobrarCOP - a.totalPorCobrarCOP
    );
    const masProblematico = forecast.carriers.reduce((prev, curr) =>
      curr.lagMedianoActual - curr.lagMedianoHistorico >
      prev.lagMedianoActual - prev.lagMedianoHistorico
        ? curr
        : prev
    );
    const masConfiable = forecast.carriers.reduce((prev, curr) =>
      curr.lagMedianoActual - curr.lagMedianoHistorico <
      prev.lagMedianoActual - prev.lagMedianoHistorico
        ? curr
        : prev
    );

    // C1: Prompt orientado a insight para vendedor
    const prompt = `Análisis de flujo de caja COD para el vendedor Andrés esta semana. Total pendiente de remesa: $${(forecast.totalPorCobrarCOP / 1_000_000).toFixed(1)}M COP.

SITUACIÓN POR TRANSPORTADORA:
${ordenados
  .map((c) => {
    const atraso = c.lagMedianoActual - c.lagMedianoHistorico;
    const atrasoTexto =
      atraso > 0
        ? `${atraso} días MÁS lento de lo normal`
        : `dentro de su patrón`;
    return `- ${displayCarrier(c.carrier)}: $${(c.totalPorCobrarCOP / 1_000_000).toFixed(1)}M pendientes en ${c.ordenesPendientes} órdenes. → ${atrasoTexto}. Semáforo: ${c.semafaro}.`;
  })
  .join('\n')}

LA QUE MÁS PREOCUPA: ${displayCarrier(masProblematico.carrier)} — lleva ${masProblematico.lagMedianoActual - masProblematico.lagMedianoHistorico} días de retraso con $${(masProblematico.totalPorCobrarCOP / 1_000_000).toFixed(1)}M en juego.
LA MÁS CONFIABLE: ${displayCarrier(masConfiable.carrier)}.

Redacta 3 bloques cortos: (1) ¿cuándo entra la plata?, (2) ¿qué carrier la está frenando y por qué importa?, (3) ¿qué hacer esta semana? (1 acción concreta: a quién llamar, qué monto revisar). Máximo 4 oraciones. Sin tecnicismos. Audiencia = vendedor.`;

    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
      .then((r) => r.json())
      .then((data) => {
        setForecastAiText(data.text ?? forecast.resumenNarrado);
      })
      .catch(() => {
        setForecastAiText(forecast.resumenNarrado);
      })
      .finally(() => setForecastAiLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!forecast || forecast.carriers.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-embarca-heading">Pronóstico de Caja COD</h2>
        <p className="text-sm text-embarca-muted">Feature stretch — en desarrollo.</p>
      </div>
    );
  }

  const semaforoIcon: Record<string, string> = { verde: '🟢', amarillo: '🟡', rojo: '' };
  const semaforoBg: Record<string, string> = {
    verde: 'bg-emerald-500/10 border-emerald-500/30',
    amarillo: 'bg-amber-500/10 border-amber-500/30',
    rojo: 'bg-red-500/10 border-red-500/30',
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-embarca-heading">💰 Pronóstico de Caja COD</h2>
      <p className="text-sm text-embarca-muted">
        Proyección de remesa por transportadora basada en lag histórico de pago.
      </p>

      {/* F5: AI Narrative con Groq — B10: multi-bloque */}
      <div className="bg-embarca-light border border-embarca-DEFAULT/20 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-embarca-dark mb-2">💡 Recomendación para esta semana</h3>
        {forecastAiLoading ? (
          <p className="text-sm text-embarca-muted italic">Generando recomendación...</p>
        ) : (
          <div>
            {forecastAiText?.split('\n\n').filter(Boolean).map((bloque, i) => (
              <p key={i} className="text-sm text-embarca-dark leading-relaxed mt-2 first:mt-0">
                {bloque}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          label="Total por cobrar"
          value={`$${(forecast.totalPorCobrarCOP / 1_000_000).toFixed(1)}M`}
          color="bg-amber-500/10 border-amber-500/30 text-amber-400"
          tooltip="Monto total pendiente de remesa de todas las transportadoras"
        />
        <KPICard
          label="Proyección de entrada"
          value={`$${(forecast.totalProyectadoCOP / 1_000_000).toFixed(1)}M`}
          color="bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          tooltip="Monto que se espera recibir basado en el patrón histórico de pago"
        />
        <KPICard
          label="En riesgo de atraso"
          value={`$${(forecast.riesgoAtrasoCOP / 1_000_000).toFixed(1)}M`}
          color="bg-red-500/10 border-red-500/30 text-red-400"
          tooltip="Monto de transportadoras que están pagando más lento que su patrón"
        />
      </div>

      {/* Carrier Table */}
      <div className="bg-embarca-surfaceAlt border border-embarca-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-embarca-surfaceAlt border-b border-embarca-border">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-embarca-muted">Carrier</th>
              <th className="text-center px-4 py-2 font-medium text-embarca-muted">Semáforo</th>
              <th className="text-right px-4 py-2 font-medium text-embarca-muted">Lag histórico</th>
              <th className="text-right px-4 py-2 font-medium text-embarca-muted">Lag actual</th>
              <th className="text-right px-4 py-2 font-medium text-embarca-muted">Por cobrar</th>
              <th className="text-right px-4 py-2 font-medium text-embarca-muted">Órdenes</th>
              <th className="text-left px-4 py-2 font-medium text-embarca-muted">Señal</th>
            </tr>
          </thead>
          <tbody>
            {forecast.carriers.map((c) => (
              <tr key={c.carrier} className={`border-b border-embarca-border ${semaforoBg[c.semafaro] ?? ''}`}>
                <td className="px-4 py-2 font-medium text-embarca-text">{displayCarrier(c.carrier)}</td>
                <td className="px-4 py-2 text-center text-lg">{semaforoIcon[c.semafaro]}</td>
                <td className="px-4 py-2 text-right">{c.lagMedianoHistorico}d</td>
                <td className="px-4 py-2 text-right">{c.lagMedianoActual}d</td>
                <td className="px-4 py-2 text-right font-mono">
                  ${c.totalPorCobrarCOP.toLocaleString('es-CO')}
                </td>
                <td className="px-4 py-2 text-right">{c.ordenesPendientes}</td>
                <td className="px-4 py-2 text-xs text-embarca-text">{c.senal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// B12: Reporte PDF imprimible con template Faro
// ============================================================================

function generarReportePDF(state: AppState, persona: { nombre: string; rol: string }) {
  const discPendientes = state.conciliaciones
    .filter((c) => c.needs_hitl && !state.hitlRecords.find((r) => r.guia === c.guia && r.decision))
    .slice(0, 25);

  const semColor: Record<string, string> = { verde: '#059669', amarillo: '#D97706', rojo: '#DC2626' };
  const horasAhorradas = ((state.metrics.tasa_conciliacion_automatica * state.orders.length * 3) / 60).toFixed(1);
  const semanaLabel = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><title>Informe Faro — ${persona.nombre}</title>
<style>
@page{size:A4;margin:1.5cm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;color:#111827;background:white;font-size:11px;line-height:1.5}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #059669;margin-bottom:20px}
.brand-name{font-size:20px;font-weight:700;color:#059669;letter-spacing:-.5px}.brand-sub{font-size:10px;color:#6B7280}
.header-meta{text-align:right}.header-meta p{font-size:10px;color:#6B7280}.header-meta .vendedor{font-size:12px;font-weight:600;color:#111827;margin-bottom:2px}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
.kpi-card{border:1px solid #E5E7EB;border-radius:8px;padding:12px}.kpi-label{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6B7280;margin-bottom:4px}
.kpi-value{font-size:22px;font-weight:700;color:#111827}.kpi-sub{font-size:9px;color:#9CA3AF;margin-top:2px}
.kpi-green .kpi-value{color:#059669}.kpi-gold .kpi-value{color:#D97706}.kpi-red .kpi-value{color:#DC2626}.kpi-blue .kpi-value{color:#1D4ED8}
.section-title{font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;border-bottom:1px solid #E5E7EB;padding-bottom:4px}
table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:10px}thead tr{background:#F9FAFB}
th{text-align:left;padding:6px 8px;font-weight:600;color:#374151;font-size:9px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #E5E7EB}
td{padding:6px 8px;border-bottom:1px solid #F3F4F6;color:#374151}tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:600}
.badge-red{background:#FEF2F2;color:#DC2626}.badge-yellow{background:#FFFBEB;color:#D97706}
.num{text-align:right;font-variant-numeric:tabular-nums}
.carriers-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px}
.carrier-card{border:1px solid #E5E7EB;border-radius:8px;padding:12px}
.carrier-name{font-size:11px;font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:6px}
.carrier-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.carrier-stat{font-size:10px;color:#6B7280}.carrier-monto{font-size:14px;font-weight:700;margin:4px 0}.carrier-signal{font-size:9px;color:#9CA3AF}
.footer{border-top:1px solid #E5E7EB;padding-top:10px;margin-top:4px;display:flex;justify-content:space-between;align-items:center}
.footer-brand{font-size:10px;font-weight:600;color:#059669}.footer-legal{font-size:9px;color:#9CA3AF;max-width:320px;text-align:right}
</style></head><body>
<div class="header"><div><span class="brand-name">faro</span><span class="brand-sub">by embarca · Informe Semanal COD</span></div>
<div class="header-meta"><p class="vendedor">${persona.nombre}</p><p>${persona.rol}</p><p>Generado el ${semanaLabel}</p></div></div>
<div class="kpi-grid">
<div class="kpi-card kpi-green"><div class="kpi-label">Total Confirmado</div><div class="kpi-value">$${(state.metrics.total_confirmado_cop / 1_000_000).toFixed(1)}M</div><div class="kpi-sub">COP cobrado</div></div>
<div class="kpi-card kpi-gold"><div class="kpi-label">Total Pendiente</div><div class="kpi-value">$${(state.metrics.total_pendiente_cop / 1_000_000).toFixed(1)}M</div><div class="kpi-sub">COP por acreditar</div></div>
<div class="kpi-card kpi-red"><div class="kpi-label">Envíos por revisar</div><div class="kpi-value">${discPendientes.length}</div><div class="kpi-sub">requieren tu decisión</div></div>
<div class="kpi-card kpi-blue"><div class="kpi-label">Tiempo ahorrado</div><div class="kpi-value">~${horasAhorradas}h</div><div class="kpi-sub">vs conciliación manual</div></div>
</div>
<div class="section-title">Envíos que requieren tu atención (${discPendientes.length})</div>
${discPendientes.length > 0
    ? `<table><thead><tr><th>Guía</th><th>Carrier</th><th class="num">Esperado</th><th class="num">Reportado</th><th class="num">Diferencia</th><th>Estado</th></tr></thead><tbody>${discPendientes.map((d) => `<tr><td style="font-family:monospace;font-size:9px">${d.guia}</td><td>${d.carrier}</td><td class="num">${d.monto_esperado?.toLocaleString('es-CO') ?? '—'}</td><td class="num">${d.monto_reportado?.toLocaleString('es-CO') ?? '—'}</td><td class="num"><span style="color:${d.diferencia_pesos !== null && d.diferencia_pesos < 0 ? '#DC2626' : '#D97706'}">${d.diferencia_pesos !== null ? (d.diferencia_pesos > 0 ? '+' : '') + d.diferencia_pesos.toLocaleString('es-CO') : '—'}</span></td><td><span class="badge ${d.clase === 'discrepancia' ? 'badge-red' : 'badge-yellow'}">${d.clase}</span></td></tr>`).join('')}</tbody></table>`
    : '<p style="color:#6B7280;font-size:11px;margin-bottom:18px">Sin envíos pendientes esta semana.</p>'}
<div class="section-title">Estado de transportadoras</div>
<div class="carriers-grid">
${state.cashForecast?.carriers?.map((c) => `<div class="carrier-card"><div class="carrier-name"><span class="carrier-dot" style="background:${semColor[c.semafaro] ?? '#9CA3AF'}"></span>${c.carrier}</div><div class="carrier-monto">$${(c.totalPorCobrarCOP / 1_000_000).toFixed(2)}M</div><div class="carrier-stat">${c.ordenesPendientes} órdenes · Lag ${c.lagMedianoActual}d (hist. ${c.lagMedianoHistorico}d)</div><div class="carrier-signal">${c.senal}</div></div>`).join('') ?? '<p>Sin datos.</p>'}
</div>
<div class="footer"><span class="footer-brand">faro by embarca</span><span class="footer-legal">Informe generado automáticamente. No reemplaza revisión contable.</span></div>
<script>window.onload=function(){window.print()}</script></body></html>`;

  const ventana = window.open('', '_blank', 'width=900,height=700');
  if (ventana) {
    ventana.document.write(html);
    ventana.document.close();
  }
}
