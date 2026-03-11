const Anomaly = require('../models/Anomaly');
const Business = require('../models/Business');

// GET /api/anomalies - Get all anomalies with optional filtering
exports.getAnomalies = async (req, res) => {
  try {
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
      .skip(parseInt(skip));

    const total = await Anomaly.countDocuments(query);

    return res.json({
      success: true,
      data: anomalies,
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
      type: 'AI_PREDICTION',
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
    const anomaly = await Anomaly.findById(req.params.id);
    
    if (!anomaly) {
      return res.status(404).json({
        success: false,
        message: 'Anomaly not found',
      });
    }

    return res.json({
      success: true,
      data: anomaly,
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
    );

    if (!anomaly) {
      return res.status(404).json({
        success: false,
        message: 'Anomaly not found',
      });
    }

    return res.json({
      success: true,
      data: anomaly,
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

    // This would normally call the ML service for each business
    // For now, return a placeholder
    return res.json({
      success: true,
      message: 'Batch detection would process these businesses',
      count: targetGstins.length,
      gstins: targetGstins,
    });
  } catch (error) {
    console.error('Error in batch detection:', error);
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

    // Return business features used for anomaly detection
    const features = {
      gstin: business.gstin,
      name: business.name,
      invoiceCount: business.invoiceCount || 0,
      totalTaxableValue: business.totalTaxableValue || 0,
      itcRatio: business.itcRatio || 0,
      riskScore: business.riskScore || 0,
      riskCategory: business.riskCategory || 'low',
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
