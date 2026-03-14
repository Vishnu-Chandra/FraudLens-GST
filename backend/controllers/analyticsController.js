const Business = require('../models/Business');
const Anomaly = require('../models/Anomaly');
const Invoice = require('../models/Invoice');
const TaxReturn = require('../models/TaxReturn');

function normalizeStateName(state) {
  return String(state || '').trim();
}

function round(value, digits = 2) {
  const num = Number(value || 0);
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

const MONTH_TO_NUM = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function dateKeyFromInvoice(inv, fallbackYear) {
  if (inv.invoice_date) {
    const d = new Date(inv.invoice_date);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const monthStr = String(inv.month || '').trim().toLowerCase();
  const monthNum = MONTH_TO_NUM[monthStr.slice(0, 3)];
  if (monthNum) {
    return `${fallbackYear}-${String(monthNum).padStart(2, '0')}-01`;
  }

  return null;
}

function computeItcRatio(itcClaimed, gstPaid) {
  const itc = Number(itcClaimed || 0);
  const gst = Number(gstPaid || 0);
  if (gst <= 0) return itc > 0 ? 999 : 0;
  return itc / gst;
}

function classifyItcRisk(ratio) {
  if (ratio < 1.2) return 'LOW';
  if (ratio <= 2) return 'MEDIUM';
  return 'HIGH';
}

function monthLabel(date) {
  return new Date(date).toLocaleString('en-US', { month: 'short' });
}

exports.getStateRisk = async (req, res) => {
  try {
    const businesses = await Business.find({ state: { $exists: true, $ne: '' } })
      .select('gstin state riskScore riskCategory')
      .lean();

    const anomalyByBusiness = await Anomaly.aggregate([
      {
        $group: {
          _id: '$businessGstin',
          total_anomalies: { $sum: 1 },
          avg_fraud_probability: { $avg: '$fraudProbability' },
        },
      },
    ]);

    const anomalyMap = new Map(
      anomalyByBusiness.map((row) => [
        String(row._id || '').trim(),
        {
          total_anomalies: Number(row.total_anomalies || 0),
          avg_fraud_probability: Number(row.avg_fraud_probability || 0),
        },
      ])
    );

    const stateMap = new Map();

    businesses.forEach((business) => {
      const state = normalizeStateName(business.state);
      if (!state) return;

      if (!stateMap.has(state)) {
        stateMap.set(state, {
          state,
          total_businesses: 0,
          high_risk_businesses: 0,
          total_anomalies: 0,
          sum_risk_score: 0,
          sum_fraud_probability: 0,
        });
      }

      const metrics = stateMap.get(state);
      const riskScore = Number(business.riskScore || 0);
      const riskCategory = String(business.riskCategory || '').toLowerCase();
      const anomalyStats = anomalyMap.get(String(business.gstin || '').trim()) || {
        total_anomalies: 0,
        avg_fraud_probability: 0,
      };

      metrics.total_businesses += 1;
      const isHighRisk = riskCategory === 'high' || riskCategory === 'critical';
      if (isHighRisk) metrics.high_risk_businesses += 1;
      metrics.total_anomalies += anomalyStats.total_anomalies;
      metrics.sum_risk_score += riskScore;
      metrics.sum_fraud_probability += anomalyStats.avg_fraud_probability;
    });

    const rows = [...stateMap.values()]
      .map((item) => ({
        state: item.state,
        total_businesses: item.total_businesses,
        high_risk_businesses: item.high_risk_businesses,
        total_anomalies: item.total_anomalies,
        avg_risk_score: round(item.sum_risk_score / Math.max(item.total_businesses, 1), 2),
        avg_fraud_probability: round(item.sum_fraud_probability / Math.max(item.total_businesses, 1), 4),
      }))
      .sort((a, b) => b.avg_risk_score - a.avg_risk_score || b.total_anomalies - a.total_anomalies);

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error computing state-wise risk analytics:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getInvoiceActivity = async (req, res) => {
  try {
    const { gstin } = req.params;
    const threshold = Math.max(Number(req.query.threshold || 5), 1);
    const fallbackYear = Number(req.query.year || new Date().getUTCFullYear());

    const business = await Business.findOne({ gstin }).select('gstin name').lean();
    if (!business) {
      return res.status(404).json({ success: false, message: 'Business not found' });
    }

    const invoices = await Invoice.find({ seller_gstin: gstin })
      .select('invoice_date month invoice_id')
      .lean();

    const dayCounts = new Map();
    invoices.forEach((inv) => {
      const key = dateKeyFromInvoice(inv, fallbackYear);
      if (!key) return;
      dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    });

    const sortedDays = [...dayCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const totalInvoices = sortedDays.reduce((sum, [, count]) => sum + count, 0);
    const activeDays = sortedDays.length;
    const averageDaily = activeDays > 0 ? totalInvoices / activeDays : 0;

    const burstAnomalies = await Anomaly.find({
      businessGstin: gstin,
      title: 'Fraud Burst Activity',
    })
      .select('_id status detectedAt evidenceData')
      .lean();

    const anomalyByDate = new Map();
    burstAnomalies.forEach((a) => {
      const burstDate = String(a.evidenceData?.burstDate || '').slice(0, 10)
        || (a.detectedAt ? new Date(a.detectedAt).toISOString().slice(0, 10) : '');
      if (!burstDate) return;
      anomalyByDate.set(burstDate, { id: a._id, status: a.status });
    });

    const rows = sortedDays.map(([date, invoice_count]) => {
      const burst_score = averageDaily > 0 ? invoice_count / averageDaily : 0;
      const linkedAnomaly = anomalyByDate.get(date);
      const is_burst = burst_score >= threshold || Boolean(linkedAnomaly);

      return {
        date,
        invoice_count,
        average_daily: round(averageDaily, 2),
        burst_score: round(burst_score, 2),
        is_burst,
        anomaly_id: linkedAnomaly?.id || null,
        anomaly_status: linkedAnomaly?.status || null,
      };
    });

    const burstDays = rows.filter((r) => r.is_burst).length;

    return res.json({
      success: true,
      data: rows,
      summary: {
        business: { gstin: business.gstin, name: business.name },
        total_invoices: totalInvoices,
        active_days: activeDays,
        average_daily: round(averageDaily, 2),
        threshold,
        burst_days: burstDays,
      },
    });
  } catch (error) {
    console.error('Error computing invoice activity analytics:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getItcOverview = async (req, res) => {
  try {
    const taxReturns = await TaxReturn.find({
      filingDate: { $ne: null },
      returnType: { $in: ['GSTR3B', 'GSTR1'] },
    })
      .select('gstin filingDate itcClaimed totalTaxPaid')
      .lean();

    let enriched = [];

    if (taxReturns.length > 0) {
      const gstins = [...new Set(taxReturns.map((r) => String(r.gstin || '').trim()).filter(Boolean))];
      const businesses = await Business.find({ gstin: { $in: gstins } }).select('gstin name').lean();
      const businessNameByGstin = new Map(
        businesses.map((b) => [String(b.gstin || '').trim(), b.name || 'Unknown Business'])
      );

      enriched = taxReturns
        .filter((r) => r.filingDate)
        .map((r) => {
          const gstin = String(r.gstin || '').trim();
          const filingDate = new Date(r.filingDate);
          const itcClaimed = Number(r.itcClaimed || 0);
          const gstPaid = Number(r.totalTaxPaid || 0);
          const itcRatio = computeItcRatio(itcClaimed, gstPaid);
          const riskLevel = classifyItcRisk(itcRatio);

          return {
            business_name: businessNameByGstin.get(gstin) || 'Unknown Business',
            gstin,
            itc_claimed: itcClaimed,
            gst_paid: gstPaid,
            itc_ratio: round(itcRatio, 2),
            risk_level: riskLevel,
            filing_date: filingDate,
          };
        });
    } else {
      const businesses = await Business.find({
        $or: [
          { itcClaimed: { $gt: 0 } },
          { gstPaid: { $gt: 0 } },
        ],
      })
        .select('name gstin itcClaimed gstPaid updatedAt createdAt')
        .lean();

      enriched = businesses.map((b) => {
        const itcClaimed = Number(b.itcClaimed || 0);
        const gstPaid = Number(b.gstPaid || 0);
        const itcRatio = computeItcRatio(itcClaimed, gstPaid);
        const riskLevel = classifyItcRisk(itcRatio);
        const filingDate = b.updatedAt || b.createdAt || new Date();

        return {
          business_name: b.name || 'Unknown Business',
          gstin: String(b.gstin || '').trim(),
          itc_claimed: itcClaimed,
          gst_paid: gstPaid,
          itc_ratio: round(itcRatio, 2),
          risk_level: riskLevel,
          filing_date: new Date(filingDate),
        };
      });
    }

    const totalItcClaimed = enriched.reduce((sum, row) => sum + row.itc_claimed, 0);
    const totalGstPaid = enriched.reduce((sum, row) => sum + row.gst_paid, 0);
    const averageRatio = enriched.length > 0
      ? enriched.reduce((sum, row) => sum + row.itc_ratio, 0) / enriched.length
      : 0;

    const highRiskBusinesses = new Set(
      enriched
        .filter((row) => row.risk_level === 'HIGH')
        .map((row) => row.gstin)
    ).size;

    const trendMap = new Map();
    enriched.forEach((row) => {
      const d = new Date(row.filing_date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!trendMap.has(key)) {
        trendMap.set(key, {
          month: monthLabel(d),
          month_sort: key,
          itc_claimed: 0,
          gst_paid: 0,
        });
      }
      const target = trendMap.get(key);
      target.itc_claimed += row.itc_claimed;
      target.gst_paid += row.gst_paid;
    });

    const trend = [...trendMap.values()]
      .sort((a, b) => a.month_sort.localeCompare(b.month_sort))
      .map((row) => ({
        month: row.month,
        itc_claimed: round(row.itc_claimed, 2),
        gst_paid: round(row.gst_paid, 2),
      }));

    const recentTransactions = enriched
      .sort((a, b) => new Date(b.filing_date) - new Date(a.filing_date))
      .slice(0, 12)
      .map((row) => ({
        business_name: row.business_name,
        gstin: row.gstin,
        itc_claimed: round(row.itc_claimed, 2),
        gst_paid: round(row.gst_paid, 2),
        itc_ratio: row.itc_ratio,
        risk_level: row.risk_level,
        filing_date: new Date(row.filing_date).toISOString().slice(0, 10),
      }));

    return res.json({
      success: true,
      metrics: {
        total_itc_claimed: round(totalItcClaimed, 2),
        total_gst_paid: round(totalGstPaid, 2),
        average_itc_ratio: round(averageRatio, 2),
        high_risk_businesses: highRiskBusinesses,
      },
      trend,
      recent_transactions: recentTransactions,
    });
  } catch (error) {
    console.error('Error computing ITC overview analytics:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
