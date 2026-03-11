const mongoose = require("mongoose");

const GSTR1Schema = new mongoose.Schema({
  invoice_id: String,
  seller_gstin: String,
  period: String
});

module.exports = mongoose.model("GSTR1", GSTR1Schema);