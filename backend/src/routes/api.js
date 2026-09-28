const express = require('express');
const router = express.Router();

const { classify } = require('../services/classifier');
const { lookup, compare, listOffences, listJurisdictions } = require('../services/retrieval');
const { handleMessage } = require('../services/chatbot');

router.get('/offences', (req, res) => {
  res.json(listOffences());
});

router.get('/jurisdictions', (req, res) => {
  res.json(listJurisdictions());
});

// Classify a plain-language incident description into candidate offences.
router.post('/classify', (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const candidates = classify(text);
  res.json({ candidates: candidates.slice(0, 5), top: candidates[0] || null });
});

// Primary flow: the statute that applies to one offence in one jurisdiction.
router.post('/lookup', (req, res) => {
  const { offenceId, jurisdiction } = req.body || {};
  if (!offenceId || !jurisdiction) {
    return res.status(400).json({ error: 'offenceId and jurisdiction are required' });
  }
  const result = lookup(offenceId, jurisdiction);
  if (!result) {
    return res.status(404).json({ error: 'No data for that offence/jurisdiction combination' });
  }
  res.json(result);
});

// Secondary, opt-in flow: the same offence across several jurisdictions.
router.post('/compare', (req, res) => {
  const { offenceId, jurisdictions } = req.body || {};
  if (!offenceId || !Array.isArray(jurisdictions) || jurisdictions.length === 0) {
    return res.status(400).json({ error: 'offenceId and a jurisdictions array are required' });
  }
  const results = compare(offenceId, jurisdictions);
  if (!results) {
    return res.status(404).json({ error: 'Unknown offence' });
  }
  res.json({ offenceId, results });
});

// Conversational layer over the above: clarifies, explains, and answers follow-ups.
router.post('/chat', (req, res) => {
  const { sessionId, message, jurisdiction, selectedOffenceId } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!message && !selectedOffenceId) {
    return res.status(400).json({ error: 'message or selectedOffenceId is required' });
  }
  const reply = handleMessage({ sessionId, message, jurisdiction, selectedOffenceId });
  res.json(reply);
});

module.exports = router;
