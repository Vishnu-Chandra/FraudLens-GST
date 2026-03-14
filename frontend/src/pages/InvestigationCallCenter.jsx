import { useState, useEffect, useCallback } from 'react';
import { callApi, anomalyApi } from '../services/api';

const STATUS_CONFIG = {
  COMPLETED: { bg: '#D1FAE5', text: '#22C55E', label: 'Completed' },
  FAILED:    { bg: '#FEE2E2', text: '#EF4444', label: 'Failed' },
  'NO ANSWER': { bg: '#FEF3C7', text: '#F59E0B', label: 'No Answer' },
  BUSY:      { bg: '#FFEDD5', text: '#EA580C', label: 'Busy' },
};

const RISK_CONFIG = {
  HIGH:     { bg: '#FEE2E2', text: '#EF4444' },
  CRITICAL: { bg: '#FDF2F8', text: '#D946EF' },
  MEDIUM:   { bg: '#FEF3C7', text: '#F59E0B' },
  LOW:      { bg: '#D1FAE5', text: '#22C55E' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { bg: '#F3F4F6', text: '#6B7280', label: status };
  return (
    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}>
      {cfg.label || status}
    </span>
  );
}

function RiskBadge({ level }) {
  const cfg = RISK_CONFIG[String(level).toUpperCase()] || RISK_CONFIG.MEDIUM;
  return (
    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}>
      {level}
    </span>
  );
}

function Toast({ message, type, onClose }) {
  const colors = type === 'success'
    ? 'bg-green-50 border-green-400 text-green-800'
    : type === 'error'
    ? 'bg-red-50 border-red-400 text-red-800'
    : 'bg-blue-50 border-blue-400 text-blue-800';
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium ${colors} animate-bounce-once`}>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 text-lg leading-none opacity-70 hover:opacity-100">&times;</button>
    </div>
  );
}

function SkeletonRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export default function InvestigationCallCenter() {
  const [pendingCalls, setPendingCalls] = useState([]);
  const [callHistory, setCallHistory] = useState([]);
  const [highRisk, setHighRisk] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [callingGstin, setCallingGstin] = useState(null);
  const [toast, setToast] = useState(null);
  const [pendingSearch, setPendingSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('pending');

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoadingPending(true);
    setLoadingHistory(true);
    const [pendingRes, historyRes, anomaliesRes] = await Promise.allSettled([
      callApi.getPending(),
      callApi.getHistory(),
      anomalyApi.getAnomalies({ riskLevel: 'HIGH', limit: 20 }),
    ]);
    if (pendingRes.status === 'fulfilled') setPendingCalls(pendingRes.value?.data || []);
    if (historyRes.status === 'fulfilled') setCallHistory(historyRes.value?.data || []);
    if (anomaliesRes.status === 'fulfilled') {
      setHighRisk((anomaliesRes.value?.data || []).filter(a => {
        const lvl = (a.riskLevel || '').toUpperCase();
        return lvl === 'HIGH' || lvl === 'CRITICAL';
      }));
    }
    setLoadingPending(false);
    setLoadingHistory(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCall(business) {
    const gstin = business.businessGstin || business.gstin;
    const name = business.businessName || business.business_name || 'Unknown Business';
    setCallingGstin(gstin);
    showToast(`Calling ${name}…`, 'info');
    try {
      const res = await callApi.initiate({ business_name: name, gstin });
      showToast(`Call initiated successfully for ${name}`, 'success');
      await loadData();
    } catch {
      showToast(`Call failed for ${name}`, 'error');
    } finally {
      setCallingGstin(null);
    }
  }

  const filteredPending = pendingCalls.filter(b => {
    const name = (b.businessName || b.business_name || '').toLowerCase();
    const gstin = (b.businessGstin || b.gstin || '').toLowerCase();
    const search = pendingSearch.toLowerCase();
    const matchSearch = !search || name.includes(search) || gstin.includes(search);
    const lvl = (b.riskLevel || '').toUpperCase();
    const matchRisk = riskFilter === 'ALL' || lvl === riskFilter;
    return matchSearch && matchRisk;
  });

  const filteredHistory = callHistory.filter(c => {
    const name = (c.business_name || '').toLowerCase();
    const gstin = (c.gstin || '').toLowerCase();
    const search = historySearch.toLowerCase();
    const matchSearch = !search || name.includes(search) || gstin.includes(search);
    const matchStatus = statusFilter === 'ALL' || c.call_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const tabClass = (tab) =>
    `px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      activeTab === tab
        ? 'bg-[#6366F1] text-white shadow'
        : 'text-[#6B7280] hover:bg-gray-100'
    }`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Investigation Call Center</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Contact suspicious taxpayers detected by the anomaly engine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-[#6B7280]">System Active</span>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Pending Calls', value: pendingCalls.length, color: '#6366F1', bg: '#EEF2FF' },
          { label: 'Calls Made', value: callHistory.length, color: '#22C55E', bg: '#D1FAE5' },
          { label: 'High Risk Businesses', value: highRisk.length, color: '#EF4444', bg: '#FEE2E2' },
          { label: 'Completed', value: callHistory.filter(c => c.call_status === 'COMPLETED').length, color: '#F59E0B', bg: '#FEF3C7' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-[#E5E7EB] p-4 bg-white shadow-sm flex flex-col gap-1">
            <span className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</span>
            <span className="text-xs text-[#6B7280] font-medium">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl p-1.5 w-fit shadow-sm">
        <button className={tabClass('pending')} onClick={() => setActiveTab('pending')}>
          Pending Calls
          {pendingCalls.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
              {pendingCalls.length}
            </span>
          )}
        </button>
        <button className={tabClass('history')} onClick={() => setActiveTab('history')}>Call History</button>
        <button className={tabClass('highrisk')} onClick={() => setActiveTab('highrisk')}>High Risk Businesses</button>
      </div>

      {/* ── PENDING CALLS ── */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">Pending Calls</h2>
              <p className="text-xs text-[#6B7280] mt-0.5">Anomaly-detected businesses not yet contacted</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search name or GSTIN…"
                value={pendingSearch}
                onChange={e => setPendingSearch(e.target.value)}
                className="border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-indigo-300 w-48"
              />
              <select
                value={riskFilter}
                onChange={e => setRiskFilter(e.target.value)}
                className="border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="ALL">All Risks</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB]">
                <tr>
                  {['Business Name', 'GSTIN', 'Risk Level', 'Fraud Probability', 'Anomaly Type', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wide border-b border-[#E5E7EB]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingPending ? (
                  Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                ) : filteredPending.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#6B7280]">No pending calls found.</td>
                  </tr>
                ) : filteredPending.map((b, i) => {
                  const gstin = b.businessGstin || b.gstin;
                  const name = b.businessName || b.business_name || gstin;
                  const prob = typeof b.fraudProbability === 'number' ? b.fraudProbability : 0;
                  const isHighProb = prob > 0.8;
                  const isCallingThis = callingGstin === gstin;
                  const anomalyType = b.title || b.type || 'Anomaly Detected';
                  return (
                    <tr key={i}
                      className={`border-b border-[#F3F4F6] transition-colors ${isHighProb ? 'bg-red-50' : 'hover:bg-[#F9FAFB]'}`}>
                      <td className="px-4 py-3 font-medium text-[#111827]">
                        {name}
                        {isHighProb && <span className="ml-2 text-xs text-red-500 font-semibold">⚠ High Fraud Risk</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#374151]">{gstin}</td>
                      <td className="px-4 py-3"><RiskBadge level={b.riskLevel || 'MEDIUM'} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.round(prob * 100)}%`, backgroundColor: prob > 0.8 ? '#EF4444' : prob > 0.5 ? '#F59E0B' : '#22C55E' }} />
                          </div>
                          <span className="text-xs font-medium text-[#374151]">{Math.round(prob * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#6B7280]">{anomalyType}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleCall(b)}
                          disabled={isCallingThis}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6366F1] text-white text-xs font-semibold hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isCallingThis ? (
                            <>
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                              </svg>
                              Calling…
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              Call Now
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CALL HISTORY ── */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#111827]">Call History</h2>
              <p className="text-xs text-[#6B7280] mt-0.5">All completed and attempted investigation calls</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search name or GSTIN…"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-indigo-300 w-48"
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="ALL">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
                <option value="NO ANSWER">No Answer</option>
                <option value="BUSY">Busy</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB]">
                <tr>
                  {['Call ID', 'Business Name', 'GSTIN', 'Dialed Number', 'Status', 'Call Time', 'Investigator'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wide border-b border-[#E5E7EB]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                ) : filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#6B7280]">No call history found.</td>
                  </tr>
                ) : filteredHistory.map((c, i) => (
                  <tr key={i} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-[#6B7280]">{c.call_id}</td>
                    <td className="px-4 py-3 font-medium text-[#111827]">{c.business_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#374151]">{c.gstin}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#374151]">{c.dialed_number}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.call_status} /></td>
                    <td className="px-4 py-3 text-xs text-[#6B7280]">
                      {c.call_time ? new Date(c.call_time).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#374151]">{c.investigator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── HIGH RISK BUSINESSES ── */}
      {activeTab === 'highrisk' && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E5E7EB]">
            <h2 className="text-base font-semibold text-[#111827]">High Risk Businesses</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">Businesses flagged as HIGH / CRITICAL by the anomaly detection engine</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB]">
                <tr>
                  {['Business Name', 'GSTIN', 'Risk Level', 'Fraud Probability', 'Type', 'Status', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wide border-b border-[#E5E7EB]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingPending ? (
                  Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                ) : highRisk.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#6B7280]">No high risk businesses found.</td>
                  </tr>
                ) : highRisk.map((b, i) => {
                  const gstin = b.businessGstin || b.gstin;
                  const name = b.businessName || gstin;
                  const prob = typeof b.fraudProbability === 'number' ? b.fraudProbability : 0;
                  const isHighProb = prob > 0.8;
                  const isCallingThis = callingGstin === gstin;
                  return (
                    <tr key={i} className={`border-b border-[#F3F4F6] transition-colors ${isHighProb ? 'bg-red-50' : 'hover:bg-[#F9FAFB]'}`}>
                      <td className="px-4 py-3 font-medium text-[#111827]">{name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#374151]">{gstin}</td>
                      <td className="px-4 py-3"><RiskBadge level={b.riskLevel || 'HIGH'} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.round(prob * 100)}%`, backgroundColor: '#EF4444' }} />
                          </div>
                          <span className="text-xs font-semibold text-red-600">{Math.round(prob * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#6B7280] text-xs">{b.title || b.type || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                          {b.status || 'NEW'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleCall(b)}
                          disabled={isCallingThis}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isCallingThis ? 'Calling…' : 'Call Now'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
