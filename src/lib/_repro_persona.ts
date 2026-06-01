import { loadAllBundles } from './seed';
import { runPipeline } from './pipeline';
import type { BundleInput } from './types';

const PERSONA: Record<string,{slice:number;multiplier:number}> = {
  andres:{slice:795,multiplier:1.0}, carolina:{slice:420,multiplier:0.75},
  tienda:{slice:95,multiplier:0.18}, enterprise:{slice:795,multiplier:4.2},
};
function applyPersona(b: BundleInput[], p: string): BundleInput[] {
  const c = PERSONA[p] ?? PERSONA.andres;
  return b.map(x => ({...x, orders: x.orders.slice(0, Math.ceil(x.orders.length*(c.slice/795)))
    .map(o => ({...o, monto_esperado_cod: Math.round(o.monto_esperado_cod*c.multiplier)}))}));
}
(async () => {
  const bundles = await loadAllBundles();
  for (const p of ['andres','carolina','tienda','enterprise']) {
    const s = runPipeline(applyPersona(bundles, p), []);
    const cobrado = s.conciliaciones.filter(c=>c.clase==='cobrado').length;
    console.log(`${p.padEnd(11)} confirmado=$${(s.metrics.total_confirmado_cop/1e6).toFixed(1)}M  auto=${(s.metrics.tasa_conciliacion_automatica*100).toFixed(0)}%  cobrado=${cobrado}/${s.conciliaciones.length}  pend=$${(s.metrics.total_pendiente_cop/1e6).toFixed(1)}M`);
  }
  console.log('\n--- Ahora: GET tienda (lo que ve el user) vs POST sin persona (tras 1 decision) ---');
  const getT = runPipeline(applyPersona(bundles,'tienda'), []);
  console.log(`GET tienda  -> confirmado=$${(getT.metrics.total_confirmado_cop/1e6).toFixed(2)}M`);
  const postT = runPipeline(bundles, [{guia:getT.conciliaciones[0].guia, carrier:getT.conciliaciones[0].carrier, tipo:'c2', decision:'cobrado', timestamp:''} as any]);
  console.log(`POST (raw)  -> confirmado=$${(postT.metrics.total_confirmado_cop/1e6).toFixed(2)}M  <- salta de escala`);
})();
