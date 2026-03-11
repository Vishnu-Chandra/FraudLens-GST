const Business = require('../models/Business');
const Invoice = require('../models/Invoice');
const TaxReturn = require('../models/TaxReturn');
const GSTR1 = require('../models/GSTR1');
const GSTR3B = require('../models/GSTR3B');
const EWayBill = require('../models/EWayBill');
const reconcileInvoices = require('../services/reconciliationEngine');
const { getDriver } = require('../config/neo4j');

/**
 * Core: compute risk score for a single GSTIN from invoice reconciliation data.
 * Returns { score, category, factors }.
 */
async function computeRiskForGstin(gstin) {
    const invoices = await Invoice.find({ seller_gstin: gstin });
    if (invoices.length === 0) {
        return { score: 0, category: 'low', factors: { totalInvoices: 0, flaggedInvoices: 0, issues: [] } };
    }

    // Check once: do these compliance collections have ANY data?
    const [gstr1Count, gstr3bCount, ewayCount] = await Promise.all([
        GSTR1.estimatedDocumentCount(),
        GSTR3B.estimatedDocumentCount(),
        EWayBill.estimatedDocumentCount(),
    ]);

    const checkGstr1 = gstr1Count > 0;
    const checkGstr3b = gstr3bCount > 0;
    const checkEway = ewayCount > 0;

    // If no compliance data exists at all, base score on invoice volume
    if (!checkGstr1 && !checkGstr3b && !checkEway) {
        const baseScore = Math.min(Math.round((invoices.length / 10) * 5), 20);
        const category = baseScore > 8 ? 'medium' : 'low';
        return {
            score: baseScore,
            category,
            factors: { totalInvoices: invoices.length, flaggedInvoices: 0, issues: ['No compliance data uploaded yet'] },
        };
    }

    let totalRisk = 0;
    let flaggedCount = 0;
    const allIssues = [];

    // ── GSTR-3B: compare TOTAL tax paid vs TOTAL GST collected (no period field) ──
    let gstr3bUnderpaid = false;
    if (checkGstr3b) {
        const gstr3bRecord = await GSTR3B.findOne({ gstin });
        const totalGstDue = invoices.reduce((s, inv) => s + (inv.gst_amount || 0), 0);
        if (!gstr3bRecord) {
            gstr3bUnderpaid = true;
        } else if (gstr3bRecord.tax_paid < totalGstDue * 0.8) {
            // Only flag if tax paid is less than 80% of collected (allows normal ITC deductions)
            gstr3bUnderpaid = true;
        }
    }

    for (const inv of invoices) {
        let invRisk = 0;
        const issues = [];

        // GSTR-1 check (+30 if invoice not reported)
        if (checkGstr1) {
            const gstr1 = await GSTR1.findOne({ invoice_id: inv.invoice_id });
            if (!gstr1) { invRisk += 30; issues.push('Missing in GSTR-1'); }
        }

        // e-Way bill check (+20 for invoices > 50k)
        if (checkEway && inv.amount > 50000) {
            const eway = await EWayBill.findOne({ invoice_id: inv.invoice_id });
            if (!eway) { invRisk += 20; issues.push('Missing e-Way bill'); }
        }

        if (invRisk > 0) { flaggedCount++; allIssues.push(...issues); }
        totalRisk += invRisk;
    }

    // Normalize: average per-invoice risk
    let avgRisk = Math.round(totalRisk / invoices.length);

    // Apply business-level penalties
    if (gstr3bUnderpaid) {
        avgRisk += 40;
        allIssues.push('Tax underpaid in GSTR-3B');
    }

    avgRisk = Math.min(avgRisk, 100);
    const category = avgRisk > 75 ? 'critical' : avgRisk > 50 ? 'high' : avgRisk > 20 ? 'medium' : 'low';

    return {
        score: avgRisk,
        category,
        factors: {
            totalInvoices: invoices.length,
            flaggedInvoices: flaggedCount,
            issues: [...new Set(allIssues)],
        },
    };
}


/**
 * GET /api/analysis/risk/:gstin
 */
const getRiskScore = async (req, res) => {
    try {
        const { gstin } = req.params;
        const business = await Business.findOne({ gstin });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const { score, category, factors } = await computeRiskForGstin(gstin);

        // Persist updated score
        business.riskScore = score;
        business.riskCategory = category;
        await business.save();

        return res.json({ success: true, gstin, score, category, factors });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/analysis/reconciliation/:gstin
 */
const getReconciliationReport = async (req, res) => {
    try {
        const { gstin } = req.params;
        const report = await reconcileInvoices(gstin);
        return res.json({ success: true, gstin, report });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/analysis/network/:gstin
 * Returns supplier/buyer relationship graph data from Neo4j
 */
const getNetworkGraph = async (req, res) => {
    const driver = getDriver();
    const { gstin } = req.params;
    
    // Try Neo4j first, fall back to MongoDB if unavailable
    if (driver) {
        const session = driver.session();
        try {
            const result = await session.run(
                `MATCH (b:Business {gstin: $gstin})-[r]-(connected:Business)
           RETURN b, r, connected LIMIT 200`,
                { gstin }
            );

            const nodes = [];
            const edges = [];

            result.records.forEach((record) => {
                const source = record.get('b').properties;
                const target = record.get('connected').properties;
                const rel = record.get('r');

                nodes.push(source);
                nodes.push(target);
                edges.push({
                    from: source.gstin,
                    to: target.gstin,
                    type: rel.type || rel.typeName,
                    amount: Number(rel.properties?.amount || 0),
                });
            });

            await session.close();
            return res.json({ success: true, nodes: [...new Map(nodes.map((n) => [n.gstin, n])).values()], edges });
        } catch (error) {
            await session.close();
            console.log('Neo4j query failed, falling back to MongoDB:', error.message);
        }
    }
    
    // Fallback: Use MongoDB Invoice data
    try {
        // Get invoices related to this GSTIN
        const invoices = await Invoice.find({
            $or: [{ seller_gstin: gstin }, { buyer_gstin: gstin }]
        }).limit(200);
        
        // Build nodes and edges from invoices
        const businessMap = new Map();
        const edges = [];
        
        for (const invoice of invoices) {
            // Add seller
            if (!businessMap.has(invoice.seller_gstin)) {
                const sellerBusiness = await Business.findOne({ gstin: invoice.seller_gstin });
                businessMap.set(invoice.seller_gstin, {
                    gstin: invoice.seller_gstin,
                    name: sellerBusiness?.name || invoice.seller_name || invoice.seller_gstin,
                    riskCategory: sellerBusiness?.riskCategory || 'medium',
                    riskScore: sellerBusiness?.riskScore || 0
                });
            }
            
            // Add buyer
            if (!businessMap.has(invoice.buyer_gstin)) {
                const buyerBusiness = await Business.findOne({ gstin: invoice.buyer_gstin });
                businessMap.set(invoice.buyer_gstin, {
                    gstin: invoice.buyer_gstin,
                    name: buyerBusiness?.name || invoice.buyer_name || invoice.buyer_gstin,
                    riskCategory: buyerBusiness?.riskCategory || 'medium',
                    riskScore: buyerBusiness?.riskScore || 0
                });
            }
            
            // Add edge
            edges.push({
                from: invoice.seller_gstin,
                to: invoice.buyer_gstin,
                amount: invoice.amount || 0,
                invoice_id: invoice.invoice_id,
                status: invoice.status
            });
        }
        
        const nodes = Array.from(businessMap.values());
        return res.json({ success: true, nodes, edges });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/analysis/anomalies
 */
const getAnomalies = async (req, res) => {
    try {
        const flaggedInvoices = await Invoice.find({ isSuspicious: true }).limit(100);
        const flaggedReturns = await TaxReturn.find({ 'anomalyFlags.0': { $exists: true } }).limit(100);

        return res.json({
            success: true,
            anomalies: {
                invoices: flaggedInvoices,
                taxReturns: flaggedReturns,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/analysis/top-risk
 * Returns top 10 businesses sorted by riskScore descending
 */
const getTopRisk = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 15;

        // If no risks are computed yet, compute them all now on-the-fly
        const computedCount = await Business.countDocuments({ riskScore: { $gt: 0 } });
        if (computedCount === 0) {
            const allBiz = await Business.find({}, 'gstin');
            for (const biz of allBiz) {
                const { score, category } = await computeRiskForGstin(biz.gstin);
                await Business.findOneAndUpdate({ gstin: biz.gstin }, { riskScore: score, riskCategory: category });
            }
        }

        const topRisk = await Business.find({})
            .sort({ riskScore: -1 })
            .limit(limit)
            .select('gstin name business_name riskScore riskCategory -_id');

        // Normalise: support both `name` and `business_name` field variants
        const data = topRisk.map(b => ({
            gstin: b.gstin,
            name: b.name || b.business_name || b.gstin,
            riskScore: b.riskScore,
            riskCategory: b.riskCategory,
        }));

        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /api/analysis/compute-all-risks
 * Recomputes riskScore + riskCategory for every Business in MongoDB.
 */
const computeAllRisks = async (req, res) => {
    try {
        const businesses = await Business.find({}, 'gstin');
        const results = [];

        for (const biz of businesses) {
            const { score, category } = await computeRiskForGstin(biz.gstin);
            await Business.findOneAndUpdate(
                { gstin: biz.gstin },
                { riskScore: score, riskCategory: category }
            );
            results.push({ gstin: biz.gstin, score, category });
        }

        return res.json({ success: true, updated: results.length, results });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/analysis/network-all
 * Returns all invoices and businesses for full supply chain visualization
 */
const getAllNetworkData = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 250;
        
        // Get all invoices
        const invoices = await Invoice.find({}).limit(limit).sort({ invoice_date: -1 });
        
        // Build unique list of GSTINs from invoices
        const gstinSet = new Set();
        invoices.forEach(inv => {
            if (inv.seller_gstin) gstinSet.add(inv.seller_gstin);
            if (inv.buyer_gstin) gstinSet.add(inv.buyer_gstin);
        });
        
        // Fetch business details for all GSTINs
        const allBusinesses = await Business.find({
            gstin: { $in: Array.from(gstinSet) }
        });
        
        // Create business map
        const businessMap = new Map(
            allBusinesses.map(b => [b.gstin, {
                gstin: b.gstin,
                name: b.name || b.business_name || b.gstin,
                riskCategory: b.riskCategory || 'medium',
                riskScore: b.riskScore || 0
            }])
        );
        
        // Add missing businesses (those not in Business collection)
        gstinSet.forEach(gstin => {
            if (!businessMap.has(gstin)) {
                const inv = invoices.find(i => i.seller_gstin === gstin || i.buyer_gstin === gstin);
                businessMap.set(gstin, {
                    gstin,
                    name: (inv?.seller_gstin === gstin ? inv.seller_name : inv?.buyer_name) || gstin,
                    riskCategory: 'medium',
                    riskScore: 0
                });
            }
        });
        
        // Build edges from invoices
        const edges = invoices.map(inv => ({
            from: inv.seller_gstin,
            to: inv.buyer_gstin,
            amount: inv.amount || 0,
            invoice_id: inv.invoice_id,
            status: inv.status || 'matched',
            circular_trade_flag: inv.circular_trade_flag || false
        }));
        
        const nodes = Array.from(businessMap.values());
        
        return res.json({ 
            success: true, 
            nodes, 
            edges,
            stats: {
                totalInvoices: invoices.length,
                totalBusinesses: nodes.length,
                circularTrades: edges.filter(e => e.circular_trade_flag).length
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getRiskScore, getReconciliationReport, getNetworkGraph, getAllNetworkData, getAnomalies, getTopRisk, computeAllRisks };
