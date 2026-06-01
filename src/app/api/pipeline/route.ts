import { NextResponse } from 'next/server';
import type { BundleInput, HitlRecord, AppState } from '@/lib/types';
import { loadAllBundles } from '@/lib/seed';
import { runPipeline } from '@/lib/pipeline';

/**
 * API: /api/pipeline
 * GET  — Carga el seed, ejecuta C1→C2→C7, retorna el estado completo.
 * POST — Recibe decisiones HITL y re-ejecuta el pipeline.
 */

// Estado en memoria del servidor (persiste entre requests en serverless)
let currentState: AppState | null = null;

export async function GET() {
  try {
    // Si ya tenemos estado con HITL, re-ejecutamos con las decisiones previas
    if (currentState && currentState.hitlRecords.length > 0) {
      const bundles = await loadAllBundles();
      currentState = runPipeline(bundles, currentState.hitlRecords);
    } else if (!currentState) {
      const bundles = await loadAllBundles();
      currentState = runPipeline(bundles);
    }

    return NextResponse.json({
      success: true,
      state: currentState,
    });
  } catch (error) {
    console.error('Pipeline error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Reset: limpiar estado y recargar desde cero
    if (body.reset) {
      const bundles = await loadAllBundles();
      currentState = runPipeline(bundles);
      return NextResponse.json({
        success: true,
        state: currentState,
      });
    }

    const hitlDecision: HitlRecord = body.decision;

    if (!hitlDecision || !hitlDecision.guia || !hitlDecision.tipo) {
      return NextResponse.json(
        { success: false, error: 'Decisión HITL inválida' },
        { status: 400 }
      );
    }

    const bundles = await loadAllBundles();

    // Obtener HITL previos o iniciar nuevo
    const prevHitl = currentState?.hitlRecords ?? [];

    // Agregar/actualizar la decisión
    const updatedHitl = [...prevHitl];
    const idx = updatedHitl.findIndex(
      (h) => h.guia === hitlDecision.guia && h.tipo === hitlDecision.tipo
    );
    if (idx >= 0) {
      updatedHitl[idx] = hitlDecision;
    } else {
      updatedHitl.push(hitlDecision);
    }

    currentState = runPipeline(bundles, updatedHitl);

    return NextResponse.json({
      success: true,
      state: currentState,
    });
  } catch (error) {
    console.error('HITL error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
