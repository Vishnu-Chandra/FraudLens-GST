const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    author: { type: String, required: true, trim: true },
    note: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const caseSchema = new mongoose.Schema(
  {
    case_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    businesses: {
      type: [String],
      default: [],
      index: true,
    },
    linked_anomalies: {
      type: [String],
      default: [],
    },
    investigator: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
      index: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'UNDER_INVESTIGATION', 'EVIDENCE_COLLECTED', 'ESCALATED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    notes: {
      type: [noteSchema],
      default: [],
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

caseSchema.pre('save', function preSave() {
  this.updated_at = new Date();
});

caseSchema.pre('findOneAndUpdate', function preUpdate() {
  this.set({ updated_at: new Date() });
});

caseSchema.index({ status: 1, priority: 1, created_at: -1 });

module.exports = mongoose.model('Case', caseSchema);
