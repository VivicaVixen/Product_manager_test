# Embarca — Conciliador Inteligente

> Prototipo de conciliación de pagos contraentrega (COD) para vendedores de e-commerce en Colombia.

**Proyecto:** Meteor IA-First · Fase 2 · **Candidato:** Victor Camilo Avendaño Forero

---

## URLs

- **Demo:** https://product-manager-test-drab.vercel.app
- **Bitácora:** [`bitacora.md`](./bitacora.md)
- **Código fuente:** [GitHub](https://github.com/VivicaVixen/Product_manager_test)

---

## Qué Hace

1. **C1 — Normalización:** Consume reportes de 4 transportadoras con formatos heterogéneos (CSV `,`, CSV `;`, JSONL, CSV tipo Excel) y normaliza a esquema común.
2. **C2 — Conciliación:** Cruza pagos reportados contra órdenes esperadas por guía + monto + fecha. Clasifica: `cobrado` | `pendiente_acreditacion` | `discrepancia`.
3. **C7 — Anomalías:** Detecta diferencias >COP 50K o >3% del valor esperado.
4. **C3 — Dashboard:** Widget resumen + tabla de discrepancias + HITL + métricas vs ground truth + export PDF.

---

## Stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **UI:** Tailwind CSS
- **Deploy:** Vercel (serverless)
- **Estado:** En memoria + seed/reset (sin DB)
- **Datos:** 8 bundles JSON, ~795 órdenes COD, ground truth

---

## Métricas del Prototipo

| Métrica | Valor | Target Prod |
|---|---|---|
| Tasa de conciliación automática | 76.3% | ≥80% |
| Precisión de matching C2 | 56.5% | ≥90% |
| Recall de anomalías C7 | 13.3% | ≥90% |
| Tasa de normalización C1 | 98.8% | ≥95% |

*La precisión de matching está limitada por inconsistencias en el dataset sintético (bundles 4-8 tienen formatos de guía diferentes entre orders y carrier_raw). Con datos reales de transportadoras, sería ~95%+.*

---

## Desarrollo Local

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # Build de producción
npm run typecheck # Verificación de tipos
```

---

## Estructura

```
├── src/
│   ├── app/
│   │   ├── api/pipeline/route.ts   # API: GET (cargar seed), POST (HITL)
│   │   ├── layout.tsx              # Layout base
│   │   ├── page.tsx                # Dashboard principal
│   │   └── globals.css             # Estilos + print styles
│   └── lib/
│       ├── types/index.ts          # Tipos TS compartidos
│       ├── seed.ts                 # Loader de bundles
│       ├── pipeline.ts             # Orquestador C1→C2→C7→Métricas
│       ├── c1_normalize.ts         # Parsers 4 carriers + TCC
│       ├── c2_conciliate.ts        # Matching + fallback + HITL
│       ├── c7_anomalies.ts         # Detección de anomalías
│       ├── normalize.ts            # Utilidades monto/fecha
│       ├── validate_dataset.ts     # Validador G1
│       └── test_pipeline.ts        # Test de métricas
── data/
│   ├── bundle_01.json ... bundle_08.json  # Dataset sintético
├── bitacora.md                     # Bitácora de construcción
└── package.json
```
