const express = require('express');
const router = express.Router();
const { getStateRisk, getInvoiceActivity, getItcOverview } = require('../controllers/analyticsController');

// GET /api/analytics/state-risk
router.get('/state-risk', getStateRisk);

// GET /api/analytics/invoice-activity/:gstin
router.get('/invoice-activity/:gstin', getInvoiceActivity);

// GET /api/analytics/itc-overview
router.get('/itc-overview', getItcOverview);

module.exports = router;
