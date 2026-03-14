const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const TaxReturn = require('../models/TaxReturn');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gst_platform';
const GSTR3B_PATH = path.join(__dirname, '../../data/gstr3b.json');

const MONTH_SLICES = [
  { month: 10, year: 2025, scale: 0.84 },
  { month: 11, year: 2025, scale: 0.91 },
  { month: 12, year: 2025, scale: 1.0 },
  { month: 1,  year: 2026, scale: 1.08 },
  { month: 2,  year: 2026, scale: 1.16 },
  { month: 3,  year: 2026, scale: 1.22 },
];

function quarterFromMonth(month) {
  return Math.ceil(month / 3);
}

function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function buildRatio(gstin) {
  // Yields a deterministic spread across low/medium/high ITC risk levels.
  const raw = stableHash(gstin) % 100;
  if (raw < 35) return 0.95 + (raw % 20) * 0.01; // ~0.95 to 1.14 (LOW)
  if (raw < 75) return 1.2 + (raw % 30) * 0.02; // ~1.20 to 1.78 (MEDIUM)
  return 2.05 + (raw % 50) * 0.02; // ~2.05 to 3.03 (HIGH)
}

function buildFilingDate(year, month) {
  return new Date(Date.UTC(year, month - 1, 12));
}

function buildDueDate(year, month) {
  return new Date(Date.UTC(year, month - 1, 20));
}

async function seedTaxReturns() {
  try {
    if (!fs.existsSync(GSTR3B_PATH)) {
      throw new Error(`Missing source file: ${GSTR3B_PATH}`);
    }

    const source = JSON.parse(fs.readFileSync(GSTR3B_PATH, 'utf8'));
    if (!Array.isArray(source) || source.length === 0) {
      throw new Error('gstr3b.json has no records');
    }

    await mongoose.connect(MONGO_URI);

    const docs = [];
    for (const row of source) {
      const gstin = String(row.gstin || '').trim();
      const annualTax = Number(row.tax_paid || 0);
      if (!gstin || annualTax <= 0) continue;

      const ratio = buildRatio(gstin);

      for (const slice of MONTH_SLICES) {
        const baseGst = Math.max(Math.round(annualTax * slice.scale * 0.18), 1000);
        const monthHashNoise = ((stableHash(`${gstin}-${slice.month}-${slice.year}`) % 9) - 4) * 0.015;
        const effectiveRatio = Math.max(0.7, ratio + monthHashNoise);
        const itcClaimed = Math.max(Math.round(baseGst * effectiveRatio), 500);

        docs.push({
          gstin,
          returnType: 'GSTR3B',
          filingPeriod: {
            month: slice.month,
            year: slice.year,
            quarter: quarterFromMonth(slice.month),
          },
          filingDate: buildFilingDate(slice.year, slice.month),
          dueDate: buildDueDate(slice.year, slice.month),
          isLate: false,
          totalTaxPaid: baseGst,
          itcClaimed,
          status: 'filed',
        });
      }
    }

    await TaxReturn.deleteMany({});
    if (docs.length > 0) {
      await TaxReturn.insertMany(docs);
    }

    console.log(`Seeded TaxReturn records: ${docs.length}`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed tax returns:', error.message);
    process.exit(1);
  }
}

seedTaxReturns();
