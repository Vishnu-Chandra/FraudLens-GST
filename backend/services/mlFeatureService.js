const Business = require('../models/Business');
const Invoice = require('../models/Invoice');
const GSTR3B = require('../models/GSTR3B');
const EWayBill = require('../models/EWayBill');

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function buildFeaturesForBusiness(gstin) {
  const business = await Business.findOne({ gstin }).lean();
  if (!business) return null;

  const invoiceQuery = { $or: [{ seller_gstin: gstin }, { buyer_gstin: gstin }] };

  const [invoiceCount, taxableAgg, invoices] = await Promise.all([
    Invoice.countDocuments(invoiceQuery),
    Invoice.aggregate([
      { $match: invoiceQuery },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Invoice.find(invoiceQuery).select('invoice_id seller_gstin buyer_gstin gst_amount').lean(),
  ]);

  const uniqueInvoiceIds = [...new Set(invoices
    .map((inv) => String(inv.invoice_id || '').trim())
    .filter(Boolean))];

  const ewayCount = uniqueInvoiceIds.length > 0
    ? await EWayBill.countDocuments({ invoice_id: { $in: uniqueInvoiceIds } })
    : 0;

  const missingEwayRatio = uniqueInvoiceIds.length > 0
    ? (uniqueInvoiceIds.length - ewayCount) / uniqueInvoiceIds.length
    : 0;

  const gstCollected = invoices.reduce((sum, inv) => (
    inv.seller_gstin === gstin ? sum + toNumber(inv.gst_amount) : sum
  ), 0);

  const taxPaidAgg = await GSTR3B.aggregate([
    { $match: { gstin } },
    { $group: { _id: null, totalTaxPaid: { $sum: '$tax_paid' } } },
  ]);

  const totalTaxPaid = toNumber(taxPaidAgg[0]?.totalTaxPaid, toNumber(business.gstPaid));
  const gstPaidVsCollectedRatio = gstCollected > 0 ? totalTaxPaid / gstCollected : 0;

  const outPartners = new Set();
  const inPartners = new Set();
  const allPartners = new Set();

  invoices.forEach((inv) => {
    const seller = String(inv.seller_gstin || '').trim();
    const buyer = String(inv.buyer_gstin || '').trim();

    if (seller === gstin && buyer && buyer !== gstin) outPartners.add(buyer);
    if (buyer === gstin && seller && seller !== gstin) inPartners.add(seller);

    if (seller && seller !== gstin) allPartners.add(seller);
    if (buyer && buyer !== gstin) allPartners.add(buyer);
  });

  let cycleParticipation = 0;
  if (outPartners.size > 0 && inPartners.size > 0) {
    for (const partner of outPartners) {
      if (inPartners.has(partner)) {
        cycleParticipation = 1;
        break;
      }
    }
  }

  const neighbors = allPartners.size > 0
    ? await Business.find({ gstin: { $in: [...allPartners] } }).select('riskScore').lean()
    : [];

  const avgNeighborRisk = neighbors.length > 0
    ? neighbors.reduce((sum, item) => sum + toNumber(item.riskScore), 0) / neighbors.length / 100
    : 0;

  const totalTax = toNumber(business.totalTax);
  const itcClaimed = toNumber(business.itcClaimed);

  return {
    business,
    features: {
      invoiceCount: toNumber(invoiceCount),
      totalTaxableValue: toNumber(taxableAgg[0]?.total, toNumber(business.totalTaxableValue)),
      itcRatio: totalTax > 0 ? itcClaimed / totalTax : toNumber(business.itcRatio),
      lateFilingsCount: toNumber(business.lateFilings),
      missingEwayRatio,
      gstPaidVsCollectedRatio,
      degreeCentrality: allPartners.size,
      outDegree: outPartners.size,
      inDegree: inPartners.size,
      cycleParticipation,
      avgNeighborRisk,
    },
  };
}

module.exports = {
  buildFeaturesForBusiness,
};
