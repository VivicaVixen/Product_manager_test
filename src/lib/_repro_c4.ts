/* REPRO C4 — diagnóstico del total que se va a $0. Borrar tras diagnosticar. */
import { loadAllBundles } from './seed';
import { runPipeline } from './pipeline';
import type { HitlRecord, ConciliacionResultado } from './types';

function summarize(label: string, conc: ConciliacionResultado[], totalConfirmado: number) {
  const cobrado = conc.filter(c => c.clase === 'cobrado');
  const cobradoConValor = cobrado.filter(c => (c.monto_reportado ?? c.monto_esperado ?? null) !== null);
  const cobradoNull = cobrado.filter(c => c.monto_reportado == null && c.monto_esperado == null);
  console.log(`\n=== ${label} ===`);
  console.log(`  total_confirmado_cop = ${totalConfirmado.toLocaleString('es-CO')}`);
  console.log(`  filas 'cobrado': ${cobrado.length} | con valor: ${cobradoConValor.length} | ambos null: ${cobradoNull.length}`);
  // clases presentes
  const clases = new Map<string, number>();
  for (const c of conc) clases.set(c.clase, (clases.get(c.clase) ?? 0) + 1);
  console.log('  clases:', JSON.stringify(Object.fromEntries(clases)));
}

(async () => {
  const bundles = await loadAllBundles();

  // 1) GET inicial (persona andres = sin scaling), sin HITL
  const s0 = runPipeline(bundles, []);
  summarize('GET inicial (sin HITL)', s0.conciliaciones, s0.metrics.total_confirmado_cop);

  // 2) Tomar la PRIMERA fila que necesita HITL en C2 y marcarla "cobrado"
  const target = s0.conciliaciones.find(c => c.needs_hitl);
  console.log('\nFila objetivo HITL C2:', target ? { guia: target.guia, carrier: target.carrier, clase: target.clase, me: target.monto_esperado, mr: target.monto_reportado, reason: target.hitl_reason } : 'NINGUNA');

  if (target) {
    const rec: HitlRecord = {
      guia: target.guia, carrier: target.carrier, tipo: 'c2',
      decision: 'cobrado', timestamp: new Date().toISOString(),
    };
    const s1 = runPipeline(bundles, [rec]);
    summarize('POST tras marcar 1 fila cobrado (c2)', s1.conciliaciones, s1.metrics.total_confirmado_cop);
    const applied = s1.conciliaciones.find(c => c.guia === target.guia && c.carrier === target.carrier);
    console.log('  fila objetivo tras rerun:', applied ? { clase: applied.clase, me: applied.monto_esperado, mr: applied.monto_reportado, needs_hitl: applied.needs_hitl } : 'NO ENCONTRADA');
  }

  // 3) Simular una decisión C7 (como en las capturas) y ver si toca el total
  const anom = s0.anomalias.find(a => a.flag);
  if (anom) {
    const recC7: HitlRecord = {
      guia: anom.guia, carrier: anom.carrier, tipo: 'c7',
      decision: 'confirmar_discrepancia', timestamp: new Date().toISOString(),
    };
    const s2 = runPipeline(bundles, [recC7]);
    summarize('POST tras decision C7 (confirmar_discrepancia)', s2.conciliaciones, s2.metrics.total_confirmado_cop);
  }

  // 4) Acumular varias decisiones cobrado (como haría el usuario en la demo)
  const targets = s0.conciliaciones.filter(c => c.needs_hitl).slice(0, 10);
  const recs: HitlRecord[] = targets.map(t => ({
    guia: t.guia, carrier: t.carrier, tipo: 'c2', decision: 'cobrado', timestamp: new Date().toISOString(),
  }));
  const s3 = runPipeline(bundles, recs);
  summarize('POST tras 10 decisiones cobrado', s3.conciliaciones, s3.metrics.total_confirmado_cop);
})();
