const axios = require("axios");

/**
 * Predict fraud probability using ML model
 * @param {Object} allFeatures - All extracted features (financial + graph)
 * @returns {Object} Prediction result with fraud_probability
 */
async function predictFraud(allFeatures) {
  try {
    // ML model expects EXACTLY these 11 features in camelCase
    const modelFeatures = {
      // Financial features (6)
      invoiceCount: allFeatures.invoiceCount || 0,
      totalTaxableValue: allFeatures.totalTaxableValue || 0,
      itcRatio: allFeatures.itcRatio || 0,
      lateFilingsCount: allFeatures.lateFilingsCount || 0,
      missingEwayRatio: allFeatures.missingEwayRatio || 0,
      gstPaidVsCollectedRatio: allFeatures.gstPaidVsCollectedRatio || 1,
      
      // Graph features (5) - exclude clusterSize and betweennessCentrality
      degreeCentrality: allFeatures.degreeCentrality || 0,
      outDegree: allFeatures.outDegree || 0,
      inDegree: allFeatures.inDegree || 0,
      cycleParticipation: allFeatures.cycleParticipation || 0,
      avgNeighborRisk: allFeatures.avgNeighborRisk || 0,
    };

    const response = await axios.post(
      "http://localhost:6001/predict",
      { features: modelFeatures }
    );

    return response.data;
  } catch (error) {
    console.error('Error calling ML model:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = predictFraud;