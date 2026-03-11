const express = require("express");
const router = express.Router();

const predictFraud = require("../services/aiFraudService");

router.post("/predict", async (req, res) => {

  const result = await predictFraud(req.body);

  res.json(result);

});

module.exports = router;