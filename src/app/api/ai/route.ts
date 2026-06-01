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
              'Eres el asistente de conciliación COD de Embarca, una plataforma SaaS de logística para e-commerce en Colombia. Redactas resúmenes semanales concisos y profesionales en español para vendedores. Máximo 3 oraciones. Usa las cifras que te dan. Tono: directo, amigable, sin tecnicismos. No uses palabras como "pipeline", "C1", "C2", "C7", "recall" ni "ground truth".',
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
