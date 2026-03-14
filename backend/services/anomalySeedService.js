const Anomaly = require('../models/Anomaly');
const Business = require('../models/Business');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toRiskLevel(riskScore) {
  if (riskScore >= 85) return 'CRITICAL';
  if (riskScore >= 70) return 'HIGH';
  if (riskScore >= 45) return 'MEDIUM';
  return 'LOW';
}

function toAnomalyType(index) {
  const types = ['RULE_BASED', 'GRAPH_ANALYSIS', 'AI_PREDICTION'];
  return types[index % types.length];
}

function toSource(type) {
  if (type === 'GRAPH_ANALYSIS') return 'GRAPH_ANALYSIS';
  if (type === 'AI_PREDICTION') return 'AI_MODEL';
  return 'RULE_ENGINE';
}

function buildAnomalyFromBusiness(business, index) {
  const invoiceCount = Number(business.invoiceCount || 0);
  const totalTaxableValue = Number(business.totalTaxableValue || 0);
  const totalTax = Number(business.totalTax || 0);
  const itcClaimed = Number(business.itcClaimed || 0);
  const missingEwayBills = Number(business.missingEwayBills || 0);
  const gstCollected = Number(business.gstCollected || 0);
  const gstPaid = Number(business.gstPaid || 0);
  const lateFilingsCount = Number(business.lateFilings || 0);
  const riskScore = Number(business.riskScore || 0);

  const itcRatio = totalTax > 0 ? itcClaimed / totalTax : 0;
  const missingEwayRatio = invoiceCount > 0 ? missingEwayBills / invoiceCount : 0;
  const gstPaidVsCollectedRatio = gstCollected > 0 ? gstPaid / gstCollected : 0;

  const type = toAnomalyType(index);
  const source = toSource(type);
  const riskLevel = toRiskLevel(riskScore);
  const fraudProbability = clamp((riskScore / 100) * 0.92 + 0.04, 0.05, 0.99);

  return {
    type,
    source,
    businessGstin: business.gstin,
    businessName: business.name,
    riskLevel,
    fraudProbability,
    severity: Math.round(clamp(riskScore, 10, 100)),
    title: `${type.replace(/_/g, ' ')} anomaly detected`,
    description: `Detected suspicious tax behavior for ${business.name} (${business.gstin}).`,
    explanation: [
      `Invoice volume observed: ${invoiceCount}`,
      `Missing e-Way Bill ratio: ${(missingEwayRatio * 100).toFixed(1)}%`,
      `GST paid vs collected ratio: ${gstPaidVsCollectedRatio.toFixed(2)}`,
    ],
    evidenceData: {
      riskScore,
      riskCategory: business.riskCategory || 'unknown',
    },
    features: {
      invoiceCount,
      totalTaxableValue,
      itcRatio,
      lateFilingsCount,
      missingEwayRatio,
      gstPaidVsCollectedRatio,
      degreeCentrality: clamp(riskScore / 120, 0, 1),
      outDegree: Math.round(clamp(invoiceCount / 5, 0, 90)),
      inDegree: Math.round(clamp(invoiceCount / 6, 0, 90)),
      cycleParticipation: clamp((riskScore % 30) / 30, 0, 1),
      clusterSize: Math.round(clamp(invoiceCount / 8, 1, 30)),
      avgNeighborRisk: clamp((riskScore + 10) / 100, 0, 1),
    },
    status: 'NEW',
    detectedAt: new Date(),
  };
}

async function ensureInitialAnomalies() {
  const existing = await Anomaly.countDocuments();
  if (existing > 0) return { created: 0, skipped: true };

  const businesses = await Business.find({})
    .sort({ riskScore: -1, invoiceCount: -1, createdAt: 1 })
    .limit(15)
    .lean();

  if (!businesses.length) return { created: 0, skipped: true };

  const docs = businesses.map((b, idx) => buildAnomalyFromBusiness(b, idx));
  await Anomaly.insertMany(docs, { ordered: true });

  return { created: docs.length, skipped: false };
}

module.exports = {
  ensureInitialAnomalies,
};
