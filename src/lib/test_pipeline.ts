/**
 * Test rápido del pipeline C1→C2→C7 para verificar métricas de matching.
 */

import type { BundleInput } from './types';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { runPipeline } from './pipeline';

const dataDir = join(process.cwd(), 'data');
const files = readdirSync(dataDir).filter(f => f.startsWith('bundle_') && f.endsWith('.json'));
const bundles: BundleInput[] = files.map(f => JSON.parse(readFileSync(join(dataDir, f), 'utf-8')));

console.log(`📦 Pipeline test — ${bundles.length} bundles, ${bundles.reduce((s, b) => s + b.orders.length, 0)} órdenes\n`);

const state = runPipeline(bundles);
const m = state.metrics;

console.log('=== Métricas del Pipeline ===\n');
console.log(`Tasa normalización C1:     ${(m.tasa_normalizacion * 100).toFixed(1)}%`);
console.log(`Filas aisladas (C1):       ${m.filas_aisladas}`);
console.log(`Tasa auto-conciliación:    ${(m.tasa_conciliacion_automatica * 100).toFixed(1)}%  (target ≥80%)`);
console.log(`Precisión matching C2:     ${(m.precision_matching * 100).toFixed(1)}%  (target ≥90%)`);
console.log(`Recall anomalías C7:       ${(m.recall_anomalias * 100).toFixed(1)}%  (target ≥90%)`);
console.log(`Precisión C7:              ${(m.precision_c7 * 100).toFixed(1)}%`);
console.log(`Falso positivo C7:         ${(m.false_positive_rate * 100).toFixed(1)}%`);
console.log(`Total confirmado (COP):    $${(m.total_confirmado_cop / 1_000_000).toFixed(1)}M`);
console.log(`Total pendiente (COP):     $${(m.total_pendiente_cop / 1_000_000).toFixed(1)}M`);
console.log(`Discrepancias abiertas:    ${m.total_discrepancias}`);

console.log('\n=== Desglose C2 ===\n');
const clases = new Map<string, number>();
for (const c of state.conciliaciones) {
  clases.set(c.clase, (clases.get(c.clase) ?? 0) + 1);
}
for (const [clase, count] of [...clases].sort()) {
  console.log(`  ${clase}: ${count} (${(count / state.conciliaciones.length * 100).toFixed(1)}%)`);
}

// Comparar C2 vs ground truth
console.log('\n=== Comparación C2 vs Ground Truth ===\n');
const gtMap = new Map<string, string>();
for (const gt of state.groundTruth) {
  gtMap.set(`${gt.carrier}::${gt.guia}`, gt.expected_c2_class);
}
let correct = 0, wrong = 0, total = 0;
const wrongDetails: string[] = [];
for (const c of state.conciliaciones) {
  const key = `${c.carrier}::${c.guia}`;
  const expected = gtMap.get(key);
  if (expected) {
    total++;
    if (c.clase === expected) {
      correct++;
    } else {
      wrong++;
      if (wrongDetails.length < 10) {
        wrongDetails.push(`  ${c.guia} (${c.carrier}): got=${c.clase}, expected=${expected}`);
      }
    }
  }
}
console.log(`  Correctos: ${correct}/${total} (${(correct / total * 100).toFixed(1)}%)`);
console.log(`  Incorrectos: ${wrong}`);
if (wrongDetails.length > 0) {
  console.log('\n  Primeros errores:');
  wrongDetails.forEach(d => console.log(d));
}

// Verificar pago_faltante
console.log('\n=== Pago Faltante ===\n');
const pagoFaltante = state.conciliaciones.filter(c => c.hitl_reason === 'pago_faltante');
console.log(`  Órdenes sin pago detectadas: ${pagoFaltante.length}`);
if (pagoFaltante.length > 0) {
  console.log(`  Ejemplo: ${pagoFaltante[0].guia} (${pagoFaltante[0].carrier})`);
}

// Verificar huérfanos
const huerfanos = state.conciliaciones.filter(c => c.hitl_reason === 'pago_huerfano');
console.log(`\n=== Pagos Huérfanos ===\n`);
console.log(`  Pagos sin orden detectados: ${huerfanos.length}`);
