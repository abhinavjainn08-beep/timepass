// Relative on purpose — the backend now serves this frontend itself (see
// backend/server.js), so the API is always on the same origin as the page,
// locally and once deployed. No URL to change when you deploy.
const API_BASE = '/api';

// ---------- Shared state ----------
let jurisdictions = [];
let currentOffenceId = null;
let currentCandidates = [];
const chatSessionId = crypto.randomUUID();

// ---------- Elements ----------
const jurisdictionSelect = document.getElementById('jurisdiction-select');
const incidentText = document.getElementById('incident-text');
const analyzeBtn = document.getElementById('analyze-btn');
const resultArea = document.getElementById('result-area');
const resultOffence = document.getElementById('result-offence');
const resultConfidence = document.getElementById('result-confidence');
const confidenceBarFill = document.getElementById('confidence-bar-fill');
const resultStatute = document.getElementById('result-statute');
const resultSection = document.getElementById('result-section');
const resultSummary = document.getElementById('result-summary');
const resultNote = document.getElementById('result-note');
const resultPunishment = document.getElementById('result-punishment');
const verifySourceBtn = document.getElementById('verify-source-btn');
const compareToggleBtn = document.getElementById('compare-toggle-btn');
const compareCard = document.getElementById('compare-card');
const compareTable = document.getElementById('compare-table');
const candidatesArea = document.getElementById('candidates-area');
const candidatesList = document.getElementById('candidates-list');

const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatQuickReplies = document.getElementById('chat-quick-replies');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// ---------- Init ----------
async function init() {
  try {
    const res = await fetch(`${API_BASE}/jurisdictions`);
    jurisdictions = await res.json();
    jurisdictionSelect.innerHTML = jurisdictions
      .map((j) => `<option value="${j.code}">${j.name}</option>`)
      .join('');
  } catch (err) {
    console.error('Could not reach the backend. Is it running on port 5000?', err);
    jurisdictionSelect.innerHTML = '<option value="IN">India</option><option value="UK">United Kingdom</option>';
    jurisdictions = [
      { code: 'IN', name: 'India' },
      { code: 'UK', name: 'United Kingdom' },
    ];
  }
  addChatMessage('bot', "Hi! Describe what happened and I'll help you find the law that applies — or use the box above.");
  initMarquee();
  initScrollReveal();
  initNavScrollState();
}

// Populate the hero's scrolling ticker from the real offence list (falls
// back to a fixed set if the backend isn't reachable yet).
async function initMarquee() {
  const track = document.getElementById('marquee-track');
  if (!track) return;
  let labels;
  try {
    const res = await fetch(`${API_BASE}/offences`);
    const offences = await res.json();
    labels = offences.map((o) => o.label);
  } catch (err) {
    labels = ['Theft', 'Assault', 'Stalking', 'Extortion', 'Fraud', 'Defamation', 'Hacking', 'Identity theft'];
  }
  // Duplicate the list once so the CSS animation (translateX -50%) loops seamlessly.
  const items = [...labels, ...labels]
    .map((label) => `<span>${label}</span><span class="dot">•</span>`)
    .join('');
  track.innerHTML = items;
}

// Fade/slide sections up as they scroll into view.
function initScrollReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || !targets.length) {
    targets.forEach((el) => el.classList.add('in-view'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  targets.forEach((el) => observer.observe(el));
}

// Give the glass nav a solid backdrop once the user scrolls past the hero.
function initNavScrollState() {
  const nav = document.getElementById('site-nav');
  if (!nav) return;
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function confidenceClass(confidence) {
  if (confidence >= 0.66) return '';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

// ---------- Primary flow: single-jurisdiction lookup ----------
async function analyzeIncident() {
  const text = incidentText.value.trim();
  if (!text) return;

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing…';

  try {
    const classifyRes = await fetch(`${API_BASE}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const { candidates } = await classifyRes.json();
    currentCandidates = candidates || [];

    if (currentCandidates.length === 0) {
      resultArea.classList.add('hidden');
      candidatesArea.classList.add('hidden');
      alert("Couldn't match that to a known offence yet. Try adding a bit more detail, or ask the chatbot.");
      return;
    }

    await showOffenceResult(currentCandidates[0].offenceId, currentCandidates[0].confidence);
    renderOtherCandidates(currentCandidates.slice(1));
  } catch (err) {
    console.error(err);
    alert('Could not reach the backend. Make sure it is running on http://localhost:5000');
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze';
  }
}

async function showOffenceResult(offenceId, confidence) {
  const jurisdiction = jurisdictionSelect.value;
  const res = await fetch(`${API_BASE}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offenceId, jurisdiction }),
  });

  if (!res.ok) {
    resultArea.classList.add('hidden');
    return;
  }

  const data = await res.json();
  currentOffenceId = offenceId;

  resultOffence.textContent = data.label;
  resultStatute.textContent = data.statute;
  resultSection.textContent = data.section;
  resultSummary.textContent = data.summary;

  if (data.note) {
    resultNote.textContent = data.note;
    resultNote.classList.remove('hidden');
  } else {
    resultNote.classList.add('hidden');
  }

  if (data.punishment) {
    resultPunishment.textContent = `Punishment: ${data.punishment}`;
    resultPunishment.classList.remove('hidden');
  } else {
    resultPunishment.classList.add('hidden');
  }

  verifySourceBtn.href = data.sourceUrl;

  if (typeof confidence === 'number') {
    const pct = Math.round(confidence * 100);
    resultConfidence.textContent = `${pct}% confidence`;
    resultConfidence.className = `confidence-pill ${confidenceClass(confidence)}`;
    confidenceBarFill.style.width = `${pct}%`;
    confidenceBarFill.style.background =
      confidenceClass(confidence) === 'low' ? 'var(--color-danger)' : confidenceClass(confidence) === 'medium' ? 'var(--color-warning)' : 'var(--color-success)';
  } else {
    resultConfidence.textContent = '';
  }

  resultArea.classList.remove('hidden');
  compareCard.classList.add('hidden'); // reset secondary view on a fresh result
}

function renderOtherCandidates(others) {
  if (!others.length) {
    candidatesArea.classList.add('hidden');
    return;
  }
  candidatesList.innerHTML = others
    .map((c) => `<button class="chip-btn" data-offence="${c.offenceId}">${c.label}</button>`)
    .join('');
  candidatesArea.classList.remove('hidden');
}

candidatesList.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip-btn');
  if (!btn) return;
  const offenceId = btn.dataset.offence;
  const match = currentCandidates.find((c) => c.offenceId === offenceId);
  showOffenceResult(offenceId, match ? match.confidence : undefined);
});

jurisdictionSelect.addEventListener('change', () => {
  if (currentOffenceId) {
    const match = currentCandidates.find((c) => c.offenceId === currentOffenceId);
    showOffenceResult(currentOffenceId, match ? match.confidence : undefined);
  }
});

analyzeBtn.addEventListener('click', analyzeIncident);
incidentText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) analyzeIncident();
});

// ---------- Secondary, opt-in flow: cross-country comparison ----------
compareToggleBtn.addEventListener('click', async () => {
  if (!currentOffenceId) return;

  if (!compareCard.classList.contains('hidden')) {
    compareCard.classList.add('hidden');
    return;
  }

  const codes = jurisdictions.map((j) => j.code);
  const res = await fetch(`${API_BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offenceId: currentOffenceId, jurisdictions: codes }),
  });
  const data = await res.json();

  compareTable.innerHTML = data.results
    .map((r) => {
      const jName = jurisdictions.find((j) => j.code === r.jurisdiction)?.name || r.jurisdiction;
      if (r.unavailable) {
        return `<div class="compare-col"><h3>${jName}</h3><p class="compare-summary">No data yet.</p></div>`;
      }
      return `
        <div class="compare-col">
          <h3>${jName}</h3>
          <p class="compare-cite">${r.statute}<br/><span class="compare-section-cite">${r.section}</span></p>
          <p class="compare-summary">${r.summary}</p>
          ${r.note ? `<p class="compare-note">${r.note}</p>` : ''}
          <a href="${r.sourceUrl}" target="_blank" rel="noopener">Verify official source →</a>
        </div>`;
    })
    .join('');

  compareCard.classList.remove('hidden');
  compareCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ---------- Legal-guidance chatbot ----------
const heroChatBtn = document.getElementById('hero-chat-btn');
const chatTeaser = document.getElementById('chat-teaser');
const chatTeaserClose = document.getElementById('chat-teaser-close');

function openChat() {
  chatPanel.classList.remove('hidden');
  chatTeaser.classList.add('hidden');
}

chatToggleBtn.addEventListener('click', () => {
  const isHidden = chatPanel.classList.contains('hidden');
  chatPanel.classList.toggle('hidden');
  if (isHidden) chatTeaser.classList.add('hidden');
});
chatCloseBtn.addEventListener('click', () => chatPanel.classList.add('hidden'));
if (heroChatBtn) heroChatBtn.addEventListener('click', openChat);

const navChatBtn = document.getElementById('nav-chat-btn');
if (navChatBtn) navChatBtn.addEventListener('click', openChat);
chatTeaserClose.addEventListener('click', (e) => {
  e.stopPropagation();
  chatTeaser.classList.add('hidden');
});
chatTeaser.addEventListener('click', openChat);

// The chatbot's messages use a tiny bit of markdown (**bold**) for
// offence names and citations. Escape the text first (it's still
// user-influenced, however indirectly), then turn **bold** into <strong>.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderChatText(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function addChatMessage(sender, text) {
  const div = document.createElement('div');
  div.className = `chat-msg ${sender}`;
  if (sender === 'bot') {
    div.innerHTML = renderChatText(text);
  } else {
    div.textContent = text;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderQuickReplies(options, isOffenceChoice) {
  chatQuickReplies.innerHTML = '';
  if (!options || !options.length) return;
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'chip-btn';
    btn.textContent = isOffenceChoice ? opt.label : opt;
    btn.addEventListener('click', () => {
      chatQuickReplies.innerHTML = '';
      if (isOffenceChoice) {
        addChatMessage('user', opt.label);
        sendChat({ selectedOffenceId: opt.offenceId });
      } else {
        addChatMessage('user', opt);
        sendChat({ message: opt });
      }
    });
    chatQuickReplies.appendChild(btn);
  });
}

async function sendChat({ message, selectedOffenceId }) {
  const jurisdiction = jurisdictionSelect.value;
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: chatSessionId, message, jurisdiction, selectedOffenceId }),
    });
    const data = await res.json();
    addChatMessage('bot', data.message);

    if (data.type === 'clarify' && data.options && data.options.length) {
      renderQuickReplies(data.options, true);
    } else if (data.quickReplies && data.quickReplies.length) {
      renderQuickReplies(data.quickReplies, false);
    } else {
      chatQuickReplies.innerHTML = '';
    }
  } catch (err) {
    console.error(err);
    addChatMessage('bot', 'Sorry, I could not reach the backend. Make sure it is running on http://localhost:5000');
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  addChatMessage('user', text);
  chatInput.value = '';
  sendChat({ message: text });
});

init();
