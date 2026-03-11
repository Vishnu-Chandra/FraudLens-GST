const express = require("express");
const router = express.Router();
const reconcileInvoices = require("../services/reconciliationEngine");
const { getRiskScore, getNetworkGraph, getAllNetworkData, getAnomalies, getReconciliationReport, getTopRisk, computeAllRisks } = require("../controllers/analysisController");

// GET /api/analysis/reconcile
router.get("/reconcile", async (req, res) => {
  try {
    const results = await reconcileInvoices();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analysis/risk/:gstin
router.get("/risk/:gstin", getRiskScore);

// GET /api/analysis/network/:gstin
router.get("/network/:gstin", getNetworkGraph);

// GET /api/analysis/network-all (all invoices for supply chain visualization)
router.get("/network-all", getAllNetworkData);

// GET /api/analysis/anomalies
router.get("/anomalies", getAnomalies);

// GET /api/analysis/reconciliation/:gstin
router.get("/reconciliation/:gstin", getReconciliationReport);

// GET /api/analysis/top-risk
router.get("/top-risk", getTopRisk);

// POST /api/analysis/compute-all-risks — recomputes riskScore for all businesses
router.post("/compute-all-risks", computeAllRisks);

module.exports = router;
