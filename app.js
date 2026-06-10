/* ---------------- Rewritr ---------------- */

const API_ENDPOINT = '/api/improve';

const PLATFORMS = {
  ai: [
    { id: 'chatgpt', label: 'ChatGPT' },
    { id: 'claude', label: 'Claude' },
    { id: 'midjourney', label: 'Midjourney' },
  ],
  social: [
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'x', label: 'X' },
    { id: 'instagram', label: 'Instagram' },
  ],
};

const TONES = ['Professional', 'Casual', 'Viral', 'Witty'];

const LS_LAST = 'rewritr_last';
const LS_HISTORY = 'rewritr_history';
const MAX_HISTORY = 10;

const state = {
  mode: 'ai',
  platform: 'chatgpt',
  tone: 'Professional',
};

/* ---------------- DOM ---------------- */
const $ = (id) => document.getElementById(id);
const els = {
  modeSeg: $('modeSeg'),
  platformChips: $('platformChips'),
  toneChips: $('toneChips'),
  input: $('inputText'),
  charCount: $('charCount'),
  submitBtn: $('submitBtn'),
  results: $('results'),
  errorBar: $('errorBar'),
  origText: $('origText'),
  impText: $('impText'),
  changelog: $('changelog'),
  scoreOrig: $('scoreOrig'),
  scoreImp: $('scoreImp'),
  scoreOrigFill: $('scoreOrigFill'),
  scoreImpFill: $('scoreImpFill'),
  copyBtn: $('copyBtn'),
  historySection: $('historySection'),
  historyList: $('historyList'),
  clearHistory: $('clearHistory'),
  toast: $('toast'),
};

/* ---------------- Init UI ---------------- */
function renderPlatforms() {
  els.platformChips.innerHTML = '';
  PLATFORMS[state.mode].forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (i === 0 ? ' active' : '');
    btn.textContent = p.label;
    btn.dataset.platform = p.id;
    btn.addEventListener('click', () => {
      state.platform = p.id;
      [...els.platformChips.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
    });
    els.platformChips.appendChild(btn);
  });
  state.platform = PLATFORMS[state.mode][0].id;
}

function renderTones() {
  els.toneChips.innerHTML = '';
  TONES.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (i === 0 ? ' active' : '');
    btn.textContent = t;
    btn.addEventListener('click', () => {
      state.tone = t;
      [...els.toneChips.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
    });
    els.toneChips.appendChild(btn);
  });
  state.tone = TONES[0];
}

els.modeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  state.mode = btn.dataset.mode;
  [...els.modeSeg.children].forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  renderPlatforms();
});

els.input.addEventListener('input', () => {
  const n = els.input.value.length;
  els.charCount.textContent = `${n} character${n === 1 ? '' : 's'}`;
});

function platformLabel() {
  return PLATFORMS[state.mode].find((p) => p.id === state.platform)?.label || state.platform;
}

/* ---------------- API call (via serverless proxy) ---------------- */
async function improve(text) {
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: state.mode,
      platform: state.platform,
      tone: state.tone,
      text,
    }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Unexpected response from the server.');
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status}).`);
  }
  return data;
}

/* ---------------- Submit ---------------- */
els.submitBtn.addEventListener('click', onSubmit);
els.input.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit();
});

async function onSubmit() {
  const text = els.input.value.trim();
  hideError();
  if (!text) {
    showError('Please enter some text first.');
    return;
  }
  setLoading(true);
  try {
    const result = await improve(text);
    const record = {
      improved: result.improved,
      original_score: result.original_score,
      improved_score: result.improved_score,
      changelog: result.changelog || [],
      original: text,
      mode: result.mode || state.mode,
      platform: result.platform || platformLabel(),
      tone: result.tone || state.tone,
      ts: Date.now(),
    };
    renderResult(record);
    saveLast(record);
    addToHistory(record);
  } catch (err) {
    showError(err.message || 'Something went wrong.');
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  els.submitBtn.disabled = on;
  els.submitBtn.querySelector('.btn-label').textContent = on ? 'Improving…' : 'Improve it';
  els.submitBtn.querySelector('.spinner').hidden = !on;
}

/* ---------------- Render ---------------- */
function renderResult(r, scroll = true) {
  els.origText.textContent = r.original;
  els.impText.textContent = r.improved;

  els.scoreOrig.textContent = `${r.original_score}/10`;
  els.scoreImp.textContent = `${r.improved_score}/10`;
  els.scoreOrigFill.style.width = '0%';
  els.scoreImpFill.style.width = '0%';
  requestAnimationFrame(() => {
    els.scoreOrigFill.style.width = `${r.original_score * 10}%`;
    els.scoreImpFill.style.width = `${r.improved_score * 10}%`;
  });

  els.changelog.innerHTML = '';
  (r.changelog && r.changelog.length ? r.changelog : ['Refined for clarity and impact.']).forEach((c) => {
    const li = document.createElement('li');
    li.textContent = c;
    els.changelog.appendChild(li);
  });

  els.results.hidden = false;
  if (scroll) els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- Copy ---------------- */
els.copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.impText.textContent);
    toast('Copied to clipboard');
  } catch {
    toast('Copy failed');
  }
});

/* ---------------- Storage: last + history ---------------- */
function saveLast(record) {
  try { localStorage.setItem(LS_LAST, JSON.stringify(record)); } catch {}
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY)) || []; } catch { return []; }
}

function addToHistory(record) {
  const list = getHistory();
  list.unshift(record);
  const trimmed = list.slice(0, MAX_HISTORY);
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(trimmed)); } catch {}
  renderHistory();
}

function renderHistory() {
  const list = getHistory();
  if (!list.length) {
    els.historySection.hidden = true;
    return;
  }
  els.historySection.hidden = false;
  els.historyList.innerHTML = '';
  list.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-meta">
        <span class="mini-tag">${escapeHtml(r.platform)} · ${escapeHtml(r.tone)}</span>
        <span class="mini-date">${formatDate(r.ts)}</span>
      </div>
      <div class="history-snippet">${escapeHtml(r.improved || r.original)}</div>`;
    item.addEventListener('click', () => renderResult(r));
    els.historyList.appendChild(item);
  });
}

els.clearHistory.addEventListener('click', () => {
  localStorage.removeItem(LS_HISTORY);
  renderHistory();
  toast('History cleared');
});

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
    setTimeout(() => (els.toast.hidden = true), 300);
  }, 2200);
}

/* ---------------- Errors ---------------- */
function showError(msg) { els.errorBar.textContent = msg; els.errorBar.hidden = false; }
function hideError() { els.errorBar.hidden = true; }

/* ---------------- Boot ---------------- */
function boot() {
  renderPlatforms();
  renderTones();
  renderHistory();
  try {
    const last = JSON.parse(localStorage.getItem(LS_LAST));
    if (last && last.improved) {
      els.input.value = last.original || '';
      els.charCount.textContent = `${els.input.value.length} characters`;
      renderResult(last, false);
    }
  } catch {}
}

boot();
