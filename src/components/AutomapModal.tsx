// components/AutomapModal.tsx (NUEVO — M4.4)
// UI de aprobación de mapeo de columnas TCC. Solo Vista Evaluador/Ops.
'use client';

import { useState } from 'react';
import type { Automapping } from '@/lib/automap_apply';
import { applyMapping } from '@/lib/automap_apply';
import type { GuiaNormalizada } from '@/lib/types';

const SCHEMA_CANONICO = ['guia', 'estado', 'monto', 'fecha', 'transportadora'] as const;

export default function AutomapModal({
  tccHeaders,
  tccRows,
  onApprove,
  onCancel,
}: {
  tccHeaders: string[];
  tccRows: string[][];
  onApprove: (mapping: Automapping, filasMapeadas: GuiaNormalizada[]) => void;
  onCancel: () => void;
}) {
  const [mapping, setMapping] = useState<Automapping>(
    Object.fromEntries(SCHEMA_CANONICO.map((c) => [c, null]))
  );
  const [sugerenciaIA, setSugerenciaIA] = useState<Automapping | null>(null);
  const [loadingIA, setLoadingIA] = useState(false);
  const [previewFilas, setPreviewFilas] = useState<GuiaNormalizada[]>([]);

  const handleSugerirIA = async () => {
    setLoadingIA(true);
    try {
      const prompt = `Formato desconocido TCC con columnas: ${tccHeaders.join(', ')}
Muestra de datos:
${tccRows.slice(0, 3).map((r) => r.join(' | ')).join('\n')}

Esquema canónico requerido: ${SCHEMA_CANONICO.join(', ')}.
Devuelve SOLO un JSON mapeando cada campo canónico al nombre de columna origen, o null si no hay match.`;

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'automap', prompt }),
      });
      const data = await res.json();
      const m = data.mapping ?? {};
      setSugerenciaIA(m);
      // Aplicar solo las columnas no nulas
      setMapping((prev) => {
        const updated = { ...prev };
        for (const campo of SCHEMA_CANONICO) {
          if (m[campo]) {
            updated[campo] = m[campo];
          }
        }
        return updated;
      });
    } catch {
      // Fallback: mapeo vacío
    } finally {
      setLoadingIA(false);
    }
  };

  const handlePreview = () => {
    const filas = applyMapping(tccRows, mapping);
    setPreviewFilas(filas);
  };

  const handleApprove = () => {
    const filas = applyMapping(tccRows, mapping);
    onApprove(mapping, filas);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-embarca-surfaceAlt rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">🔧 Sugerir mapeo de columnas TCC</h3>

        {/* Botón IA */}
        <div className="mb-4">
          <button
            onClick={handleSugerirIA}
            disabled={loadingIA}
            className="px-4 py-2 text-sm bg-embarca-DEFAULT text-white rounded-lg hover:bg-embarca-dark disabled:opacity-50"
          >
            {loadingIA ? 'Sugiriendo...' : '✨ Sugerir mapeo (IA)'}
          </button>
          {sugerenciaIA && (
            <p className="text-xs text-emerald-400 mt-1">✅ Sugerencia aplicada — revisa y ajusta si es necesario.</p>
          )}
        </div>

        {/* Tabla de mapeo */}
        <table className="w-full text-sm mb-4 border border-embarca-border rounded-lg overflow-hidden">
          <thead className="bg-embarca-surfaceHover">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-embarca-muted text-xs">Campo canónico</th>
              <th className="text-left px-3 py-2 font-medium text-embarca-muted text-xs">Columna origen</th>
            </tr>
          </thead>
          <tbody>
            {SCHEMA_CANONICO.map((campo) => (
              <tr key={campo} className="border-b border-embarca-border">
                <td className="px-3 py-2 font-medium text-xs">{campo}</td>
                <td className="px-3 py-2">
                  <select
                    value={mapping[campo] ?? ''}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [campo]: e.target.value || null }))
                    }
                    className="text-sm border border-embarca-border bg-embarca-surfaceHover text-embarca-text rounded px-2 py-1 w-full"
                  >
                    <option value="">— sin mapear —</option>
                    {tccHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Preview */}
        <button
          onClick={handlePreview}
          className="px-3 py-1.5 text-xs border border-embarca-border rounded-lg hover:bg-embarca-surfaceHover text-embarca-muted mb-3"
        >
          👁️ Vista previa ({tccRows.length} filas)
        </button>

        {previewFilas.length > 0 && (
          <div className="bg-embarca-surfaceHover border border-embarca-border rounded-lg p-3 mb-4 overflow-x-auto">
            <p className="text-xs font-medium text-embarca-muted mb-2">Vista previa de filas mapeadas:</p>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-embarca-border">
                  <th className="text-left px-2 py-1">guia</th>
                  <th className="text-left px-2 py-1">estado</th>
                  <th className="text-right px-2 py-1">monto</th>
                  <th className="text-left px-2 py-1">fecha</th>
                </tr>
              </thead>
              <tbody>
                {previewFilas.slice(0, 5).map((f, i) => (
                  <tr key={i} className="border-b border-embarca-border">
                    <td className="px-2 py-1">{f.guia_id}</td>
                    <td className="px-2 py-1">{f.estado}</td>
                    <td className="px-2 py-1 text-right">{f.monto ?? '—'}</td>
                    <td className="px-2 py-1">{f.fecha ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-2 justify-end border-t border-embarca-border pt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-embarca-muted border border-embarca-border rounded hover:bg-embarca-surfaceHover"
          >
            Cancelar
          </button>
          <button
            onClick={handleApprove}
            className="px-4 py-2 text-sm bg-embarca-DEFAULT text-white rounded hover:bg-embarca-dark"
          >
            ✅ Aprobar mapeo
          </button>
        </div>
      </div>
    </div>
  );
}
