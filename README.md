# Rewritr

A dark glassmorphism web app that improves your **AI prompts** and **social media posts** — then shows a side-by-side comparison, a changelog of what changed, and before/after quality scores.

**Free for everyone.** Users don't need an account or an API key. A small serverless function holds a single Google Gemini key (free tier) on the server, so the key is never exposed in the browser.

## Features

- **Two modes** — *AI Prompt* and *Social Media Post*
- **Platform selector** — ChatGPT / Claude / Midjourney (AI) · LinkedIn / X / Instagram (Social)
- **Tone selector** — Professional · Casual · Viral · Witty
- **Side-by-side** original vs improved output
- **Changelog** — bullet points of what changed and why it's better
- **Score bars** rating original vs improved out of 10
- **Copy button** on the improved version
- **Local history** — last 10 improvements saved in `localStorage` (no account needed)
- Fully responsive, mobile-friendly

## How it works

```
Browser (HTML/CSS/JS)  ──►  /api/improve  ──►  Google Gemini (gemini-2.0-flash)
        no key                 holds key            free tier
```

- `index.html` / `styles.css` / `app.js` — the static frontend (no framework, no build)
- `api/improve.js` — serverless proxy that calls Gemini with your server-side key

## Setup

### 1. Get a free Gemini key
Create one at [Google AI Studio](https://aistudio.google.com/app/apikey). The free tier is enough for personal/light use.

### 2. Deploy to Vercel (free)
```bash
npm i -g vercel
vercel            # link/create the project
```
Then add the key as an environment variable:
```bash
vercel env add GEMINI_API_KEY
# paste your key, select Production (and Preview/Development if you want)
vercel --prod     # deploy
```
Or set it in the Vercel dashboard → Project → Settings → Environment Variables.

### 3. Run locally
```bash
cp .env.example .env      # put your GEMINI_API_KEY inside
vercel dev                # serves the site + /api/improve at http://localhost:3000
```

> Opening `index.html` directly with `file://` won't work, because the `/api/improve`
> function needs to run. Use `vercel dev` (or any host that runs the serverless function).

## Switching providers

To use a different free provider (e.g. Groq), you only need to change `api/improve.js` —
swap the endpoint, request shape, and the env var. The frontend stays the same.

Model used: `gemini-2.5-flash-lite` (override with the `GEMINI_MODEL` env var; `gemini-2.5-flash` gives higher quality at lower free limits).
