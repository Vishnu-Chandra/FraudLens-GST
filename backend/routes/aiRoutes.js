const express = require("express");
const router = express.Router();

const predictFraud = require("../services/aiFraudService");

router.post("/predict", async (req, res) => {
  try {
    const result = await predictFraud(req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: "ML service unavailable",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;