import { NextResponse } from 'next/server';
import type { HitlRecord } from '@/lib/types';
import { loadAllBundles } from '@/lib/seed';
import { runPipeline } from '@/lib/pipeline';

/**
 * API: /api/pipeline
 * GET  — Carga fresco desde bundles, con soporte de persona (slice + multiplier).
 * POST — Recibe hitlRecords del cliente, retorna state actualizado.
 * El servidor NO guarda estado — el cliente es la fuente de verdad.
 */

// B8: Persona configs.
// FIX C4: la persona ahora es SOLO un multiplicador de escala uniforme que el
// pipeline aplica de forma consistente a órdenes + guías + ground truth.
// Se eliminó el `slice` (recortaba órdenes pero no carrier_raw → guías huérfanas)
// y el escalado parcial de applyPersona (escalaba órdenes pero no guías → total a 0).
const PERSONA_SCALE: Record<string, number> = {
  andres:     1.0,
  carolina:   0.75,
  tienda:     0.18,
  enterprise: 4.2,
};

function scaleFor(persona: string): number {
  return PERSONA_SCALE[persona] ?? PERSONA_SCALE.andres;
}

// GET — siempre carga fresco desde bundles, con soporte de persona
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const persona = searchParams.get('persona') ?? 'andres';

    const bundles = await loadAllBundles();
    const state = runPipeline(bundles, [], scaleFor(persona));
    return NextResponse.json({ success: true, state });
  } catch (error) {
    console.error('Pipeline GET error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// POST — recibe hitlRecords + persona del cliente, retorna state actualizado.
// FIX C4: ahora recibe persona y aplica el MISMO escalado que GET, evitando el
// salto de escala (antes el POST recalculaba siempre a escala Andrés).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const hitlRecords: HitlRecord[] = body.hitlRecords ?? [];
    const persona: string = body.persona ?? 'andres';
    const bundles = await loadAllBundles();
    const state = runPipeline(bundles, hitlRecords, scaleFor(persona));
    return NextResponse.json({ success: true, state });
  } catch (error) {
    console.error('Pipeline POST error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
