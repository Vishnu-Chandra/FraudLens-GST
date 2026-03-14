const Anomaly = require('../models/Anomaly');
const Business = require('../models/Business');
const Invoice = require('../models/Invoice');
const GSTR3B = require('../models/GSTR3B');
const EWayBill = require('../models/EWayBill');
const { autoAssignUnassignedAnomalies, OFFICER_POOL } = require('../services/investigatorAssignmentService');

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
    
    const business = await Business.findOne({ gstin });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found',
      });
    }

    // This would normally call the ML service
    // For now, return a placeholder
    return res.json({
      success: true,
      message: 'Detection not yet implemented. Use batch detection instead.',
      gstin,
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

    // This would normally call the ML service for each business.
    // For now, we still auto-assign any newly detected/unassigned anomalies.
    const assignmentResult = await autoAssignUnassignedAnomalies();

    return res.json({
      success: true,
      message: 'Batch detection would process these businesses',
      count: targetGstins.length,
      gstins: targetGstins,
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
    
    const business = await Business.findOne({ gstin });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found',
      });
    }

    const invoiceQuery = {
      $or: [{ seller_gstin: gstin }, { buyer_gstin: gstin }],
    };

    const [invoiceCount, taxableAgg, invoices] = await Promise.all([
      Invoice.countDocuments(invoiceQuery),
      Invoice.aggregate([
        { $match: invoiceQuery },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Invoice.find(invoiceQuery).select('invoice_id seller_gstin gst_amount').lean(),
    ]);

    const invoiceIds = invoices
      .map((inv) => inv.invoice_id)
      .filter((id) => typeof id === 'string' && id.trim() !== '');

    const uniqueInvoiceIds = [...new Set(invoiceIds)];

    const ewayCount = uniqueInvoiceIds.length
      ? await EWayBill.countDocuments({ invoice_id: { $in: uniqueInvoiceIds } })
      : 0;

    const missingEwayRatio = uniqueInvoiceIds.length > 0
      ? (uniqueInvoiceIds.length - ewayCount) / uniqueInvoiceIds.length
      : 0;

    const gstCollected = invoices.reduce((sum, inv) => {
      if (inv.seller_gstin === gstin) {
        return sum + Number(inv.gst_amount || 0);
      }
      return sum;
    }, 0);

    const taxPaidAgg = await GSTR3B.aggregate([
      { $match: { gstin } },
      { $group: { _id: null, totalTaxPaid: { $sum: '$tax_paid' } } },
    ]);

    const totalTaxPaid = Number(taxPaidAgg[0]?.totalTaxPaid || 0);
    const gstPaidVsCollectedRatio = gstCollected > 0 ? totalTaxPaid / gstCollected : 0;

    const features = {
      invoiceCount,
      totalTaxableValue: Number(taxableAgg[0]?.total || 0),
      itcRatio: Number(business.itcRatio || 0),
      lateFilingsCount: Number(business.lateFilingsCount || 0),
      missingEwayRatio,
      gstPaidVsCollectedRatio,
    };

    return res.json({
      success: true,
      data: features,
    });
  } catch (error) {
    console.error('Error fetching features:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
