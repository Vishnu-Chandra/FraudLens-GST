const express = require("express");
const router = express.Router();
const buildGraph = require("../services/graphBuilder");

router.get("/build", async (req, res) => {
  try {
    const result = await buildGraph();
    res.json(result);
  } catch (error) {
    console.error("Graph build error:", error.message);
    res.status(503).json({
      error: "Neo4j is unavailable. Please start Neo4j and try again.",
      detail: error.message,
    });
  }
});

module.exports = router;