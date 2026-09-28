// Optional conversational layer over the rule-based chatbot.
//
// The classify()/lookup() pipeline in classifier.js + retrieval.js stays
// 100% deterministic — every statute citation the app shows still comes
// only from lawCorpus.json, never from the model. This module is called
// ONLY when a message fails to classify as an incident and doesn't match
// a known follow-up intent (see chatbot.js) — i.e. greetings, small talk,
// "what can you do", general questions. It exists purely so the bot
// doesn't feel broken when someone just says "hey".
//
// Uses Node's built-in fetch (Node 18+) — no new dependency. If
// GEMINI_API_KEY isn't set, or the request fails for any reason, the
// caller (chatbot.js) catches the error and falls back to the original
// static message, so the app still runs with zero config exactly as
// before. The API key is entirely optional.

const MODEL = 'gemini-3.8-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 8000;

function buildSystemPrompt(offenceLabels) {
  return [
    'You are the conversational layer of Themis, a legal-information web app covering India and the UK.',
    `The app can classify an incident description into one of these categories and cite the exact statute: ${offenceLabels.join(', ')}.`,
    'A separate, deterministic part of the app already handles that classification and citation from a verified law corpus whenever someone describes an actual incident — you are only ever shown a message AFTER that has already failed to match, so you are handling greetings, small talk, "what can you do" questions, or general/off-topic questions.',
    'Never invent or state a specific statute, section number, or punishment yourself, even if asked — you do not have that data and must not guess it. If the message looks like it could be describing an incident, warmly ask them to describe what happened in one or two plain-language sentences so the classifier can pick it up.',
    'Keep replies to 1-3 short sentences, friendly and plain-spoken, no markdown formatting. If asked for legal advice on a specific situation, remind them this is general information, not legal advice, and a qualified lawyer should be consulted for anything serious.',
  ].join(' ');
}

/**
 * @param {{ message: string, history: Array<{role: 'user'|'model', text: string}>, offenceLabels: string[] }} params
 * @returns {Promise<string>} the model's reply text
 */
async function generateConversationalReply({ message, history = [], offenceLabels = [] }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const contents = [
    ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: buildSystemPrompt(offenceLabels) }] },
        generationConfig: { maxOutputTokens: 200, temperature: 0.6 },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini API responded ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
    if (!text) {
      throw new Error('Gemini API returned no text');
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { generateConversationalReply };
