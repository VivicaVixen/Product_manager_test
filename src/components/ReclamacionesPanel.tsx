// components/ReclamacionesPanel.tsx (NUEVO — M1.5)
// Panel de reclamaciones generadas. Se monta como tab condicional en C3.
'use client';

import { useState } from 'react';
import type { Reclamacion } from '@/lib/types_reclamacion';

const CARRIER_DISPLAY_NAMES: Record<string, string> = {
  interrapidisimo: 'Interrapidísimo',
  coordinadora: 'Coordinadora',
  servientrega: 'Servientrega',
  envia: 'Envía',
  tcc: 'TCC',
};

const ESTADO_COLORS: Record<string, string> = {
  borrador: 'bg-yellow-100 text-yellow-800',
  revisada: 'bg-blue-100 text-blue-800',
  enviada: 'bg-green-100 text-green-800',
};

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  revisada: 'Revisada',
  enviada: 'Enviada',
};

export default function ReclamacionesPanel({
  reclamaciones,
  onUpdateEstado,
  onUpdateTexto,
}: {
  reclamaciones: Reclamacion[];
  onUpdateEstado: (id: string, estado: Reclamacion['estado']) => void;
  onUpdateTexto: (id: string, texto: string) => void;
}) {
  const totalEnDisputa = reclamaciones
    .filter((r) => r.estado === 'revisada' || r.estado === 'enviada')
    .reduce((sum, r) => sum + r.diferencia, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          📨 Reclamaciones a Transportadoras
        </h2>
      </div>

      {/* M1.6: KPI de COP en disputa gestionados */}
      <div className="bg-embarca-light border border-embarca-DEFAULT/20 rounded-xl px-5 py-3">
        <p className="text-sm font-semibold text-embarca-dark">
          {reclamaciones.length} reclamación{reclamaciones.length !== 1 ? 'es' : ''} · COP{' '}
          {totalEnDisputa.toLocaleString('es-CO')} en disputa gestionados
        </p>
      </div>

      {reclamaciones.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500">
            No se han generado reclamaciones aún. Confirma una discrepancia en &quot;Mis envíos&quot; y selecciona &quot;Reclamar a transportadora&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reclamaciones.map((r) => (
            <ReclamacionCard
              key={r.id}
              reclamacion={r}
              onUpdateEstado={onUpdateEstado}
              onUpdateTexto={onUpdateTexto}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReclamacionCard({
  reclamacion,
  onUpdateEstado,
  onUpdateTexto,
}: {
  reclamacion: Reclamacion;
  onUpdateEstado: (id: string, estado: Reclamacion['estado']) => void;
  onUpdateTexto: (id: string, texto: string) => void;
}) {
  const [editando, setEditando] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reclamacion.textoGenerado);
    } catch {
      // Fallback para entornos sin clipboard API
      const ta = document.createElement('textarea');
      ta.value = reclamacion.textoGenerado;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-gray-500">{reclamacion.guia}</span>
          <span className="text-sm font-medium text-gray-800">
            {CARRIER_DISPLAY_NAMES[reclamacion.carrier] ?? reclamacion.carrier}
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_COLORS[reclamacion.estado]}`}
        >
          {ESTADO_LABELS[reclamacion.estado]}
        </span>
      </div>

      {/* Montos */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-gray-500">Esperado</p>
          <p className="font-mono font-medium">${reclamacion.montoEsperado.toLocaleString('es-CO')}</p>
        </div>
        <div>
          <p className="text-gray-500">Reportado</p>
          <p className="font-mono font-medium">
            {reclamacion.montoReportado !== null
              ? `$${reclamacion.montoReportado.toLocaleString('es-CO')}`
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Diferencia</p>
          <p className="font-mono font-medium text-red-600">
            ${reclamacion.diferencia.toLocaleString('es-CO')}
          </p>
        </div>
      </div>

      {/* Texto editable */}
      {editando ? (
        <textarea
          value={reclamacion.textoGenerado}
          onChange={(e) => onUpdateTexto(reclamacion.id, e.target.value)}
          className="w-full text-sm border border-gray-300 rounded-lg p-3 min-h-[100px] font-normal leading-relaxed"
        />
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3">
          {reclamacion.textoGenerado}
        </p>
      )}

      {/* Fuente trazabilidad */}
      <p className="text-xs text-gray-400">Fuente: {reclamacion.fuente}</p>

      {/* Botones */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setEditando((v) => !v)}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          {editando ? 'Terminar edición' : 'Editar texto'}
        </button>
        <button
          onClick={handleCopy}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          📋 Copiar texto
        </button>
        {reclamacion.estado === 'borrador' && (
          <button
            onClick={() => onUpdateEstado(reclamacion.id, 'revisada')}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Marcar revisada
          </button>
        )}
        {reclamacion.estado === 'revisada' && (
          <button
            onClick={() => onUpdateEstado(reclamacion.id, 'enviada')}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Marcar enviada
          </button>
        )}
      </div>
    </div>
  );
}
