import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import indiaMap from '@svg-maps/india';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { analyticsApi, businessApi } from '../services/api';

function normalizeState(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function riskFill(avgRiskScore) {
  const score = Number(avgRiskScore || 0);
  if (score >= 50) return '#dc2626';
  if (score >= 30) return '#f59e0b';
  return '#16a34a';
}

export default function StateRiskMap() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState(null);
  const [selectedState, setSelectedState] = useState('');
  const [stateDetails, setStateDetails] = useState({ businesses: [], anomalies: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    loadStateRisk();
  }, []);

  async function loadStateRisk() {
    try {
      setLoading(true);
      setError('');
      const response = await analyticsApi.getStateRisk();
      setRows(response?.data || []);
    } catch (err) {
      console.error('Error loading state risk:', err);
      setError('Unable to load state-wise risk analytics');
    } finally {
      setLoading(false);
    }
  }

  async function loadStateDetails(stateName) {
    try {
      setDetailsLoading(true);
      const response = await businessApi.getBusinessesByState(stateName);
      setStateDetails(response?.data || { businesses: [], anomalies: [] });
      setSelectedState(stateName);
    } catch (err) {
      console.error('Error loading state details:', err);
      setStateDetails({ businesses: [], anomalies: [] });
    } finally {
      setDetailsLoading(false);
    }
  }

  const stateMap = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      map.set(normalizeState(row.state), row);
    });
    return map;
  }, [rows]);

  const summary = useMemo(() => {
    const totalStates = rows.length;
    const highRiskStates = rows.filter((r) => Number(r.high_risk_businesses || 0) > 0).length;
    const totalAnomalies = rows.reduce((sum, row) => sum + Number(row.total_anomalies || 0), 0);
    const avgRisk = totalStates > 0
      ? rows.reduce((sum, row) => sum + Number(row.avg_risk_score || 0), 0) / totalStates
      : 0;

    return {
      totalStates,
      highRiskStates,
      totalAnomalies,
      avgRisk: avgRisk.toFixed(2),
    };
  }, [rows]);

  const topRiskStates = useMemo(() => rows.slice(0, 5), [rows]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-700 via-green-700 to-teal-700 text-white p-6 shadow-xl">
        <h1 className="text-2xl font-bold">State Risk Map</h1>
        <p className="text-sm text-white/90 mt-1">Visualize GST fraud hotspots and anomaly concentration across India.</p>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard title="Total States Analyzed" value={summary.totalStates} color="from-slate-100 to-slate-200" />
        <SummaryCard title="High Risk States" value={summary.highRiskStates} color="from-red-100 to-orange-100" />
        <SummaryCard title="Total Anomalies" value={summary.totalAnomalies} color="from-amber-100 to-yellow-100" />
        <SummaryCard title="Average Risk Score" value={summary.avgRisk} color="from-blue-100 to-cyan-100" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-white rounded-2xl border-2 border-emerald-200 p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">India Risk Heatmap</h2>
            <div className="flex items-center gap-3 text-xs font-semibold text-gray-700">
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-green-600" />Low</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-500" />Medium</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-600" />High</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-2">
            {loading ? (
              <div className="h-[420px] flex items-center justify-center text-sm text-gray-500">Loading map data...</div>
            ) : (
              <svg viewBox={indiaMap.viewBox} className="w-full h-[420px]">
                <g>
                  {indiaMap.locations.map((location) => {
                    const geoState = location.name;
                    const row = stateMap.get(normalizeState(geoState));
                    return (
                      <path
                        key={location.id || geoState}
                        d={location.path}
                        fill={riskFill(row?.avg_risk_score)}
                        stroke="#ffffff"
                        strokeWidth={0.8}
                        className="cursor-pointer transition-colors hover:fill-slate-700"
                        onMouseEnter={() => {
                          setHovered(
                            row || {
                              state: geoState,
                              total_businesses: 0,
                              high_risk_businesses: 0,
                              total_anomalies: 0,
                              avg_risk_score: 0,
                            }
                          );
                        }}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => loadStateDetails(geoState)}
                      />
                    );
                  })}
                </g>
              </svg>
            )}
          </div>

          <div className="mt-3 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
            {hovered ? (
              <div className="space-y-0.5">
                <p className="font-bold text-gray-900">State: {hovered.state}</p>
                <p className="text-gray-700">Businesses: {hovered.total_businesses || 0}</p>
                <p className="text-gray-700">High Risk: {hovered.high_risk_businesses || 0}</p>
                <p className="text-gray-700">Anomalies: {hovered.total_anomalies || 0}</p>
                <p className="text-gray-700">Avg Risk Score: {hovered.avg_risk_score || 0}</p>
              </div>
            ) : (
              <p className="text-gray-500">Hover over a state to view risk metrics. Click a state for deeper investigation.</p>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl border-2 border-indigo-200 p-5 shadow-lg">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Top Risk States</h2>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topRiskStates} layout="vertical" margin={{ left: 12, right: 12, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="state" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="avg_risk_score" radius={[0, 6, 6, 0]}>
                  {topRiskStates.map((row) => (
                    <Cell key={row.state} fill={riskFill(row.avg_risk_score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="bg-white rounded-2xl border-2 border-sky-200 p-5 shadow-lg space-y-4">
        <h2 className="text-lg font-bold text-gray-900">State Investigation Table</h2>
        {!selectedState ? (
          <p className="text-sm text-gray-500">Click a state on the map to load businesses and anomalies.</p>
        ) : detailsLoading ? (
          <p className="text-sm text-gray-500">Loading details for {selectedState}...</p>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-2">Businesses in {selectedState}</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">GSTIN</th>
                      <th className="px-3 py-2 text-left">Risk Score</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stateDetails.businesses || []).map((b) => (
                      <tr key={b.gstin} className="border-t border-slate-100">
                        <td className="px-3 py-2">{b.name}</td>
                        <td className="px-3 py-2">{b.gstin}</td>
                        <td className="px-3 py-2">{Number(b.riskScore || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => navigate(`/business/${encodeURIComponent(b.gstin)}`)}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                          >
                            Investigate
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(stateDetails.businesses || []).length === 0 && (
                      <tr><td className="px-3 py-3 text-gray-500" colSpan={4}>No businesses found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-2">Anomalies in {selectedState}</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Business</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Risk</th>
                      <th className="px-3 py-2 text-left">Probability</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stateDetails.anomalies || []).map((a, idx) => (
                      <tr key={`${a.businessGstin}-${idx}`} className="border-t border-slate-100">
                        <td className="px-3 py-2">{a.businessName} ({a.businessGstin})</td>
                        <td className="px-3 py-2">{String(a.type || '').replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2">{a.riskLevel}</td>
                        <td className="px-3 py-2">{(Number(a.fraudProbability || 0) * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2">{a.status}</td>
                      </tr>
                    ))}
                    {(stateDetails.anomalies || []).length === 0 && (
                      <tr><td className="px-3 py-3 text-gray-500" colSpan={5}>No anomalies found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ title, value, color }) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${color} border border-white/70 p-4 shadow-md`}>
      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
