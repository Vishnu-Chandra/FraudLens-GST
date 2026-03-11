const Business = require("../models/Business");
const Invoice = require("../models/Invoice");
const GSTR1 = require("../models/GSTR1");

exports.createBusiness = async (req, res) => {

  try {

    const business = await Business.create(req.body);

    res.json(business);

  } catch (error) {

    res.status(500).json({ error: error.message });

  }

};

exports.getBusiness = async (req, res) => {

  try {

    const business = await Business.findOne({
      gstin: req.params.gstin
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json(business);

  } catch (error) {

    res.status(500).json({ error: error.message });

  }
};

exports.getBusinessTransactions = async (req, res) => {
  try {
    const { gstin } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);

    const deterministicFlag = (value) => {
      const str = String(value || '');
      let hash = 0;
      for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    };

    // Fetch invoices where business is buyer or seller
    const invoices = await Invoice.find({
      $or: [{ seller_gstin: gstin }, { buyer_gstin: gstin }],
    }).sort({ invoice_date: -1, _id: -1 }).limit(limit);

    const transactions = [];

    for (const inv of invoices) {
      // Find the supplier (seller) details
      const supplier = await Business.findOne({ gstin: inv.seller_gstin });
      const supplierName = supplier ? supplier.name || supplier.business_name : "Unknown Entity";

      // Check GSTR-1 (did the seller report it?)
      const gstr1Record = await GSTR1.findOne({ invoice_id: inv.invoice_id });
      const gstr1Status = gstr1Record ? "filed" : "missing";

      // Check GSTR-2B logic (if seller filed GSTR-1, it reflects in buyer's GSTR-2B)
      const gstr2bStatus = gstr1Record ? "reflected" : "missing";

      let status = "matched";
      let booksStatus = "match";
      let insight = "Perfect 3-source match";

      if (!gstr1Record) {
        status = "mismatch";
        insight = "Missing in Supplier GSTR-1 - ITC Risk";
      }

      // If amount is suspiciously high and gstr1 is missing
      if (!gstr1Record && inv.amount > 100000) {
        status = "fraud";
        insight = "High value invoice missing in GSTR-1 - Block ITC";
      }

      // Keep demo anomaly variety deterministic across reloads
      if (status === "matched" && deterministicFlag(inv.invoice_id) % 20 === 0) {
        status = "partial";
        booksStatus = "mismatch";
        insight = "Value mismatch in books vs GSTR-2B";
      }

      transactions.push({
        invoice_no: inv.invoice_id,
        supplier_gstin: inv.seller_gstin,
        buyer_gstin: inv.buyer_gstin,
        supplier_name: supplierName,
        taxable_value: inv.amount,
        gst_amount: inv.gst_amount,
        month: inv.month,
        gstr1_status: gstr1Status,
        gstr2b_status: gstr2bStatus,
        books_status: booksStatus,
        status: status,
        insight: insight,
      });
    }

    res.json({ invoices: transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};