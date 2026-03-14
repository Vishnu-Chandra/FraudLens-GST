const Case = require('../models/Case');
const Anomaly = require('../models/Anomaly');
const { getActiveOfficerNames } = require('./officerService');

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildSeedTemplates() {
  return [
    {
      title: 'Critical Network Anomaly Investigation',
      description: 'Investigate high-severity anomalies flagged in transaction network analysis.',
      priority: 'CRITICAL',
      status: 'OPEN',
      pick: 3,
    },
    {
      title: 'AI-Predicted Fraud Pattern Review',
      description: 'Validate AI-detected suspicious tax behavior and establish evidence trail.',
      priority: 'HIGH',
      status: 'UNDER_INVESTIGATION',
      pick: 3,
    },
    {
      title: 'Rule-Based Compliance Exception Case',
      description: 'Review rule-engine compliance exceptions and resolve false positives.',
      priority: 'MEDIUM',
      status: 'OPEN',
      pick: 2,
    },
  ];
}

async function ensureInitialCases() {
  const existing = await Case.countDocuments();
  if (existing > 0) return { created: 0, skipped: true };

  const anomalies = await Anomaly.find({})
    .sort({ severity: -1, detectedAt: -1 })
    .limit(12)
    .lean();

  if (!anomalies.length) return { created: 0, skipped: true };

  const officers = await getActiveOfficerNames();
  if (!officers.length) return { created: 0, skipped: true };

  const templates = buildSeedTemplates();
  const docs = [];
  let cursor = 0;

  templates.forEach((template, index) => {
    const slice = anomalies.slice(cursor, cursor + template.pick);
    if (!slice.length) return;
    cursor += template.pick;

    docs.push({
      case_id: `CASE-${String(index + 1).padStart(4, '0')}`,
      title: template.title,
      description: template.description,
      businesses: unique(slice.map((a) => a.businessGstin)),
      linked_anomalies: slice.map((a) => String(a._id)),
      investigator: officers[index % officers.length],
      priority: template.priority,
      status: template.status,
      notes: [],
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  if (!docs.length) return { created: 0, skipped: true };

  await Case.insertMany(docs, { ordered: true });
  return { created: docs.length, skipped: false };
}

module.exports = {
  ensureInitialCases,
};
