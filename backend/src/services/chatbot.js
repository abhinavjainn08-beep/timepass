const { classify } = require('./classifier');
const { lookup, listOffences } = require('./retrieval');
const { generateConversationalReply } = require('./llm');

// In-memory session store, keyed by a sessionId the frontend generates
// once per browser tab (see frontend/app.js). Good enough for a class
// project demo; swap for Redis/a DB if this ever needs to survive a
// server restart or run across multiple instances.
const sessions = new Map();

const REPORTING_GUIDANCE = {
  IN: "File a First Information Report (FIR) at your local police station, or report cybercrime-related incidents at cybercrime.gov.in (India's National Cyber Crime Reporting Portal).",
  UK: 'Report to the police via 101 (999 in an emergency). For fraud or cybercrime specifically, report via Action Fraud at actionfraud.police.uk.',
};

const DISCLAIMER =
  "This is general legal information, not legal advice — for anything serious, please talk to a qualified lawyer.";

const MAX_HISTORY_TURNS = 8; // 4 user + 4 model messages, roughly

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      jurisdiction: 'IN',
      lastOffenceId: null,
      lastConfidence: null,
      turns: 0,
      history: [],
    });
  }
  return sessions.get(sessionId);
}

function remember(session, role, text) {
  session.history.push({ role, text });
  if (session.history.length > MAX_HISTORY_TURNS) {
    session.history = session.history.slice(-MAX_HISTORY_TURNS);
  }
}

// The fallback used whenever the LLM is unavailable (no API key, network
// error, timeout) — keeps the app fully functional with zero config.
const FALLBACK_CLARIFY = "I couldn't match that to a specific offence yet — can you describe what happened in a bit more detail?";

function buildAnswer(offenceId, jurisdiction, session) {
  const result = lookup(offenceId, jurisdiction);
  if (!result) {
    return {
      type: 'answer',
      message: "I don't have data for that offence in this jurisdiction yet.",
      offenceId,
      jurisdiction,
    };
  }

  session.lastOffenceId = offenceId;
  session.jurisdiction = jurisdiction;

  let message = `**${result.label}** — under **${result.statute}, ${result.section}** (${jurisdiction}): ${result.summary}`;
  if (result.punishment) message += `\n\nPunishment: ${result.punishment}`;
  if (result.note) message += `\n\nNote: ${result.note}`;
  if (session.turns === 0) message += `\n\n${DISCLAIMER}`;

  session.turns += 1;

  return {
    type: 'answer',
    message,
    offenceId,
    label: result.label,
    jurisdiction,
    section: result.section,
    statute: result.statute,
    sourceUrl: result.sourceUrl,
    confidence: session.lastConfidence,
    quickReplies: ["What's the punishment?", 'How do I file a complaint?', 'Compare with another country'],
  };
}

async function handleMessage({ sessionId, message, jurisdiction, selectedOffenceId }) {
  const session = getSession(sessionId);
  if (jurisdiction) session.jurisdiction = jurisdiction;
  const lower = (message || '').toLowerCase();

  // The user clicked a quick-reply offence option from a "clarify" turn.
  if (selectedOffenceId) {
    return buildAnswer(selectedOffenceId, session.jurisdiction, session);
  }

  // Follow-ups that make sense once an offence has already been discussed.
  if (session.lastOffenceId) {
    if (/punish|penalty|sentence|jail|imprisonment/.test(lower)) {
      const result = lookup(session.lastOffenceId, session.jurisdiction);
      return {
        type: 'answer',
        message: result?.punishment
          ? `Punishment: ${result.punishment}`
          : 'Exact sentencing depends on the facts of the case and court discretion — the linked section has the full detail.',
        sourceUrl: result?.sourceUrl,
      };
    }

    if (/file|complain|report|fir|police/.test(lower)) {
      return {
        type: 'answer',
        message: REPORTING_GUIDANCE[session.jurisdiction] || REPORTING_GUIDANCE.IN,
      };
    }

    if (/compar|other countr|different countr/.test(lower)) {
      const other = session.jurisdiction === 'IN' ? 'UK' : 'IN';
      const here = lookup(session.lastOffenceId, session.jurisdiction);
      const there = lookup(session.lastOffenceId, other);
      if (here && there) {
        return {
          type: 'comparison',
          message: `In ${session.jurisdiction}: ${here.statute}, ${here.section}. In ${other}: ${there.statute}, ${there.section}.${
            there.note ? ' Note: ' + there.note : ''
          }`,
          comparison: [here, there],
        };
      }
    }
  }

  // Otherwise, treat the message as a (new) incident description.
  const candidates = classify(message);

  if (candidates.length === 0) {
    // Doesn't look like an incident description — hand off to the
    // conversational layer for greetings/small talk/general questions.
    // It never invents citations (see llm.js); if it's unavailable for
    // any reason, fall back to the original static prompt so the app
    // keeps working with zero config.
    remember(session, 'user', message);
    try {
      const offenceLabels = listOffences().map((o) => o.label);
      const reply = await generateConversationalReply({
        message,
        history: session.history.slice(0, -1),
        offenceLabels,
      });
      remember(session, 'model', reply);
      return { type: 'smalltalk', message: reply };
    } catch (err) {
      console.error('Conversational fallback unavailable:', err.message);
      return {
        type: 'clarify',
        message: "I couldn't match that to a specific offence yet — can you describe what happened in a bit more detail?",
        options: [],
      };
    }
  }

  const [top, second] = candidates;
  session.lastConfidence = top.confidence;

  // Only worth asking the user to disambiguate when there's genuinely
  // something to choose between — a single low-confidence match should
  // just be answered (the confidence score already signals the uncertainty).
  const ambiguous = Boolean(second) && (top.confidence < 0.4 || top.confidence - second.confidence < 0.12);

  if (ambiguous) {
    return {
      type: 'clarify',
      message: 'This could be a few different things — which one best matches what happened?',
      options: candidates.slice(0, 3).map((c) => ({ offenceId: c.offenceId, label: c.label })),
    };
  }

  return buildAnswer(top.offenceId, session.jurisdiction, session);
}

module.exports = { handleMessage };
