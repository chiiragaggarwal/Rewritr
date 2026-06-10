// Serverless proxy (Vercel) — holds the Gemini key server-side so users never see it.
// Set GEMINI_API_KEY in your Vercel project env vars (or .env for `vercel dev`).

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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

Respond ONLY with a valid JSON object (no markdown, no code fences) using exactly this shape:
{
  "improved": "the rewritten text",
  "original_score": <integer 1-10 rating the original>,
  "improved_score": <integer 1-10 rating the rewrite>,
  "changelog": ["short bullet explaining a change and why it's better", "..."]
}`;
}

// Tolerant JSON parse: handles stray code fences and surrounding prose.
function parseJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch { return null; }
}

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

  const requestBody = JSON.stringify({
    contents: [
      { parts: [{ text: buildPrompt({ mode, platformLabel, tone: safeTone, text: text.trim() }) }] },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 4096,
      // gemini-2.5-flash is a "thinking" model; its reasoning consumes the output
      // budget and can truncate/empty the JSON. Disable thinking for reliable output.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  try {
    // Gemini's free tier occasionally returns transient 503/429; retry a couple times.
    let geminiRes;
    let lastErrText = '';
    const MAX_ATTEMPTS = 3;
    const backoff = [600, 1400];
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody,
      });
      if (geminiRes.ok) break;
      lastErrText = await geminiRes.text();
      // Only retry genuine transient server errors. Do NOT retry 429 (quota) —
      // retrying just burns more of the rate limit and can't succeed anyway.
      const transient = geminiRes.status === 503 || geminiRes.status === 500;
      if (!transient || attempt === MAX_ATTEMPTS - 1) break;
      await new Promise((r) => setTimeout(r, backoff[attempt]));
    }

    if (!geminiRes.ok) {
      console.error('Gemini error', geminiRes.status, lastErrText);
      const quota = geminiRes.status === 429;
      return res.status(quota ? 429 : 502).json({
        error: quota
          ? "We've hit the free usage limit for the moment. Please try again in a minute."
          : 'The rewriting service is busy right now. Please try again in a moment.',
      });
    }

    const data = await geminiRes.json();
    const candidate = data?.candidates?.[0];
    const raw = (candidate?.content?.parts || []).map((p) => p?.text || '').join('');

    const parsed = parseJson(raw);
    if (!parsed) {
      console.error('Parse failure. finishReason:', candidate?.finishReason, 'Raw:', raw.slice(0, 300));
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
