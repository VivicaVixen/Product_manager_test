import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { prompt } = await request.json();

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
