const express = require('express');
const router = express.Router();
const {
    getRiskSummary,
    getStateDistribution,
    getInvoiceMatch,
    getItcStatus,
    getActivity,
    getTopRisk,
    getAlerts,
} = require('../controllers/dashboardController');

router.get('/risk-summary', getRiskSummary);
router.get('/state-distribution', getStateDistribution);
router.get('/invoice-match', getInvoiceMatch);
router.get('/itc-status', getItcStatus);
router.get('/activity', getActivity);
router.get('/top-risk', getTopRisk);
router.get('/alerts', getAlerts);

module.exports = router;
