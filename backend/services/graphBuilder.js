const { getDriver } = require("../config/neo4j");
const Invoice = require("../models/Invoice");
const Business = require("../models/Business");

async function buildSupplyChainGraph() {
  const driver = getDriver();
  if (!driver) {
    return { error: "Neo4j is disabled. Set NEO4J_ENABLED=true and start Neo4j.", detail: "Graph features unavailable" };
  }
  const invoices = await Invoice.find();
  const session = driver.session();

  try {
    for (let invoice of invoices) {
      const seller = invoice.seller_gstin;
      const buyer = invoice.buyer_gstin;
      const invoiceId = invoice.invoice_id;
      const amount = invoice.amount || 0;

      // Look up trader names from Business collection
      const sellerBusiness = await Business.findOne({ gstin: seller });
      const buyerBusiness = await Business.findOne({ gstin: buyer });

      const sellerName = sellerBusiness?.name || seller; // fallback to GSTIN if no name
      const buyerName = buyerBusiness?.name || buyer;

      await session.run(
        `
        MERGE (s:Business {gstin: $seller})
        ON CREATE SET s.name = $sellerName
        ON MATCH SET  s.name = $sellerName

        MERGE (b:Business {gstin: $buyer})
        ON CREATE SET b.name = $buyerName
        ON MATCH SET  b.name = $buyerName

        MERGE (s)-[r:SOLD_TO {invoice: $invoiceId}]->(b)
        ON CREATE SET r.amount = $amount
        `,
        { seller, sellerName, buyer, buyerName, invoiceId, amount }
      );
    }

    return {
      message: "Supply chain graph created successfully",
      invoicesProcessed: invoices.length,
    };

  } catch (error) {
    console.error(error);
    return { error: "Graph creation failed", detail: error.message };

  } finally {
    await session.close();
  }
}

module.exports = buildSupplyChainGraph;