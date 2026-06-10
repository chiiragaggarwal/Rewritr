// Serverless proxy (Vercel) — holds the Gemini key server-side so users never see it.
// Set GEMINI_API_KEY in your Vercel project env vars (or .env for `vercel dev`).

const MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PLATFORMS = {
  ai: { chatgpt: 'ChatGPT', claude: 'Claude', midjourney: 'Midjourney' },
  social: { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' },
};
const TONES = ['Professional', 'Casual', 'Viral', 'Witty'];

function buildPrompt({ mode, platformLabel, tone, text }) {
  const target =
    mode === 'ai'
      ? `an AI prompt intended for ${platformLabel}`
      : `a social media post for ${platformLabel}`;

  const guidance =
    mode === 'ai'
      ? 'Make it clearer, more specific, and better structured so the AI produces a higher-quality result. Add helpful context, constraints, and desired output format where useful.'
      : `Optimize it for engagement on ${platformLabel}: strong hook, scannable structure, and a natural call-to-action. Respect the platform's norms (e.g. length, hashtags, line breaks).`;

  return `You are an expert editor. Rewrite ${target} in a ${tone} tone.

${guidance}

Original text:
"""
${text}
"""

Return the rewritten text, an integer 1-10 score for the original, an integer 1-10 score for your rewrite, and a short changelog of what you changed and why it's better.`;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    improved: { type: 'string' },
    original_score: { type: 'integer' },
    improved_score: { type: 'integer' },
    changelog: { type: 'array', items: { type: 'string' } },
  },
  required: ['improved', 'original_score', 'improved_score', 'changelog'],
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
  }

  // Body may arrive parsed (Vercel) or as a raw string.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { mode, platform, tone, text } = body || {};

  // Validate
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required.' });
  }
  if (text.length > 8000) {
    return res.status(400).json({ error: 'Text is too long (max 8000 characters).' });
  }
  if (!PLATFORMS[mode]) {
    return res.status(400).json({ error: 'Invalid mode.' });
  }
  const platformLabel = PLATFORMS[mode][platform];
  if (!platformLabel) {
    return res.status(400).json({ error: 'Invalid platform.' });
  }
  const safeTone = TONES.includes(tone) ? tone : 'Professional';

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: buildPrompt({ mode, platformLabel, tone: safeTone, text: text.trim() }) }] },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error', geminiRes.status, errText);
      return res.status(502).json({ error: 'The rewriting service is temporarily unavailable.' });
    }

    const data = await geminiRes.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Could not parse the rewrite. Please try again.' });
    }

    const clamp = (n) => {
      n = Math.round(Number(n));
      return isNaN(n) ? 0 : Math.max(0, Math.min(10, n));
    };

    return res.status(200).json({
      improved: String(parsed.improved || '').trim(),
      original_score: clamp(parsed.original_score),
      improved_score: clamp(parsed.improved_score),
      changelog: Array.isArray(parsed.changelog) ? parsed.changelog.map(String) : [],
      platform: platformLabel,
      tone: safeTone,
      mode,
    });
  } catch (err) {
    console.error('Proxy error', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
