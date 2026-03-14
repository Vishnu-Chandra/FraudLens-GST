require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const connectDB = require("./config/mongodb");
const uploadRoutes = require("./routes/uploadRoutes");
const analysisRoutes = require("./routes/analysisRoutes");
const graphRoutes = require("./routes/graphRoutes");
const aiRoutes = require("./routes/aiRoutes");
const businessRoutes = require("./routes/businessRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const anomalyRoutes = require("./routes/anomalyRoutes");
const caseRoutes = require("./routes/caseRoutes");
const analyticsRoutes = require('./routes/analyticsRoutes');
const { ensureDefaultOfficers } = require('./services/officerService');
const { ensureInitialAnomalies } = require('./services/anomalySeedService');
const { ensureInitialCases } = require('./services/caseSeedService');

app.use(cors());
app.use(express.json());
connectDB();

async function bootstrapInitialData() {
  try {
    await ensureDefaultOfficers();

    const anomalyResult = await ensureInitialAnomalies();
    if (!anomalyResult?.skipped) {
      console.log(`Initialized ${anomalyResult.created} anomalies from business data`);
    }

    const caseResult = await ensureInitialCases();
    if (!caseResult?.skipped) {
      console.log(`Initialized ${caseResult.created} investigation cases from anomalies`);
    }
  } catch (error) {
    console.error('Failed to bootstrap initial data:', error.message);
  }
}

bootstrapInitialData();

app.use("/api/upload", uploadRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/graph", graphRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/anomalies", anomalyRoutes);
app.use("/api/cases", caseRoutes);
app.use('/api/analytics', analyticsRoutes);
const callRoutes = require('./routes/callRoutes');
app.use('/api/calls', callRoutes);
const chatRoutes = require('./routes/chatRoutes');
app.use('/api/chat', chatRoutes);
app.get("/", (req, res) => {
  res.send("GST Risk Intelligence API Running");
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});