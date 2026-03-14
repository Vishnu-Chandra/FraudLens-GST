const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  call_id: { type: String, required: true, unique: true },
  business_name: { type: String, required: true },
  gstin: { type: String, required: true },
  dialed_number: { type: String, required: true },
  call_status: { type: String, enum: ['COMPLETED', 'FAILED', 'NO ANSWER', 'BUSY'], required: true },
  call_time: { type: Date, required: true },
  investigator: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('CallLog', callLogSchema);
