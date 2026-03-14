const axios = require("axios");

const ML_API_URL = process.env.ML_API_URL || "http://localhost:6001";

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Predict fraud probability using ML model
 * @param {Object} allFeatures - All extracted features (financial + graph)
 * @returns {Object} Prediction result with fraud_probability
 */
async function predictFraud(allFeatures) {
  try {
    const source = allFeatures?.features && typeof allFeatures.features === 'object'
      ? allFeatures.features
      : (allFeatures || {});

    // ML model expects EXACTLY these 11 features in camelCase
    const modelFeatures = {
      // Financial features (6)
      invoiceCount: toNumber(source.invoiceCount, 0),
      totalTaxableValue: toNumber(source.totalTaxableValue, 0),
      itcRatio: toNumber(source.itcRatio, 0),
      lateFilingsCount: toNumber(source.lateFilingsCount, 0),
      missingEwayRatio: toNumber(source.missingEwayRatio, 0),
      gstPaidVsCollectedRatio: toNumber(source.gstPaidVsCollectedRatio, 1),
      
      // Graph features (5) - exclude clusterSize and betweennessCentrality
      degreeCentrality: toNumber(source.degreeCentrality, 0),
      outDegree: toNumber(source.outDegree, 0),
      inDegree: toNumber(source.inDegree, 0),
      cycleParticipation: toNumber(source.cycleParticipation, 0),
      avgNeighborRisk: toNumber(source.avgNeighborRisk, 0),
    };

    const response = await axios.post(
      `${ML_API_URL}/predict`,
      modelFeatures,
      { timeout: 12000 }
    );

    return response.data;
  } catch (error) {
    console.error('Error calling ML model:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = predictFraud;