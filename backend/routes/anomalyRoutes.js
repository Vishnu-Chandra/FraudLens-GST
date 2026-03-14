const express = require('express');
const router = express.Router();
const {
  getAnomalies,
  getStats,
  getAnomaly,
  updateAnomaly,
  detectForBusiness,
  batchDetect,
  detectBursts,
  getFeatures,
  autoAssignAnomalies,
} = require('../controllers/anomalyController');

// GET /api/anomalies - Get all anomalies with optional filtering
router.get('/', getAnomalies);

// GET /api/anomalies/stats - Get anomaly statistics
router.get('/stats', getStats);

// GET /api/anomalies/features/:gstin - Get features for debugging
router.get('/features/:gstin', getFeatures);

// POST /api/anomalies/auto-assign - Trigger risk-based investigator assignment
router.post('/auto-assign', autoAssignAnomalies);

// GET /api/anomalies/:id - Get single anomaly
router.get('/:id', getAnomaly);

// PATCH /api/anomalies/:id - Update anomaly status
router.patch('/:id', updateAnomaly);

// POST /api/anomalies/detect/:gstin - Detect anomalies for specific business
router.post('/detect/:gstin', detectForBusiness);

// POST /api/anomalies/detect/batch - Batch detect anomalies
router.post('/detect/batch', batchDetect);

// POST /api/anomalies/detect-bursts - Detect invoice burst anomalies
router.post('/detect-bursts', detectBursts);

module.exports = router;
