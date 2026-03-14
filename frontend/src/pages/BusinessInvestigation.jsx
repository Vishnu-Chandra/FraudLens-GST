import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { investigationApi } from '../services/api';

export default function BusinessInvestigation() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [risk, setRisk] = useState('all'); // all|high|medium|low
  const [stateFilter, setStateFilter] = useState('all');
  const [activity, setActivity] = useState({
    circular: false,
    eway: false,
    itc: false,
    mismatch: false,
  });

  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    investigationApi.getBusinesses({ limit: 50 })
      .then((rows) => { if (alive) setBusinesses(rows || []); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const states = useMemo(() => {
    const s = new Set(businesses.map((b) => b.state).filter(Boolean));
    return ['all', ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [businesses]);

  const top5 = useMemo(() => {
    return businesses
      .slice()
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      .slice(0, 5);
  }, [businesses]);

  const deriveIndicators = (b) => {
    const cat = String(b.riskCategory || '').toLowerCase();
    if (cat === 'high' || cat === 'critical') return ['Circular Trading', 'Missing eWay Bills', 'ITC Risk', 'Invoice Mismatch'];
    if (cat === 'medium') return ['Missing eWay Bills', 'Invoice Mismatch'];
    return ['Normal'];
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return businesses.filter((b) => {
      const indicators = deriveIndicators(b);

      if (q) {
        const hay = `${b.businessName || ''} ${b.gstin || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (risk !== 'all' && String(b.riskCategory || '').toLowerCase() !== risk) return false;
      if (stateFilter !== 'all' && String(b.state || '') !== stateFilter) return false;

      const want = [];
      if (activity.circular) want.push('Circular Trading');
      if (activity.eway) want.push('Missing eWay Bills');
      if (activity.itc) want.push('ITC Risk');
      if (activity.mismatch) want.push('Invoice Mismatch');
      if (want.length > 0 && !want.some((w) => indicators.includes(w))) return false;

      return true;
    }).sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
  }, [businesses, query, risk, stateFilter, activity]);

  const pill = (cat) => {
    const c = String(cat || '').toLowerCase();
    if (c === 'high' || c === 'critical') return { bg: '#FEE2E2', text: '#EF4444' };
    if (c === 'medium') return { bg: '#FEF3C7', text: '#F59E0B' };
    return { bg: '#D1FAE5', text: '#22C55E' };
  };

  const indicatorPill = (label) => {
    const key = String(label || '').toLowerCase();
    if (key.includes('circular')) return { bg: '#FEE2E2', text: '#EF4444', ring: '#EF444433' };
    if (key.includes('eway')) return { bg: '#FEF3C7', text: '#F59E0B', ring: '#F59E0B33' };
    if (key.includes('itc')) return { bg: '#DBEAFE', text: '#3B82F6', ring: '#3B82F633' };
    if (key.includes('mismatch')) return { bg: '#FFE4E6', text: '#F43F5E', ring: '#F43F5E33' };
    return { bg: '#F3F4F6', text: '#6B7280', ring: '#E5E7EB' };
  };

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 text-white shadow-sm">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Business Investigation</h1>
              <p className="text-white/85 mt-2 text-sm max-w-2xl">
                Case selection console for investigators. Search GSTINs, filter suspicious traders, and open a full supply-chain investigation in one click.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="bg-white/12 border border-white/20 rounded-xl px-4 py-3">
                <p className="text-xs text-white/80">Businesses loaded</p>
                <p className="text-lg font-semibold">{businesses.length}</p>
              </div>
              <div className="bg-white/12 border border-white/20 rounded-xl px-4 py-3">
                <p className="text-xs text-white/80">Results</p>
                <p className="text-lg font-semibold">{loading ? '—' : filtered.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 md:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GSTIN or Business Name"
              className="w-full pl-10 pr-3 py-3 rounded-xl border border-[#E5E7EB] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setQuery(''); setRisk('all'); setStateFilter('all'); setActivity({ circular: false, eway: false, itc: false, mismatch: false }); }}
              className="px-4 py-3 rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#111827] bg-white hover:bg-gray-50"
            >
              Reset
            </button>
            <button
              onClick={() => {
                const hit = filtered[0];
                if (hit?.gstin) navigate(`/business/${encodeURIComponent(hit.gstin)}`);
              }}
              className="px-4 py-3 rounded-xl text-sm font-medium text-white bg-[#6366F1] hover:bg-indigo-600 shadow-sm"
            >
              Investigate first result
            </button>
          </div>
        </div>
      </div>

      {/* Top 5 */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#111827]">Top Risk Businesses</h2>
          <p className="text-sm text-[#6B7280]">Proactive prioritization (top 5)</p>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          {top5.map((b) => {
            const colors = pill(b.riskCategory);
            return (
              <button
                key={b.gstin}
                onClick={() => navigate(`/business/${encodeURIComponent(b.gstin)}`)}
                className="text-left p-4 rounded-2xl border border-[#E5E7EB] hover:bg-indigo-50/40 hover:border-indigo-200 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <p className="text-sm font-semibold text-[#111827] truncate">{b.businessName}</p>
                <p className="text-xs text-[#6B7280] mt-0.5 truncate">{b.gstin}</p>
                <div className="mt-2 inline-flex px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: colors.bg, color: colors.text }}>
                  Risk {b.riskScore}
                </div>
                <p className="mt-2 text-xs text-[#6B7280] truncate">{b.state || '—'} • {b.totalInvoices} invoices</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters + Table */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#111827]">Filters</h2>
          <p className="text-sm text-[#6B7280] mt-1">Focus investigations by risk, state, and suspicious activity</p>

          <div className="mt-4 space-y-5">
            <div>
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Risk Level</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {['all', 'high', 'medium', 'low'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRisk(r)}
                    className={`px-3 py-2 rounded-xl text-sm border transition-colors ${risk === r ? 'bg-indigo-50 border-indigo-200 text-[#4F46E5]' : 'bg-white border-[#E5E7EB] text-[#111827] hover:bg-gray-50'}`}
                  >
                    {r === 'all' ? 'All' : r[0].toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Suspicious Activity</p>
              <div className="mt-2 space-y-2 text-sm text-[#111827]">
                {[
                  { k: 'circular', label: 'Circular Trading' },
                  { k: 'eway', label: 'Missing eWay Bills' },
                  { k: 'itc', label: 'ITC Risk' },
                  { k: 'mismatch', label: 'Invoice Mismatch' },
                ].map((o) => (
                  <label key={o.k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activity[o.k]}
                      onChange={(e) => setActivity((p) => ({ ...p, [o.k]: e.target.checked }))}
                    />
                    <span
                      className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium border"
                      style={{
                        backgroundColor: indicatorPill(o.label).bg,
                        color: indicatorPill(o.label).text,
                        borderColor: indicatorPill(o.label).ring,
                      }}
                    >
                      {o.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">State</p>
              <select
                className="mt-2 w-full px-3 py-3 rounded-xl border border-[#E5E7EB] text-sm bg-white"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
              >
                {states.map((s) => (
                  <option key={s} value={s}>{s === 'all' ? 'All States' : s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="xl:col-span-3 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between bg-gradient-to-r from-white to-indigo-50/60">
            <h2 className="text-base font-semibold text-[#111827]">Business Risk Table</h2>
            <p className="text-sm text-[#6B7280]">{loading ? 'Loading…' : `${filtered.length} results`}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                  <th className="px-6 py-4">Business</th>
                  <th className="px-6 py-4">GSTIN</th>
                  <th className="px-6 py-4">State</th>
                  <th className="px-6 py-4">Risk Score</th>
                  <th className="px-6 py-4">Invoices</th>
                  <th className="px-6 py-4">Indicators</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filtered.map((b) => {
                  const colors = pill(b.riskCategory);
                  const indicators = deriveIndicators(b);
                  return (
                    <tr
                      key={b.gstin}
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                      onClick={() => navigate(`/business/${encodeURIComponent(b.gstin)}`)}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-[#111827]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl border border-[#E5E7EB] bg-white flex items-center justify-center">
                            <span className="text-xs font-semibold text-[#111827]">{String(b.businessName || 'B').slice(0, 1).toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#111827]">{b.businessName}</p>
                            <p className="text-xs text-[#6B7280]">{b.state || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#4F46E5] font-semibold">{b.gstin}</td>
                      <td className="px-6 py-4 text-sm text-[#6B7280]">{b.state || '—'}</td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border"
                          style={{ backgroundColor: colors.bg, color: colors.text, borderColor: `${colors.text}33` }}
                        >
                          {b.riskScore}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#6B7280]">{b.totalInvoices}</td>
                      <td className="px-6 py-4 text-sm text-[#6B7280]">
                        {indicators.map((x) => (
                          <span
                            key={x}
                            className="inline-flex mr-2 mb-1 px-2.5 py-1 rounded-full text-xs font-medium border"
                            style={{
                              backgroundColor: indicatorPill(x).bg,
                              color: indicatorPill(x).text,
                              borderColor: indicatorPill(x).ring,
                            }}
                          >
                            {x}
                          </span>
                        ))}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            className="px-3 py-2 rounded-xl bg-[#6366F1] text-white text-sm font-medium hover:bg-indigo-600 transition-colors shadow-sm"
                            onClick={(e) => { e.stopPropagation(); navigate(`/business/${encodeURIComponent(b.gstin)}`); }}
                          >
                            Investigate
                          </button>
                          <button
                            className="px-3 py-2 rounded-xl bg-white border border-indigo-300 text-indigo-700 text-sm font-medium hover:bg-indigo-50 transition-colors shadow-sm"
                            onClick={(e) => { e.stopPropagation(); navigate(`/cases?business=${encodeURIComponent(b.gstin)}`); }}
                          >
                            Create Case
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
