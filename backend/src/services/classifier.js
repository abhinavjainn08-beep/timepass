const corpus = require('../data/lawCorpus.json');

/**
 * Very small rule-based offence classifier.
 *
 * It scores each offence category by how many of its keyword phrases
 * appear in the incident text, gives a small bonus to longer/more
 * specific phrases (they're less likely to be false positives), and
 * turns the raw score into a 0-1 "confidence" with a smoothing curve
 * so a single weak match never reads as 100% certain.
 *
 * This is intentionally dependency-free (no ML model, no API key) so
 * the project runs immediately after `npm install`. Swap this file
 * for an embeddings/LLM-based classifier later without touching the
 * rest of the app — everything downstream only cares about the
 * { offenceId, label, confidence } shape returned here.
 */
function classify(text) {
  const lower = (text || '').toLowerCase();
  if (!lower.trim()) return [];

  const scored = corpus.offences
    .map((offence) => {
      let score = 0;
      for (const keyword of offence.keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          const specificityBonus = keyword.split(' ').length * 0.15;
          score += 1 + specificityBonus;
        }
      }
      return { offenceId: offence.id, label: offence.label, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((candidate) => ({
    ...candidate,
    confidence: Math.round((candidate.score / (candidate.score + 2)) * 100) / 100,
  }));
}

module.exports = { classify };
