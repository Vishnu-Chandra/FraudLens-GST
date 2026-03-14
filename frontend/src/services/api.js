import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Original example data from spec
const mockData = {
  riskSummary: {
    total: 20,
    highRisk: 4,
    mediumRisk: 6,
    lowRisk: 10,
  },
  stateDistribution: [
    { name: 'Karnataka', value: 4 },
    { name: 'Maharashtra', value: 4 },
    { name: 'Delhi', value: 3 },
    { name: 'Tamil Nadu', value: 3 },
    { name: 'Telangana', value: 3 },
    { name: 'Other States', value: 3 },
  ],
  stateRiskHotspots: [
    { state: 'Gujarat', avg_risk_score: 43, high_risk_businesses: 1, total_businesses: 2 },
    { state: 'Delhi', avg_risk_score: 39, high_risk_businesses: 0, total_businesses: 2 },
    { state: 'Punjab', avg_risk_score: 38, high_risk_businesses: 1, total_businesses: 2 },
    { state: 'Karnataka', avg_risk_score: 37.5, high_risk_businesses: 1, total_businesses: 2 },
    { state: 'Uttar Pradesh', avg_risk_score: 31.5, high_risk_businesses: 1, total_businesses: 2 },
    { state: 'Kerala', avg_risk_score: 31, high_risk_businesses: 1, total_businesses: 2 },
  ],
  invoiceMatch: {
    matched: 75,
    missingGstr1: 15,
    missingEwayBill: 20,
    fullyVerified: 0,
  },
  itcStatus: {
    valid: 60,
    suspicious: 30,
    highRisk: 10,
  },
  itcOverview: {
    metrics: {
      total_itc_claimed: 5966220,
      total_gst_paid: 3899800,
      average_itc_ratio: 1.56,
      high_risk_businesses: 4,
    },
  },
  activity: [
    { month: 'Jan', invoices: 20 },
    { month: 'Feb', invoices: 32 },
    { month: 'Mar', invoices: 55 },
    { month: 'Apr', invoices: 25 },
  ],
  topRisk: [
    { gstin: '29ABCDE1234F1Z5', businessName: 'ABC Traders Pvt Ltd', riskScore: 92, riskCategory: 'high', totalInvoices: 450 },
    { gstin: '27FGHIJ5678K2Z6', businessName: 'XYZ Imports & Exports', riskScore: 85, riskCategory: 'high', totalInvoices: 320 },
    { gstin: '33KLMNO9012L3Z7', businessName: 'Delta Supply Chain Co', riskScore: 78, riskCategory: 'medium', totalInvoices: 280 },
    { gstin: '07PQRST3456M4Z8', businessName: 'Sigma Trading Solutions', riskScore: 72, riskCategory: 'medium', totalInvoices: 195 },
    { gstin: '36UVWXY7890N5Z9', businessName: 'Omega Retail Ventures', riskScore: 65, riskCategory: 'medium', totalInvoices: 420 },
  ],
  alerts: [
    { id: 1, type: 'circular', title: 'Circular trading detected', detail: 'Alpha → Beta → Gamma → Delta → Alpha', severity: 'high' },
    { id: 2, type: 'eway', title: 'Missing e-Way Bills', detail: '15 invoices flagged', severity: 'medium' },
    { id: 3, type: 'itc', title: 'Suspicious ITC claims', detail: '3 businesses flagged', severity: 'high' },
  ],
};

function unwrap(payload) {
  // Backend commonly returns { success: true, data: ... }
  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data;
  return payload;
}

function normalizeInvoiceMatch(raw) {
  const data = unwrap(raw);
  if (Array.isArray(data)) {
    const map = new Map(
      data.map((d) => [String(d.name || '').toLowerCase(), Number(d.value || 0)])
    );
    return {
      matched: map.get('matched') ?? map.get('matched invoices') ?? 0,
      missingGstr1: map.get('missing gstr-1') ?? map.get('missing in gstr-1') ?? 0,
      missingEwayBill: map.get('missing e-way bill') ?? 0,
      fullyVerified: map.get('fully verified') ?? 0,
    };
  }
  return data;
}

function normalizeItcStatus(raw) {
  const data = unwrap(raw);
  if (Array.isArray(data)) {
    const map = new Map(
      data.map((d) => [String(d.name || '').toLowerCase(), Number(d.value || 0)])
    );
    return {
      valid: map.get('valid itc') ?? map.get('valid') ?? 0,
      suspicious: map.get('suspicious itc') ?? map.get('suspicious') ?? 0,
      highRisk: map.get('high risk itc') ?? map.get('high risk') ?? 0,
    };
  }
  return data;
}

function normalizeRiskSummary(raw) {
  const data = unwrap(raw) || {};
  // Backend uses { total, high, medium, low, critical }
  return {
    total: Number(data.total ?? 0),
    highRisk: Number(data.high ?? data.highRisk ?? 0),
    mediumRisk: Number(data.medium ?? data.mediumRisk ?? 0),
    lowRisk: Number(data.low ?? data.lowRisk ?? 0),
  };
}

function normalizeStateDistribution(raw) {
  const data = unwrap(raw);
  const arr = Array.isArray(data) ? data : [];
  return arr.map((row) => ({
    name: row.name ?? row.state ?? 'Unknown',
    value: Number(row.value ?? row.count ?? 0),
  })).filter((row) => row.value > 0);
}

function normalizeStateRiskHotspots(raw) {
  const data = unwrap(raw);
  const arr = Array.isArray(data) ? data : [];
  return arr
    .map((row) => ({
      name: row.state ?? row.name ?? 'Unknown',
      value: Number(row.avg_risk_score ?? row.value ?? 0),
      highRiskBusinesses: Number(row.high_risk_businesses ?? 0),
      totalBusinesses: Number(row.total_businesses ?? 0),
    }))
    .filter((row) => row.value > 0);
}

function normalizeItcOverview(raw) {
  const data = raw && typeof raw === 'object' && 'metrics' in raw ? raw : { metrics: raw?.metrics ?? {} };
  const metrics = data.metrics || {};
  return {
    totalItcClaimed: Number(metrics.total_itc_claimed ?? 0),
    totalGstPaid: Number(metrics.total_gst_paid ?? 0),
    averageItcRatio: Number(metrics.average_itc_ratio ?? 0),
    highRiskBusinesses: Number(metrics.high_risk_businesses ?? 0),
  };
}

function normalizeActivity(raw) {
  const data = unwrap(raw);
  const arr = Array.isArray(data) ? data : [];
  // Backend returns { month, count } while frontend expects { month, invoices }
  return arr.map((d) => ({
    month: d.month ?? d.name,
    invoices: d.invoices ?? d.count ?? d.value ?? 0,
  }));
}

function normalizeTopRisk(raw) {
  const data = unwrap(raw);
  const arr = Array.isArray(data) ? data : [];
  return arr.map((b) => ({
    gstin: b.gstin,
    businessName: b.businessName || b.name || b.business_name || b.gstin,
    state: b.state || b.state_name || '',
    riskScore: b.riskScore ?? 0,
    riskCategory: b.riskCategory || 'medium',
    totalInvoices: b.totalInvoices ?? b.invoiceCount ?? 0,
  }));
}

function normalizeAlerts(raw) {
  const data = unwrap(raw);
  const arr = Array.isArray(data) ? data : [];
  // Backend uses { title, message, type } where type is severity-ish (critical/high/medium)
  return arr.map((a) => ({
    id: a.id,
    type: (a.icon === 'loop' ? 'circular' : a.icon === 'warning' ? 'eway' : a.icon === 'flag' ? 'itc' : a.type) || 'itc',
    title: a.title || 'Alert',
    detail: a.detail || a.message || '',
    severity: (a.type === 'critical' ? 'high' : a.type) || 'medium',
  }));
}

async function fetchWithFallback(endpoint, mockKey) {
  try {
    const { data } = await api.get(endpoint);
    return unwrap(data);
  } catch (err) {
    if (err.code === 'ERR_NETWORK' || err.response?.status >= 400) {
      return mockData[mockKey];
    }
    throw err;
  }
}

export const dashboardApi = {
  getRiskSummary: async () => normalizeRiskSummary(await fetchWithFallback('/dashboard/risk-summary', 'riskSummary')),
  getStateDistribution: async () => normalizeStateDistribution(await fetchWithFallback('/dashboard/state-distribution', 'stateDistribution')),
  getStateRiskHotspots: async () => normalizeStateRiskHotspots(await fetchWithFallback('/analytics/state-risk', 'stateRiskHotspots')),
  getInvoiceMatch: async () => normalizeInvoiceMatch(await fetchWithFallback('/dashboard/invoice-match', 'invoiceMatch')),
  getItcStatus: async () => normalizeItcStatus(await fetchWithFallback('/dashboard/itc-status', 'itcStatus')),
  getItcOverview: async () => normalizeItcOverview(await fetchWithFallback('/analytics/itc-overview', 'itcOverview')),
  getActivity: async () => normalizeActivity(await fetchWithFallback('/dashboard/activity', 'activity')),
  getTopRisk: async (limit) =>
    normalizeTopRisk(
      await fetchWithFallback(
        limit ? `/dashboard/top-risk?limit=${limit}` : '/dashboard/top-risk',
        'topRisk',
      ),
    ),
  getAlerts: async () => normalizeAlerts(await fetchWithFallback('/dashboard/alerts', 'alerts')),
};

export const investigationApi = {
  // Uses existing endpoint as the investigation list source
  getBusinesses: async ({ limit = 50 } = {}) => {
    const list = await fetchWithFallback(`/dashboard/top-risk?limit=${limit}`, 'topRisk');
    // `fetchWithFallback` already unwraps, so normalize to a consistent list shape
    return normalizeTopRisk(list);
  },
};

const businessMock = {
  gstin: '29AAAAA1111A1Z5',
  name: 'Alpha Traders',
  state: 'Karnataka',
  riskScore: 82,
  riskCategory: 'high',
};

const transactionsMock = {
  invoices: [
    {
      invoice_no: 'INV-2024-889',
      supplier_gstin: '29AABC5499K1Z2',
      supplier_name: 'Reliance Ind Ltd',
      taxable_value: 240000,
      gst_amount: 43200,
      gstr1_status: 'filed',
      gstr2b_status: 'missing',
      books_status: 'match',
      status: 'mismatch',
      insight: 'Amendment in GSTR-1 – 2B not yet updated',
      month: 'Jan',
    },
  ],
};

const networkMock = {
  nodes: [
    { gstin: '29AAAAA1111A1Z5', name: 'Alpha Traders', riskScore: 82, riskCategory: 'high', invoiceCount: 14 },
    { gstin: '29BBBBB2222B2Z6', name: 'Gamma Suppliers', riskScore: 35, riskCategory: 'low', invoiceCount: 6 },
    { gstin: '29CCCCC3333C3Z7', name: 'Beta Distributors', riskScore: 55, riskCategory: 'medium', invoiceCount: 8 },
    { gstin: '29DDDDD4444D4Z8', name: 'Delta Retail', riskScore: 76, riskCategory: 'high', invoiceCount: 4 },
  ],
  edges: [
    { from: '29BBBBB2222B2Z6', to: '29AAAAA1111A1Z5', type: 'SOLD_TO' },
    { from: '29AAAAA1111A1Z5', to: '29CCCCC3333C3Z7', type: 'SOLD_TO' },
    { from: '29AAAAA1111A1Z5', to: '29DDDDD4444D4Z8', type: 'SOLD_TO' },
  ],
};

async function fetchNoThrow(endpoint) {
  const { data } = await api.get(endpoint);
  return unwrap(data);
}

export const businessApi = {
  getBusiness: async (gstin) => {
    try {
      const data = await fetchNoThrow(`/business/${encodeURIComponent(gstin)}`);
      return data;
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.response?.status >= 400) return { ...businessMock, gstin };
      throw err;
    }
  },
  getRisk: async (gstin) => {
    try {
      const data = await fetchNoThrow(`/analysis/risk/${encodeURIComponent(gstin)}`);
      return data;
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.response?.status >= 400) {
        return { success: true, gstin, score: businessMock.riskScore, category: businessMock.riskCategory, factors: {} };
      }
      throw err;
    }
  },
  getTransactions: async (gstin, options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', String(options.limit));
      const qs = params.toString();
      const data = await fetchNoThrow(`/business/${encodeURIComponent(gstin)}/transactions${qs ? `?${qs}` : ''}`);
      return data;
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.response?.status >= 400) return transactionsMock;
      throw err;
    }
  },
  getNetwork: async (gstin) => {
    try {
      const data = await fetchNoThrow(`/analysis/network/${encodeURIComponent(gstin)}`);
      if (data && typeof data === 'object' && data.success === false) throw new Error(data.message || 'Graph unavailable');
      return data;
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.response?.status >= 400) return { success: true, ...networkMock };
      throw err;
    }
  },
  getReconciliationReport: async (gstin) => fetchNoThrow(`/analysis/reconciliation/${encodeURIComponent(gstin)}`),
  getAnomalies: async () => fetchNoThrow('/analysis/anomalies'),
  getBusinessesByState: async (state) => {
    const { data } = await api.get(`/business/state/${encodeURIComponent(state)}`);
    return data;
  },
 };

export const analyticsApi = {
  getStateRisk: async () => {
    const { data } = await api.get('/analytics/state-risk');
    return data;
  },
  getItcOverview: async () => {
    const { data } = await api.get('/analytics/itc-overview');
    return data;
  },
  getInvoiceActivity: async (gstin, options = {}) => {
    const params = new URLSearchParams();
    if (options.threshold) params.append('threshold', String(options.threshold));
    if (options.year) params.append('year', String(options.year));
    const qs = params.toString();
    const { data } = await api.get(`/analytics/invoice-activity/${encodeURIComponent(gstin)}${qs ? `?${qs}` : ''}`);
    return data;
  },
};

// Anomaly Detection API
export const anomalyApi = {
  // Get all anomalies with optional filtering
  getAnomalies: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.type) params.append('type', filters.type);
      if (filters.riskLevel) params.append('riskLevel', filters.riskLevel);
      if (filters.status) params.append('status', filters.status);
      if (filters.minProbability) params.append('minProbability', filters.minProbability);
      if (filters.limit) params.append('limit', filters.limit);
      
      const queryString = params.toString();
      const url = `/anomalies${queryString ? '?' + queryString : ''}`;
      
      const { data } = await api.get(url);
      return data;
    } catch (err) {
      console.error('Error fetching anomalies:', err);
      throw err;
    }
  },

  // Get anomaly statistics
  getStats: async () => {
    try {
      const { data } = await api.get('/anomalies/stats');
      return data;
    } catch (err) {
      console.error('Error fetching anomaly stats:', err);
      throw err;
    }
  },

  // Get single anomaly by ID
  getAnomaly: async (id) => {
    try {
      const { data } = await api.get(`/anomalies/${id}`);
      return data;
    } catch (err) {
      console.error('Error fetching anomaly:', err);
      throw err;
    }
  },

  // Detect anomalies for a business
  detectForBusiness: async (gstin) => {
    try {
      const { data } = await api.post(`/anomalies/detect/${gstin}`);
      return data;
    } catch (err) {
      console.error('Error detecting anomalies:', err);
      throw err;
    }
  },

  // Batch detect anomalies
  batchDetect: async (gstins) => {
    try {
      const { data } = await api.post('/anomalies/detect/batch', { gstins });
      return data;
    } catch (err) {
      console.error('Error in batch detection:', err);
      throw err;
    }
  },

  // Detect invoice burst anomalies
  detectBursts: async (payload = {}) => {
    try {
      const { data } = await api.post('/anomalies/detect-bursts', payload);
      return data;
    } catch (err) {
      console.error('Error detecting burst anomalies:', err);
      throw err;
    }
  },

  // Update anomaly status
  updateStatus: async (id, updates) => {
    try {
      const { data } = await api.patch(`/anomalies/${id}`, updates);
      return data;
    } catch (err) {
      console.error('Error updating anomaly:', err);
      throw err;
    }
  },

  // Get features for a business (debugging)
  getFeatures: async (gstin) => {
    try {
      const { data } = await api.get(`/anomalies/features/${gstin}`);
      return data;
    } catch (err) {
      console.error('Error fetching features:', err);
      throw err;
    }
  },
};

// Case Investigation API
export const caseApi = {
  createCase: async (payload) => {
    const { data } = await api.post('/cases', payload);
    return data;
  },

  listCases: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.investigator) params.append('investigator', filters.investigator);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));

    const qs = params.toString();
    const { data } = await api.get(`/cases${qs ? `?${qs}` : ''}`);
    return data;
  },

  getCase: async (caseId) => {
    const { data } = await api.get(`/cases/${encodeURIComponent(caseId)}`);
    return data;
  },

  updateCase: async (caseId, payload) => {
    const { data } = await api.patch(`/cases/${encodeURIComponent(caseId)}`, payload);
    return data;
  },

  deleteCase: async (caseId) => {
    const { data } = await api.delete(`/cases/${encodeURIComponent(caseId)}`);
    return data;
  },

  addNote: async (caseId, payload) => {
    const { data } = await api.post(`/cases/${encodeURIComponent(caseId)}/notes`, payload);
    return data;
  },

  getSummary: async () => {
    const { data } = await api.get('/cases/summary');
    return data;
  },

  getInvestigators: async () => {
    const { data } = await api.get('/cases/investigators');
    return data;
  },
};

export const callApi = {
  getHistory: async () => {
    const { data } = await api.get('/calls/history');
    return data;
  },
  getPending: async () => {
    const { data } = await api.get('/calls/pending');
    return data;
  },
  initiate: async (payload) => {
    const { data } = await api.post('/calls/initiate', payload);
    return data;
  },
};
