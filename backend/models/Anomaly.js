const mongoose = require('mongoose');

const anomalySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['RULE_BASED', 'GRAPH_ANALYSIS', 'AI_PREDICTION', 'MANUAL'],
    required: true,
  },
  businessGstin: {
    type: String,
    required: true,
    index: true,
  },
  businessName: {
    type: String,
    required: true,
  },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true,
    index: true,
  },
  fraudProbability: {
    type: Number,
    min: 0,
    max: 1,
    default: 0,
  },
  severity: {
    type: Number,
    min: 0,
    max: 100,
    required: true,
  },
  title: {
    type: String,
  },
  description: {
    type: String,
    required: true,
  },
  explanation: [{
    type: String,
  }],
  evidenceData: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  features: {
    // Financial features
    invoiceCount: Number,
    totalTaxableValue: Number,
    itcRatio: Number,
    lateFilingsCount: Number,
    missingEwayRatio: Number,
    gstPaidVsCollectedRatio: Number,
    
    // Graph features
    degreeCentrality: Number,
    outDegree: Number,
    inDegree: Number,
    cycleParticipation: Number,
    clusterSize: Number,
    avgNeighborRisk: Number,
  },
  status: {
    type: String,
    enum: ['NEW', 'INVESTIGATING', 'CONFIRMED', 'DISMISSED', 'ESCALATED'],
    default: 'NEW',
    index: true,
  },
  assignedTo: {
    type: String,
  },
  resolvedAt: {
    type: Date,
  },
  detectedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  notes: [{
    text: String,
    addedBy: String,
    addedAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true,
});

// Index for filtering and sorting
anomalySchema.index({ detectedAt: -1 });
anomalySchema.index({ riskLevel: 1, status: 1 });
anomalySchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Anomaly', anomalySchema);
