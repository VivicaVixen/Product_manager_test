import { NextResponse } from 'next/server';
import type { HitlRecord, BundleInput } from '@/lib/types';
import { loadAllBundles } from '@/lib/seed';
import { runPipeline } from '@/lib/pipeline';

/**
 * API: /api/pipeline
 * GET  — Carga fresco desde bundles, con soporte de persona (slice + multiplier).
 * POST — Recibe hitlRecords del cliente, retorna state actualizado.
 * El servidor NO guarda estado — el cliente es la fuente de verdad.
 */

// B8: Persona configs
const PERSONA_CONFIG: Record<string, { slice: number; multiplier: number }> = {
  andres:     { slice: 795, multiplier: 1.0 },
  carolina:   { slice: 420, multiplier: 0.75 },
  tienda:     { slice: 95,  multiplier: 0.18 },
  enterprise: { slice: 795, multiplier: 4.2 },
};

function applyPersona(bundles: BundleInput[], persona: string): BundleInput[] {
  const config = PERSONA_CONFIG[persona] ?? PERSONA_CONFIG.andres;
  return bundles.map((b) => ({
    ...b,
    orders: b.orders
      .slice(0, Math.ceil(b.orders.length * (config.slice / 795)))
      .map((o) => ({
        ...o,
        monto_esperado_cod: Math.round(o.monto_esperado_cod * config.multiplier),
      })),
  }));
}

// GET — siempre carga fresco desde bundles, con soporte de persona
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const persona = searchParams.get('persona') ?? 'andres';

    const bundles = await loadAllBundles();
    const slicedBundles = applyPersona(bundles, persona);
    const state = runPipeline(slicedBundles, []);
    return NextResponse.json({ success: true, state });
  } catch (error) {
    console.error('Pipeline GET error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// POST — recibe hitlRecords del cliente, retorna state actualizado
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const hitlRecords: HitlRecord[] = body.hitlRecords ?? [];
    const bundles = await loadAllBundles();
    const state = runPipeline(bundles, hitlRecords);
    return NextResponse.json({ success: true, state });
  } catch (error) {
    console.error('Pipeline POST error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
