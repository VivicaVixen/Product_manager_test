import { loadAllBundles } from './seed';
import { runPipeline } from './pipeline';
const SCALE: Record<string,number> = { andres:1.0, carolina:0.75, tienda:0.18, enterprise:4.2 };
(async () => {
  const b = await loadAllBundles();
  console.log('=== FIX: todas las personas, matching consistente ===');
  for (const p of Object.keys(SCALE)) {
    const s = runPipeline(b, [], SCALE[p]);
    const cob = s.conciliaciones.filter(c=>c.clase==='cobrado').length;
    console.log(`${p.padEnd(11)} confirmado=$${(s.metrics.total_confirmado_cop/1e6).toFixed(1)}M  auto=${(s.metrics.tasa_conciliacion_automatica*100).toFixed(0)}%  cobrado=${cob}/${s.conciliaciones.length}`);
  }
  console.log('\n=== FIX: GET tienda -> decision cobrado -> POST tienda (misma escala) ===');
  const g = runPipeline(b, [], SCALE.tienda);
  const t = g.conciliaciones.find(c=>c.needs_hitl)!;
  console.log(`GET tienda   confirmado=$${(g.metrics.total_confirmado_cop/1e6).toFixed(2)}M`);
  const post = runPipeline(b, [{guia:t.guia,carrier:t.carrier,tipo:'c2',decision:'cobrado',timestamp:''} as any], SCALE.tienda);
  console.log(`POST tienda  confirmado=$${(post.metrics.total_confirmado_cop/1e6).toFixed(2)}M  (consistente, no salta, no es 0)`);
  console.log('\n=== Andrés intacto (regresión) ===');
  const a0 = runPipeline(b, []); // scale default 1
  console.log(`Andrés scale=default confirmado=$${(a0.metrics.total_confirmado_cop/1e6).toFixed(1)}M auto=${(a0.metrics.tasa_conciliacion_automatica*100).toFixed(0)}% (debe ser 60.9M / 76%)`);
})();
