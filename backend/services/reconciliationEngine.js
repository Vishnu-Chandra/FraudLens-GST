const Invoice = require("../models/Invoice");
const GSTR1 = require("../models/GSTR1");
const GSTR3B = require("../models/GSTR3B");
const EWayBill = require("../models/EWayBill");

async function reconcileInvoices(gstin) {
  const query = gstin
    ? { $or: [{ seller_gstin: gstin }, { buyer_gstin: gstin }] }
    : {};
  const invoices = await Invoice.find(query);

  const results = [];

  for (let invoice of invoices) {

    let issues = [];
    let riskScore = 0;

    // Check GSTR1
    const gstr1 = await GSTR1.findOne({
      invoice_id: invoice.invoice_id
    });

    if (!gstr1) {
      issues.push("Invoice missing in GSTR-1");
      riskScore += 30;
    }

    // Check supplier tax payment
    const gstr3b = await GSTR3B.findOne({
      gstin: invoice.seller_gstin,
      period: invoice.month
    });

    if (!gstr3b || gstr3b.tax_paid < invoice.gst_amount) {
      issues.push("Supplier tax unpaid");
      riskScore += 40;
    }

    // Check eWay bill
    if (invoice.amount > 50000) {

      const eway = await EWayBill.findOne({
        invoice_id: invoice.invoice_id
      });

      if (!eway) {
        issues.push("Missing e-Way bill");
        riskScore += 20;
      }
    }

    let status = "LOW";

    if (riskScore > 50) status = "HIGH";
    else if (riskScore > 20) status = "MEDIUM";

    results.push({
      invoice_id: invoice.invoice_id,
      seller: invoice.seller_gstin,
      buyer: invoice.buyer_gstin,
      riskScore,
      status,
      issues
    });

  }

  return results;
}

module.exports = reconcileInvoices;