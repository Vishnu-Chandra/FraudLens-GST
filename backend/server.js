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

app.use(cors());
app.use(express.json());
connectDB();

app.use("/api/upload", uploadRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/graph", graphRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/anomalies", anomalyRoutes);
app.get("/", (req, res) => {
  res.send("GST Risk Intelligence API Running");
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});