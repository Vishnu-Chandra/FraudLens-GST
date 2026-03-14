const Officer = require('../models/Officer');

const DEFAULT_OFFICERS = [
  { name: 'Ravi Kumar', tier: 'EXPERT', years: 12, active: true },
  { name: 'Priya Sharma', tier: 'EXPERT', years: 10, active: true },
  { name: 'Anita Verma', tier: 'SENIOR', years: 8, active: true },
  { name: 'Karan Patel', tier: 'SENIOR', years: 7, active: true },
  { name: 'Neha Singh', tier: 'MID', years: 5, active: true },
  { name: 'Rahul Mehta', tier: 'JUNIOR', years: 3, active: true },
];

async function ensureDefaultOfficers() {
  const count = await Officer.countDocuments();
  if (count > 0) return;
  await Officer.insertMany(DEFAULT_OFFICERS);
}

async function getActiveOfficers() {
  await ensureDefaultOfficers();
  return Officer.find({ active: true }).sort({ tier: -1, years: -1, name: 1 }).lean();
}

async function getActiveOfficerNames() {
  const officers = await getActiveOfficers();
  return officers.map((o) => o.name);
}

module.exports = {
  DEFAULT_OFFICERS,
  ensureDefaultOfficers,
  getActiveOfficers,
  getActiveOfficerNames,
};
