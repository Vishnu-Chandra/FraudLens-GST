const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema({
  invoice_id: String,
  seller_gstin: String,
  buyer_gstin: String,
  amount: Number,
  gst_amount: Number,
  invoice_date: Date,
  month: String
});

module.exports = mongoose.model("Invoice", InvoiceSchema);