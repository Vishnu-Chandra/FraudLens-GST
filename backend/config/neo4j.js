const neo4j = require("neo4j-driver");

const NEO4J_ENABLED = process.env.NEO4J_ENABLED !== "false";
let rawUri = process.env.NEO4J_URI || "bolt://127.0.0.1:7687";
// Use bolt:// for single-instance Neo4j (avoids "No routing servers available" error)
// neo4j:// triggers cluster routing discovery; bolt:// connects directly
if (rawUri.startsWith("neo4j://")) {
  rawUri = "bolt://" + rawUri.slice("neo4j://".length);
}
const NEO4J_URI = rawUri;
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "your_password";

let driver = null;

if (NEO4J_ENABLED) {
  driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    {
      encrypted: "ENCRYPTION_OFF",
      maxConnectionLifetime: 3 * 60 * 60 * 1000,
      connectionTimeout: 5000,
    }
  );

  driver.verifyConnectivity()
    .then(() => console.log("Neo4j connected successfully"))
    .catch((err) => console.warn(`Neo4j unavailable (graph features disabled): ${err.message}`));
}

/** Returns the Neo4j driver or null if disabled/unavailable */
function getDriver() {
  return driver;
}

module.exports = driver;
module.exports.getDriver = getDriver;