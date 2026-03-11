const mongoose = require("mongoose");

const EWayBillSchema = new mongoose.Schema({
  eway_id: String,
  invoice_id: String,
  vehicle_number: String
});

module.exports = mongoose.model("EWayBill", EWayBillSchema);