// Proxy del lado del servidor.
// La API key vive SOLO aquí (variable de entorno en Vercel).
// El navegador nunca la ve.

export const config = { maxDuration: 60 }

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Usa POST' })
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return res.status(500).json({
      error: 'Falta la variable ANTHROPIC_API_KEY en el servidor. Agrégala en Vercel → Settings → Environment Variables.',
    })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { content, system, max_tokens } = body || {}

    if (!Array.isArray(content)) {
      return res.status(400).json({ error: 'Formato inválido: falta "content".' })
    }

    const peso = JSON.stringify(content).length
    if (peso > 4_000_000) {
      return res.status(413).json({ error: 'El archivo es demasiado pesado para procesarlo. Usa una foto o un PDF más ligero.' })
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: max_tokens || 2000,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content }],
      }),
    })

    const data = await upstream.json()

    if (!upstream.ok) {
      const msg = data?.error?.message || 'Error de la API de Claude'
      return res.status(upstream.status).json({ error: msg })
    }

    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

    return res.status(200).json({ text })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Error inesperado en el servidor' })
  }
}
