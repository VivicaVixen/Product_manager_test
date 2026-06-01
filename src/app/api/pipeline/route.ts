import { NextResponse } from 'next/server';
import type { HitlRecord } from '@/lib/types';
import { loadAllBundles } from '@/lib/seed';
import { runPipeline } from '@/lib/pipeline';

/**
 * API: /api/pipeline
 * GET  — Carga fresco desde bundles, sin HITL.
 * POST — Recibe hitlRecords del cliente, retorna state actualizado.
 * El servidor NO guarda estado — el cliente es la fuente de verdad.
 */

// GET — siempre carga fresco desde bundles, sin HITL
export async function GET() {
  try {
    const bundles = await loadAllBundles();
    const state = runPipeline(bundles, []);
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
