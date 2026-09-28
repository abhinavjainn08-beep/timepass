const corpus = require('../data/lawCorpus.json');

function getOffence(offenceId) {
  return corpus.offences.find((o) => o.id === offenceId) || null;
}

function listOffences() {
  return corpus.offences.map((o) => ({ id: o.id, label: o.label }));
}

function listJurisdictions() {
  return corpus.jurisdictions;
}

/** Single-jurisdiction lookup — this is the primary product flow. */
function lookup(offenceId, jurisdictionCode) {
  const offence = getOffence(offenceId);
  if (!offence) return null;
  const law = offence.laws[jurisdictionCode];
  if (!law) return null;
  return {
    offenceId: offence.id,
    label: offence.label,
    jurisdiction: jurisdictionCode,
    ...law,
  };
}

/** Cross-country comparison — secondary, opt-in mode. */
function compare(offenceId, jurisdictionCodes) {
  const offence = getOffence(offenceId);
  if (!offence) return null;
  return jurisdictionCodes.map((code) => {
    const law = offence.laws[code];
    return law
      ? { jurisdiction: code, ...law }
      : { jurisdiction: code, unavailable: true };
  });
}

module.exports = { getOffence, lookup, compare, listOffences, listJurisdictions };
