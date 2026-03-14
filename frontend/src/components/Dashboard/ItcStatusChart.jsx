import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { dashboardApi } from '../../services/api';

const COLORS = ['#22C55E', '#F59E0B', '#EF4444'];

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/2 mb-6" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );
}

export default function ItcStatusChart() {
  const [data, setData] = useState(null);
  const [total, setTotal] = useState(0);
  const [overview, setOverview] = useState({ averageItcRatio: 0, highRiskBusinesses: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([dashboardApi.getItcStatus(), dashboardApi.getItcOverview()]).then(([raw, metrics]) => {
      const rows = [
        { name: 'Healthy ITC (<1.2x)', value: raw.valid ?? 0 },
        { name: 'Review Needed (1.2x-2x)', value: raw.suspicious ?? 0 },
        { name: 'Excess ITC (>2x)', value: raw.highRisk ?? 0 },
      ].filter((d) => d.value > 0);
      setTotal(rows.reduce((sum, row) => sum + row.value, 0));
      setData(rows);
      setOverview(metrics);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartSkeleton />;

  return (
    <div
      className="rounded-xl border border-[#E5E7EB] p-6 shadow-sm"
      style={{ background: 'linear-gradient(135deg, #ECFEFF, #FFFFFF)' }}
    >
      <h3 className="text-base font-semibold text-[#111827] mb-1">ITC Claim Threshold Mix</h3>
      <p className="text-xs text-[#6B7280] mb-4">Return counts bucketed by claimed ITC versus GST paid ratio</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              animationBegin={0}
              animationDuration={600}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => {
                const percentage = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : '0.0';
                return [`${value} returns (${percentage}%)`, ''];
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">Average ITC Ratio</p>
          <p className="text-lg font-bold text-emerald-900 mt-1">{overview.averageItcRatio.toFixed(2)}x</p>
        </div>
        <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-rose-700 font-semibold">High-Risk Businesses</p>
          <p className="text-lg font-bold text-rose-900 mt-1">{overview.highRiskBusinesses}</p>
        </div>
      </div>
    </div>
  );
}
