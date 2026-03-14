const Anomaly = require('../models/Anomaly');
const { DEFAULT_OFFICERS, getActiveOfficers } = require('./officerService');

const OFFICER_POOL = [
  { name: 'Ravi Kumar', tier: 'EXPERT', years: 12 },
  { name: 'Priya Sharma', tier: 'EXPERT', years: 10 },
  { name: 'Anita Verma', tier: 'SENIOR', years: 8 },
  { name: 'Karan Patel', tier: 'SENIOR', years: 7 },
  { name: 'Neha Singh', tier: 'MID', years: 5 },
  { name: 'Rahul Mehta', tier: 'JUNIOR', years: 3 },
];

const tierRank = {
  JUNIOR: 1,
  MID: 2,
  SENIOR: 3,
  EXPERT: 4,
};

function normalizeRisk(riskLevel) {
  const v = String(riskLevel || '').toUpperCase();
  if (v === 'CRITICAL') return 'CRITICAL';
  if (v === 'HIGH') return 'HIGH';
  if (v === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

function eligibleTiersByRisk(riskLevel) {
  const risk = normalizeRisk(riskLevel);
  if (risk === 'CRITICAL' || risk === 'HIGH') return ['EXPERT', 'SENIOR'];
  if (risk === 'MEDIUM') return ['SENIOR', 'MID'];
  return ['MID', 'JUNIOR'];
}

function pickOfficer(riskLevel, currentLoadMap) {
  const eligibleTiers = eligibleTiersByRisk(riskLevel);
  const pool = Array.isArray(OFFICER_POOL) && OFFICER_POOL.length > 0 ? OFFICER_POOL : DEFAULT_OFFICERS;
  const eligible = pool.filter((o) => eligibleTiers.includes(o.tier));

  eligible.sort((a, b) => {
    const loadA = currentLoadMap[a.name] || 0;
    const loadB = currentLoadMap[b.name] || 0;

    if (loadA !== loadB) return loadA - loadB;

    const tierDiff = (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0);
    if (tierDiff !== 0) return tierDiff;

    return (b.years || 0) - (a.years || 0);
  });

  return eligible[0] || pool[0];
}

async function getCurrentWorkloadMap() {
  const activeStatuses = ['NEW', 'INVESTIGATING', 'ESCALATED'];

  const workload = await Anomaly.aggregate([
    {
      $match: {
        assignedTo: { $exists: true, $ne: '' },
        status: { $in: activeStatuses },
      },
    },
    { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
  ]);

  const map = {};
  workload.forEach((w) => {
    map[w._id] = w.count;
  });

  return map;
}

async function autoAssignUnassignedAnomalies() {
  const dbOfficers = await getActiveOfficers();
  OFFICER_POOL.length = 0;
  OFFICER_POOL.push(...(dbOfficers.length > 0 ? dbOfficers : DEFAULT_OFFICERS));

  const pending = await Anomaly.find({
    $and: [
      {
        $or: [
          { assignedTo: { $exists: false } },
          { assignedTo: '' },
        ],
      },
      {
        status: { $in: ['NEW', 'INVESTIGATING', 'ESCALATED'] },
      },
    ],
  }).select('_id riskLevel');

  if (pending.length === 0) {
    return { updated: 0 };
  }

  const loadMap = await getCurrentWorkloadMap();
  const bulkOps = [];

  pending.forEach((anomaly) => {
    const officer = pickOfficer(anomaly.riskLevel, loadMap);
    loadMap[officer.name] = (loadMap[officer.name] || 0) + 1;

    bulkOps.push({
      updateOne: {
        filter: { _id: anomaly._id },
        update: { $set: { assignedTo: officer.name } },
      },
    });
  });

  if (bulkOps.length > 0) {
    await Anomaly.bulkWrite(bulkOps);
  }

  return { updated: bulkOps.length };
}

module.exports = {
  OFFICER_POOL,
  autoAssignUnassignedAnomalies,
};
