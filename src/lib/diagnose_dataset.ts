/**
 * Diagnóstico del dataset — detalla los errores encontrados por el validador.
 */

import type { BundleInput, GroundTruth } from './types';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dataDir = join(process.cwd(), 'data');
const files = readdirSync(dataDir).filter(f => f.startsWith('bundle_') && f.endsWith('.json'));
const bundles: BundleInput[] = files.map(f => JSON.parse(readFileSync(join(dataDir, f), 'utf-8')));

const allGT = bundles.flatMap(b => b.ground_truth);

console.log('=== DIAGNÓSTICO DE ERRORES DE ENUM ===\n');

const enumValues = {
  true_status: ['entregado_pagado', 'pendiente', 'discrepancia'],
  discrepancy_type: ['ninguno', 'monto_menor', 'monto_mayor', 'pago_faltante', 'pago_huerfano', 'guia_duplicada', 'monto_ambiguo'],
  anomaly_reason: ['ninguno', 'excede_umbral_fijo', 'outlier_estadistico', 'patron_transportadora'],
  expected_c2_class: ['cobrado', 'pendiente_acreditacion', 'discrepancia'],
  expected_estado_canonico: ['entregado', 'en_reparto', 'devuelto', 'novedad', null],
};

const enumErrors: { field: string; value: string; count: number }[] = [];

for (const [field, values] of Object.entries(enumValues)) {
  const fieldKey = field as keyof typeof enumValues;
  const valueSet = new Set(values);
  const counts = new Map<string, number>();

  for (const gt of allGT) {
    const val = gt[fieldKey] as string | null;
    if (val !== null && !valueSet.has(val)) {
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
  }

  for (const [val, count] of counts) {
    enumErrors.push({ field: fieldKey, value: val, count });
  }
}

for (const err of enumErrors) {
  console.log(`  ${err.field}: "${err.value}" aparece ${err.count} veces`);
}

console.log('\n=== VALORES ÚNICOS EN CAMPOS CLAVE ===\n');

const uniqueDiscrepancyTypes = new Set(allGT.map(g => g.discrepancy_type));
console.log('discrepancy_type:', [...uniqueDiscrepancyTypes].sort());

const uniqueAnomalyReasons = new Set(allGT.map(g => g.anomaly_reason));
console.log('anomaly_reason:', [...uniqueAnomalyReasons].sort());

const uniqueTrueStatus = new Set(allGT.map(g => g.true_status));
console.log('true_status:', [...uniqueTrueStatus].sort());

const uniqueC2Class = new Set(allGT.map(g => g.expected_c2_class));
console.log('expected_c2_class:', [...uniqueC2Class].sort());

const uniqueEstadoCanonico = new Set(allGT.map(g => String(g.expected_estado_canonico)));
console.log('expected_estado_canonico:', [...uniqueEstadoCanonico].sort());

console.log('\n=== INCONSISTENCIAS DE UMBRAL ===\n');

let umbralErrors = 0;
for (const gt of allGT) {
  if (gt.monto_real === null || gt.monto_esperado === null) continue;
  if (gt.discrepancy_type === 'pago_huerfano') continue;

  const diff = Math.abs(gt.monto_real - gt.monto_esperado);
  const pct = gt.monto_esperado > 0 ? diff / gt.monto_esperado * 100 : 0;
  const deberiaSerAnomalia = diff > 50000 || pct > 3;
  const esDiscrepanciaBajoUmbral = gt.is_discrepancy && !gt.is_anomaly && diff < 50000 && pct <= 3;

  if (esDiscrepanciaBajoUmbral) continue;

  if (gt.is_anomaly !== deberiaSerAnomalia && gt.anomaly_reason !== 'outlier_estadistico') {
    umbralErrors++;
    if (umbralErrors <= 5) {
      console.log(`  ${gt.guia}: monto_real=${gt.monto_real}, esperado=${gt.monto_esperado}, diff=${diff}, pct=${pct.toFixed(1)}%, is_anomaly=${gt.is_anomaly}, reason=${gt.anomaly_reason}`);
    }
  }
}
console.log(`  Total: ${umbralErrors} inconsistencias`);

console.log('\n=== CASOS BORDE — DISTRIBUCIÓN ===\n');

const distro = new Map<string, number>();
for (const gt of allGT) {
  let caso = 'limpio_cobrado';
  if (gt.expected_c2_class === 'pendiente_acreditacion' && !gt.is_discrepancy) caso = 'pendiente_acreditacion';
  else if (gt.discrepancy_type === 'monto_menor') caso = 'discrepancia_monto_menor';
  else if (gt.discrepancy_type === 'monto_mayor') caso = 'discrepancia_monto_mayor';
  else if (gt.discrepancy_type === 'pago_faltante') caso = 'pago_faltante';
  else if (gt.discrepancy_type === 'pago_huerfano') caso = 'pago_huerfano';
  else if (gt.discrepancy_type === 'guia_duplicada') caso = 'guia_duplicada';
  else if (gt.discrepancy_type === 'monto_ambiguo') caso = 'monto_ambiguo_hitl';
  else if (gt.is_discrepancy && !gt.is_anomaly && gt.discrepancy_type !== 'ninguno') caso = 'discrepancia_bajo_umbral';

  distro.set(caso, (distro.get(caso) ?? 0) + 1);
}

// Outliers
const allOrders = bundles.flatMap(b => b.orders);
let outliers = 0;
for (const o of allOrders) {
  if (o.monto_esperado_cod >= 300000) outliers++;
}
distro.set('outlier_alto_valor', outliers);

// TCC
const tccCount = bundles.flatMap(b => b.expected_c1_alerts).filter(a => a.fuente === 'tcc').length;
distro.set('carrier_desconocido_tcc', tccCount);

// Novedad texto libre
let novedadesTL = 0;
for (const bundle of bundles) {
  const enviaLines = bundle.carrier_raw.envia_csv.split('\n');
  for (const line of enviaLines) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const novedad = parts[1]?.trim() ?? '';
      if (novedad && !['Entregado OK', 'En reparto', 'Devuelto al origen', ''].includes(novedad)) {
        novedadesTL++;
        break;
      }
    }
  }
}
distro.set('novedad_texto_libre', novedadesTL);

for (const [caso, count] of [...distro].sort()) {
  console.log(`  ${caso}: ${count}`);
}
