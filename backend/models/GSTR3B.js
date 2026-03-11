const mongoose = require("mongoose");

const GSTR3BSchema = new mongoose.Schema({
  gstin: String,
  period: String,
  tax_paid: Number
});

module.exports = mongoose.model("GSTR3B", GSTR3BSchema);