const Anomaly = require('../models/Anomaly');
const Business = require('../models/Business');
const Invoice = require('../models/Invoice');
const GSTR3B = require('../models/GSTR3B');
const EWayBill = require('../models/EWayBill');
const { autoAssignUnassignedAnomalies, OFFICER_POOL } = require('../services/investigatorAssignmentService');
const predictFraud = require('../services/aiFraudService');
const { buildFeaturesForBusiness } = require('../services/mlFeatureService');

const MONTH_TO_NUM = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function dateKeyFromInvoice(inv, fallbackYear) {
  if (inv.invoice_date) {
    const d = new Date(inv.invoice_date);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const monthStr = String(inv.month || '').trim().toLowerCase();
  const monthNum = MONTH_TO_NUM[monthStr.slice(0, 3)];
  if (monthNum) return `${fallbackYear}-${String(monthNum).padStart(2, '0')}-01`;
  return null;
}

function toDayRange(dateKey) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function deriveAnomalySource(anomaly) {
  if (anomaly.source) return anomaly.source;

  switch (anomaly.type) {
    case 'GRAPH_ANALYSIS':
      return 'GRAPH_ANALYSIS';
    case 'AI_PREDICTION':
      return 'AI_MODEL';
    case 'RULE_BASED':
    case 'MANUAL':
    default:
      return 'RULE_ENGINE';
  }
}

function withAnomalySource(anomaly) {
  return {
    ...anomaly,
    source: deriveAnomalySource(anomaly),
  };
}

function normalizePrediction(prediction = {}) {
  const probability = Number(prediction.fraud_probability ?? prediction.fraudProbability ?? 0);
  const bounded = Number.isFinite(probability) ? Math.max(0, Math.min(1, probability)) : 0;

  const mappedRisk = String(prediction.risk_level || prediction.riskLevel || '').toUpperCase();
  const riskLevel = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(mappedRisk)
    ? mappedRisk
    : (bounded >= 0.85 ? 'CRITICAL' : bounded >= 0.7 ? 'HIGH' : bounded >= 0.4 ? 'MEDIUM' : 'LOW');

  const severity = Math.max(1, Math.min(100, Math.round(bounded * 100)));

  return {
    fraudProbability: bounded,
    riskLevel,
    severity,
    predictionClass: prediction.prediction_class || prediction.predictionClass || 'UNKNOWN',
    confidenceFactors: Array.isArray(prediction.confidence_factors)
      ? prediction.confidence_factors
      : [],
    rawAnomalyScore: Number(prediction.raw_anomaly_score ?? prediction.rawAnomalyScore ?? 0),
  };
}

async function createOrUpdateAiAnomaly({ business, features, prediction }) {
  const normalized = normalizePrediction(prediction);
  const explanation = [
    `ML model classified this business as ${normalized.predictionClass}.`,
    ...normalized.confidenceFactors,
  ];

  const anomaly = await Anomaly.findOneAndUpdate(
    { businessGstin: business.gstin, type: 'AI_PREDICTION' },
    {
      $set: {
        source: 'AI_MODEL',
        businessName: business.name,
        riskLevel: normalized.riskLevel,
        fraudProbability: normalized.fraudProbability,
        severity: normalized.severity,
        title: 'ML-based Fraud Risk Prediction',
        description: `Isolation Forest model scored ${business.gstin} at ${(normalized.fraudProbability * 100).toFixed(2)}% fraud probability.`,
        explanation,
        evidenceData: {
          modelType: 'IsolationForest',
          predictionClass: normalized.predictionClass,
          rawAnomalyScore: normalized.rawAnomalyScore,
        },
        features,
        detectedAt: new Date(),
      },
      $setOnInsert: {
        type: 'AI_PREDICTION',
        status: 'NEW',
      },
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  return anomaly;
}

// GET /api/anomalies - Get all anomalies with optional filtering
exports.getAnomalies = async (req, res) => {
  try {
    await autoAssignUnassignedAnomalies();

    const {
      type,
      riskLevel,
      status,
      minProbability,
      limit = 100,
      skip = 0,
    } = req.query;

    const query = {};
    
    if (type) query.type = type;
    if (riskLevel) query.riskLevel = riskLevel;
    if (status) query.status = status;
    if (minProbability) query.fraudProbability = { $gte: parseFloat(minProbability) };

    const anomalies = await Anomaly.find(query)
      .sort({ detectedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await Anomaly.countDocuments(query);

    return res.json({
      success: true,
      data: anomalies.map(withAnomalySource),
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET /api/anomalies/stats - Get anomaly statistics
exports.getStats = async (req, res) => {
  try {
    const total = await Anomaly.countDocuments();
    
    const byRiskLevel = await Anomaly.aggregate([
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    ]);
    
    const byType = await Anomaly.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);
    
    const byStatus = await Anomaly.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Get anomalies from last 7 days
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    const recent = await Anomaly.countDocuments({
      detectedAt: { $gte: last7Days },
    });

    // Get high risk count
    const highRisk = await Anomaly.countDocuments({
      riskLevel: { $in: ['HIGH', 'CRITICAL'] },
    });

    // Get AI detected count
    const aiDetected = await Anomaly.countDocuments({
      $or: [
        { source: 'AI_MODEL' },
        { source: { $exists: false }, type: 'AI_PREDICTION' },
      ],
    });

    return res.json({
      success: true,
      data: {
        total,
        highRisk,
        aiDetected,
        recent,
        byRiskLevel: byRiskLevel.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byStatus: byStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET /api/anomalies/:id - Get single anomaly
exports.getAnomaly = async (req, res) => {
  try {
    const anomaly = await Anomaly.findById(req.params.id).lean();
    
    if (!anomaly) {
      return res.status(404).json({
        success: false,
        message: 'Anomaly not found',
      });
    }

    return res.json({
      success: true,
      data: withAnomalySource(anomaly),
    });
  } catch (error) {
    console.error('Error fetching anomaly:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// PATCH /api/anomalies/:id - Update anomaly
exports.updateAnomaly = async (req, res) => {
  try {
    const { status, assignedTo, notes } = req.body;
    
    const update = {};
    if (status) {
      update.status = status;
      if (status === 'CONFIRMED' || status === 'DISMISSED') {
        update.resolvedAt = new Date();
      }
    }
    if (assignedTo !== undefined) update.assignedTo = assignedTo;
    if (notes) {
      update.$push = { notes };
    }

    const anomaly = await Anomaly.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).lean();

    if (!anomaly) {
      return res.status(404).json({
        success: false,
        message: 'Anomaly not found',
      });
    }

    return res.json({
      success: true,
      data: withAnomalySource(anomaly),
    });
  } catch (error) {
    console.error('Error updating anomaly:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// POST /api/anomalies/detect/:gstin - Detect anomalies for a specific business
exports.detectForBusiness = async (req, res) => {
  try {
    const { gstin } = req.params;

    const featurePack = await buildFeaturesForBusiness(gstin);
    if (!featurePack?.business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found',
      });
    }

    const prediction = await predictFraud(featurePack.features);
    const anomaly = await createOrUpdateAiAnomaly({
      business: featurePack.business,
      features: featurePack.features,
      prediction,
    });

    const assignmentResult = await autoAssignUnassignedAnomalies();

    return res.json({
      success: true,
      gstin,
      prediction,
      anomaly: withAnomalySource(anomaly),
      assignments: assignmentResult,
    });
  } catch (error) {
    console.error('Error detecting anomaly:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// POST /api/anomalies/detect/batch - Batch detect anomalies
exports.batchDetect = async (req, res) => {
  try {
    const { gstins } = req.body;
    
    // If no GSTINs provided, detect for all businesses
    let targetGstins = gstins;
    if (!targetGstins || targetGstins.length === 0) {
      const businesses = await Business.find({}).limit(50);
      targetGstins = businesses.map(b => b.gstin);
    }

    const results = [];
    let processed = 0;

    for (const gstin of targetGstins) {
      try {
        const featurePack = await buildFeaturesForBusiness(gstin);
        if (!featurePack?.business) {
          results.push({ gstin, success: false, message: 'Business not found' });
          continue;
        }

        const prediction = await predictFraud(featurePack.features);
        const anomaly = await createOrUpdateAiAnomaly({
          business: featurePack.business,
          features: featurePack.features,
          prediction,
        });

        processed += 1;
        results.push({
          gstin,
          success: true,
          riskLevel: prediction.risk_level || null,
          fraudProbability: prediction.fraud_probability ?? null,
          anomalyId: anomaly?._id,
        });
      } catch (itemError) {
        results.push({ gstin, success: false, message: itemError.message });
      }
    }

    const assignmentResult = await autoAssignUnassignedAnomalies();

    return res.json({
      success: true,
      message: 'Batch detection completed',
      count: targetGstins.length,
      processed,
      results,
      assignments: assignmentResult,
    });
  } catch (error) {
    console.error('Error in batch detection:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// POST /api/anomalies/detect-bursts - Detect invoice burst anomalies
exports.detectBursts = async (req, res) => {
  try {
    const threshold = Math.max(Number(req.body?.threshold || 5), 1);
    const fallbackYear = Number(req.body?.year || new Date().getUTCFullYear());
    const targetGstins = Array.isArray(req.body?.gstins) && req.body.gstins.length > 0
      ? req.body.gstins
      : null;

    const businessQuery = targetGstins ? { gstin: { $in: targetGstins } } : {};
    const businesses = await Business.find(businessQuery).select('gstin name').lean();

    let createdCount = 0;
    let scannedBusinesses = 0;

    for (const business of businesses) {
      const invoices = await Invoice.find({ seller_gstin: business.gstin })
        .select('invoice_date month invoice_id')
        .lean();

      const dayCounts = new Map();
      invoices.forEach((inv) => {
        const dateKey = dateKeyFromInvoice(inv, fallbackYear);
        if (!dateKey) return;
        dayCounts.set(dateKey, (dayCounts.get(dateKey) || 0) + 1);
      });

      const sortedDays = [...dayCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const totalInvoices = sortedDays.reduce((sum, [, c]) => sum + c, 0);
      const activeDays = sortedDays.length;
      const averageDaily = activeDays > 0 ? totalInvoices / activeDays : 0;

      if (activeDays === 0 || averageDaily === 0) continue;
      scannedBusinesses += 1;

      for (const [date, dailyCount] of sortedDays) {
        const burstScore = dailyCount / averageDaily;
        if (burstScore < threshold) continue;

        const { start, end } = toDayRange(date);
        const existing = await Anomaly.findOne({
          businessGstin: business.gstin,
          title: 'Fraud Burst Activity',
          detectedAt: { $gte: start, $lt: end },
        }).select('_id');

        if (existing) continue;

        const riskLevel = burstScore >= 10 ? 'CRITICAL' : 'HIGH';
        const probability = Math.min(0.99, Math.max(0.6, burstScore / 10));
        const severity = Math.min(100, Math.round(55 + burstScore * 6));

        await Anomaly.create({
          type: 'RULE_BASED',
          source: 'RULE_ENGINE',
          businessGstin: business.gstin,
          businessName: business.name,
          riskLevel,
          fraudProbability: probability,
          severity,
          title: 'Fraud Burst Activity',
          description: `Invoice burst detected on ${date}: ${dailyCount} invoices vs daily average ${averageDaily.toFixed(2)} (${burstScore.toFixed(2)}x).`,
          explanation: [
            'Daily invoice filing count significantly exceeded baseline behavior.',
            'Potential fake invoice generation, invoice splitting, or ITC manipulation pattern.',
          ],
          evidenceData: {
            burstCategory: 'INVOICE_ACTIVITY',
            burstDate: date,
            dailyInvoices: dailyCount,
            averageDaily: Number(averageDaily.toFixed(2)),
            burstScore: Number(burstScore.toFixed(2)),
            threshold,
          },
          status: 'NEW',
          detectedAt: start,
        });

        createdCount += 1;
      }
    }

    const assignmentResult = await autoAssignUnassignedAnomalies();

    return res.json({
      success: true,
      data: {
        threshold,
        scannedBusinesses,
        createdAnomalies: createdCount,
        assignments: assignmentResult,
      },
    });
  } catch (error) {
    console.error('Error detecting burst anomalies:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/anomalies/auto-assign - Force auto-assignment of unassigned anomalies
exports.autoAssignAnomalies = async (req, res) => {
  try {
    const result = await autoAssignUnassignedAnomalies();
    return res.json({
      success: true,
      message: 'Anomaly assignment completed',
      data: result,
      investigators: OFFICER_POOL,
    });
  } catch (error) {
    console.error('Error auto-assigning anomalies:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET /api/anomalies/features/:gstin - Get features for a business (debugging)
exports.getFeatures = async (req, res) => {
  try {
    const { gstin } = req.params;

    const featurePack = await buildFeaturesForBusiness(gstin);
    if (!featurePack?.business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found',
      });
    }

    return res.json({
      success: true,
      data: featurePack.features,
    });
  } catch (error) {
    console.error('Error fetching features:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
