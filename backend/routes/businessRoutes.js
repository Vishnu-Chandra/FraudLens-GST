const express = require("express");
const router = express.Router();

const {
  createBusiness,
  getBusiness,
  getBusinessTransactions
} = require("../controllers/businessController");

router.post("/", createBusiness);

router.get("/:gstin", getBusiness);

router.get("/:gstin/transactions", getBusinessTransactions);

module.exports = router;