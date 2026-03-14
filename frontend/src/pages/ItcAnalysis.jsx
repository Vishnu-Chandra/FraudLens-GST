import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { analyticsApi } from '../services/api';

/* ── formatters ───────────────────────────────────────────── */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatShort(value) {
  const n = Number(value || 0);
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)} L`;
  return formatCurrency(n);
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(value) {
  if (!value) return '—';
  // Parse YYYY-MM-DD directly to avoid UTC→local timezone shifts
  const parts = String(value).slice(0, 10).split('-');
  if (parts.length === 3) {
    const [yr, mo, dy] = parts;
    const monthName = MONTH_NAMES[parseInt(mo, 10) - 1] || mo;
    return `${dy} ${monthName} ${yr}`;
  }
  return '—';
}

/* ── risk helpers ─────────────────────────────────────────── */
function riskConfig(level) {
  const l = String(level || '').toUpperCase();
  if (l === 'HIGH')   return { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500',    bar: 'bg-red-400'    };
  if (l === 'MEDIUM') return { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-400',  bar: 'bg-amber-400'  };
  return               { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', bar: 'bg-emerald-500'};
}

/* ── metric card ──────────────────────────────────────────── */
const CARDS = [
  {
    key: 'totalItcClaimed',
    title: 'Total ITC Claimed',
    subtitle: 'Aggregate across all filings',
    gradient: 'from-blue-500 to-indigo-600',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      </svg>
    ),
  },
  {
    key: 'totalGstPaid',
    title: 'Total GST Paid',
    subtitle: 'Actual tax remittance',
    gradient: 'from-cyan-500 to-teal-600',
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </svg>
    ),
  },
  {
    key: 'averageItcRatio',
    title: 'Avg ITC Ratio',
    subtitle: 'ITC Claimed ÷ GST Paid',
    gradient: 'from-violet-500 to-purple-600',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: 'highRiskBusinesses',
    title: 'High Risk Businesses',
    subtitle: 'Ratio > 2.0 threshold',
    gradient: 'from-rose-500 to-red-600',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
];

function MetricCard({ config, value, loading }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm">
      {/* colored top stripe */}
      <div className={`h-1 w-full bg-gradient-to-r ${config.gradient}`} />
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{config.title}</p>
            {loading ? (
              <div className="mt-2 h-7 w-24 animate-pulse rounded-lg bg-slate-100" />
            ) : (
              <p className="mt-1.5 text-2xl font-bold text-slate-900 truncate">{value}</p>
            )}
            <p className="mt-1 text-xs text-slate-400">{config.subtitle}</p>
          </div>
          <div className={`shrink-0 ml-3 flex h-10 w-10 items-center justify-center rounded-xl ${config.iconBg} ${config.iconColor}`}>
            {config.icon}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── custom tooltip ───────────────────────────────────────── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-xl text-sm">
      <p className="mb-2 font-bold text-slate-700">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-semibold text-slate-800">{formatShort(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── skeleton row ─────────────────────────────────────────── */
function SkeletonRow() {
  return (
    <tr className="border-t border-slate-100">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-slate-100" />
        </td>
      ))}
    </tr>
  );
}

/* ── ratio bar ────────────────────────────────────────────── */
function RatioBar({ ratio, riskLevel }) {
  const cfg = riskConfig(riskLevel);
  const pct = Math.min((Number(ratio || 0) / 4) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right text-xs font-semibold text-slate-700">{Number(ratio || 0).toFixed(2)}</span>
      <div className="flex-1 h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${cfg.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function ItcAnalysis() {
  const [payload, setPayload] = useState({ metrics: null, trend: [], recent_transactions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');

  useEffect(() => { loadItcOverview(); }, []);

  async function loadItcOverview() {
    try {
      setLoading(true);
      setError('');
      const response = await analyticsApi.getItcOverview();
      setPayload({
        metrics: response?.metrics || null,
        trend: response?.trend || [],
        recent_transactions: response?.recent_transactions || [],
      });
    } catch (err) {
      console.error('Failed to load ITC overview:', err);
      setError('Unable to load ITC overview. Check backend connectivity.');
    } finally {
      setLoading(false);
    }
  }

  const metricValues = useMemo(() => {
    const m = payload.metrics || {};
    return {
      totalItcClaimed: formatShort(m.total_itc_claimed || 0),
      totalGstPaid:    formatShort(m.total_gst_paid    || 0),
      averageItcRatio: Number(m.average_itc_ratio      || 0).toFixed(2),
      highRiskBusinesses: String(Number(m.high_risk_businesses || 0)),
    };
  }, [payload.metrics]);

  const filteredTx = useMemo(() => {
    const txs = payload.recent_transactions || [];
    if (riskFilter === 'ALL') return txs;
    return txs.filter((r) => String(r.risk_level || '').toUpperCase() === riskFilter);
  }, [payload.recent_transactions, riskFilter]);

  const RISK_TABS = ['ALL', 'HIGH', 'MEDIUM', 'LOW'];

  return (
    <div className="space-y-6">

      {/* ── header ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-cyan-900 p-7 text-white shadow-xl">
        {/* decorative blobs */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 left-24 h-32 w-32 rounded-full bg-cyan-400/15 blur-2xl" />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-200 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              GST Intelligence · ITC Module
            </div>
            <h1 className="text-3xl font-bold tracking-tight">ITC Analysis</h1>
            <p className="mt-1.5 max-w-lg text-sm text-slate-300">
              Monitor Input Tax Credit claims against GST payments to identify credit abuse and suspicious filing patterns.
            </p>
          </div>
          <button
            onClick={loadItcOverview}
            disabled={loading}
            className="shrink-0 flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50 transition-colors backdrop-blur-sm"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* risk classification legend */}
        <div className="relative mt-5 flex flex-wrap gap-3">
          {[
            { label: 'Low Risk',    note: 'Ratio < 1.2',   color: 'bg-emerald-400' },
            { label: 'Medium Risk', note: '1.2 – 2.0',     color: 'bg-amber-400'   },
            { label: 'High Risk',   note: 'Ratio > 2.0',   color: 'bg-red-400'     },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs backdrop-blur-sm">
              <span className={`h-2 w-2 rounded-full ${item.color}`} />
              <span className="font-medium text-white">{item.label}</span>
              <span className="text-slate-300">{item.note}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* ── metric cards ───────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((cfg) => (
          <MetricCard key={cfg.key} config={cfg} value={metricValues[cfg.key]} loading={loading} />
        ))}
      </section>

      {/* ── trend chart ────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">ITC vs GST Trend</h2>
            <p className="text-xs text-slate-400 mt-0.5">Monthly ITC claimed compared to actual GST paid</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-3 w-3 rounded-sm bg-blue-500" />ITC Claimed
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-3 w-3 rounded-sm bg-cyan-500" />GST Paid
            </span>
          </div>
        </div>

        <div className="px-2 pb-4 pt-2">
          <div className="h-[300px] w-full">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <p className="text-xs text-slate-400">Loading trend data…</p>
              </div>
            ) : payload.trend.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                <svg className="h-10 w-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm">No trend data available.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={payload.trend} margin={{ top: 8, right: 20, left: 10, bottom: 4 }}>
                  <defs>
                    <linearGradient id="gradItc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradGst" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#06B6D4" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${(Number(v) / 100000).toFixed(0)}L`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="itc_claimed"
                    name="ITC Claimed"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    fill="url(#gradItc)"
                    dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="gst_paid"
                    name="GST Paid"
                    stroke="#06B6D4"
                    strokeWidth={2.5}
                    fill="url(#gradGst)"
                    dot={{ r: 4, fill: '#06B6D4', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* ── transactions table ──────────────────────────────── */}
      <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent ITC Transactions</h2>
            <p className="text-xs text-slate-400 mt-0.5">Latest ITC filings with risk classification</p>
          </div>
          {/* risk filter tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {RISK_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setRiskFilter(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  riskFilter === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Business</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3 text-right">ITC Claimed</th>
                <th className="px-4 py-3 text-right">GST Paid</th>
                <th className="px-4 py-3">ITC Ratio</th>
                <th className="px-4 py-3 text-center">Risk</th>
                <th className="px-4 py-3">Filing Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                    No transactions found{riskFilter !== 'ALL' ? ` for ${riskFilter} risk` : ''}.
                  </td>
                </tr>
              ) : (
                filteredTx.map((row, idx) => {
                  const cfg = riskConfig(row.risk_level);
                  return (
                    <tr
                      key={`${row.gstin}-${row.filing_date}-${idx}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
                          <span className="font-medium text-slate-800">{row.business_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                          {row.gstin}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-800">
                        {formatShort(row.itc_claimed)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-600">
                        {formatShort(row.gst_paid)}
                      </td>
                      <td className="px-4 py-3.5 min-w-[120px]">
                        <RatioBar ratio={row.itc_ratio} riskLevel={row.risk_level} />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                          {row.risk_level}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">{formatDate(row.filing_date)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredTx.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            Showing {filteredTx.length} filing{filteredTx.length !== 1 ? 's' : ''}
            {riskFilter !== 'ALL' ? ` · ${riskFilter} risk filter active` : ''}
          </div>
        )}
      </section>
    </div>
  );
}
