import { NextResponse } from 'next/server';

// M1.3: Fallback determinista para reclamaciones
// Importación condicional — solo se usa en el case 'reclamacion'
function buildReclamacionFallback(payload: Record<string, unknown>): string {
  const g = String(payload.guia ?? '');
  const c = String(payload.carrier ?? '');
  const me = Number(payload.montoEsperado ?? 0);
  const mr = payload.montoReportado !== null && payload.montoReportado !== undefined
    ? Number(payload.montoReportado)
    : null;
  const diff = Number(payload.diferencia ?? 0);
  const f = String(payload.fecha ?? '');
  const carrierNombre = CARRIER_LEGIBLE[c] ?? c;
  const diffF = diff.toLocaleString('es-CO');
  const meF = me.toLocaleString('es-CO');
  const mrStr = mr !== null ? `$${mr.toLocaleString('es-CO')} COP` : 'no reportado';
  return (
    `Señores ${carrierNombre}.\n\n` +
    `Por medio de la presente solicitamos revisión y reintegro correspondiente al envío con guía N.º ${g}, ` +
    `con fecha de despacho ${f}, el cual presenta una discrepancia en el monto reportado. ` +
    `El monto esperado de remesa era de $${meF} COP, ` +
    `y el monto reportado por su operación fue de ${mrStr}, ` +
    `lo que genera una diferencia de $${diffF} COP a favor de nuestro representado.\n\n` +
    `Agradecemos su gestión para la verificación de este caso y el reintegro del valor referido ` +
    `en el próximo ciclo de remesa. Quedamos atentos a su respuesta.`
  );
}

const CARRIER_LEGIBLE: Record<string, string> = {
  interrapidisimo: 'Interrapidísimo',
  coordinadora: 'Coordinadora',
  servientrega: 'Servientrega',
  envia: 'Envía',
  tcc: 'TCC',
};

// M2.3: Fallback determinista para predicción SLA
function buildSLAFallback(payload: Record<string, unknown>): string {
  const carrier = CARRIER_LEGIBLE[String(payload.carrier ?? '')] ?? String(payload.carrier ?? '');
  const ciudad = String(payload.ciudad ?? '');
  const lag = payload.lagEsperadoDias ?? '—';
  const bandaInf = payload.bandaInferior ?? '—';
  const bandaSup = payload.bandaSuperior ?? '—';
  const semaforo = String(payload.semaforo ?? 'amarillo');
  const confianza = payload.confianza ?? '—';
  return `Predicción para ${carrier} en ${ciudad}: lag esperado de ${lag} días (banda ${bandaInf}–${bandaSup}), semáforo ${semaforo}, confianza ${confianza}%. Se recomienda monitorear de cerca esta ruta.`;
}

export async function POST(request: Request) {
  const { prompt, mode, payload } = await request.json();

  // M1.3: Nuevo mode 'reclamacion' — AÑADIR sin tocar el flujo existente
  if (mode === 'reclamacion') {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ text: buildReclamacionFallback(payload ?? {}), fallback: true });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout for reclamacion
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [
            {
              role: 'system',
              content:
                'Eres un asistente que redacta reclamaciones formales a transportadoras en Colombia. Usa EXCLUSIVAMENTE los números que recibes en el payload. NUNCA inventes ni modifiques cifras, fechas o montos. Devuelve 1 párrafo formal, máximo 6 oraciones, en español neutro, listo para enviar. Incluye guía, diferencia en COP y fecha. No agregues despedidas largas ni datos no provistos.',
            },
            { role: 'user', content: prompt ?? '' },
          ],
          max_tokens: 220,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json({ text: buildReclamacionFallback(payload ?? {}), fallback: true });
      }

      const data = await res.json();
      const text: string | null = data.choices?.[0]?.message?.content ?? null;
      return NextResponse.json({ text: text ?? buildReclamacionFallback(payload ?? {}), fallback: !text });
    } catch {
      return NextResponse.json({ text: buildReclamacionFallback(payload ?? {}), fallback: true });
    }
  }

  // M2.3: Nuevo mode 'sla_predict' — AÑADIR sin tocar el flujo existente
  if (mode === 'sla_predict') {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ text: buildSLAFallback(payload ?? {}), fallback: true });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [
            {
              role: 'system',
              content:
                "Narras una predicción de desempeño de transportadora ya calculada. Usa solo los números provistos (lag esperado, banda, semáforo, confianza). NUNCA inventes cifras. Máximo 3 oraciones. Cierra con UNA recomendación accionable (ej. 'prioriza X carrier en esta ciudad esta semana'). Menciona el nivel de confianza si es bajo.",
            },
            { role: 'user', content: prompt ?? '' },
          ],
          max_tokens: 150,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json({ text: buildSLAFallback(payload ?? {}), fallback: true });
      }

      const data = await res.json();
      const text: string | null = data.choices?.[0]?.message?.content ?? null;
      return NextResponse.json({ text: text ?? buildSLAFallback(payload ?? {}), fallback: !text });
    } catch {
      return NextResponse.json({ text: buildSLAFallback(payload ?? {}), fallback: true });
    }
  }

  // M4.2: Nuevo mode 'automap' — AÑADIR sin tocar el flujo existente
  if (mode === 'automap') {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ mapping: {}, fallback: true });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [
            {
              role: 'system',
              content:
                "Propones un mapeo de columnas de un formato CSV/JSON desconocido al esquema canónico provisto. Devuelve SOLO un JSON `{ campoCanonico: nombreColumnaOrigen }`. No transformes datos, no inventes columnas. Si una columna canónica no tiene match claro, devuélvela como `null`. No expliques.",
            },
            { role: 'user', content: prompt ?? '' },
          ],
          max_tokens: 150,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json({ mapping: {}, fallback: true });
      }

      const data = await res.json();
      const text: string | null = data.choices?.[0]?.message?.content ?? null;

      // Validar que sea JSON parseable
      try {
        const mapping = text ? JSON.parse(text) : {};
        return NextResponse.json({ mapping, fallback: false });
      } catch {
        return NextResponse.json({ mapping: {}, fallback: true });
      }
    } catch {
      return NextResponse.json({ mapping: {}, fallback: true });
    }
  }

  // === Flujo existente (NO TOCAR) ===
  if (!prompt) {
    return NextResponse.json({ text: null, fallback: true });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ text: null, fallback: true });
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content:
              'Eres el asistente de conciliación COD de faro by embarca, una plataforma SaaS de logística para e-commerce en Colombia. Redactas resúmenes para vendedores colombianos.\n\nREGLAS DE FORMATO (obligatorias):\n- Divide tu respuesta en 2-3 bloques temáticos cortos, cada uno con una línea de título y 1-2 oraciones de contenido.\n- Usa emojis de forma sobria: ✅ algo positivo, ⚠️ algo a revisar, 🚨 alerta crítica. Máximo 1 emoji por bloque.\n- Nunca uses más de 4 oraciones en total. Sé directo y concreto.\n- NUNCA uses tecnicismos: no digas "pipeline", "C1", "C2", "C7", "recall", "ground truth", "dataset", "threshold", "umbral", "outlier", "z-score", "normalización", "clase", "discrepancia" (usa "envío pendiente" o "cobro no cuadra").\n- NUNCA recomiendes acciones de Operaciones (revisar formatos, mapeos, etc.). Eso es para el equipo interno, no para el vendedor.\n- Siempre menciona pesos colombianos (COP o $) cuando hables de montos.\n- Termina siempre con 1 acción concreta y específica para esta semana.\n- Tu audiencia es el VENDEDOR (Andrés). Él quiere saber: ¿cuánto le deben?, ¿qué transportadora le está costando plata?, ¿qué decide hoy con su dinero?',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 220,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      console.error('Groq error:', res.status, await res.text());
      return NextResponse.json({ text: null, fallback: true });
    }

    const data = await res.json();
    const text: string | null = data.choices?.[0]?.message?.content ?? null;
    return NextResponse.json({ text, fallback: !text });
  } catch (err) {
    console.error('Groq fetch error:', err);
    return NextResponse.json({ text: null, fallback: true });
  }
}
