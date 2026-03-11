import { useEffect, useState } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { dashboardApi } from '../../services/api';

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/2 mb-6" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );
}

export default function ActivityChart() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getActivity().then((raw) => {
      setData(Array.isArray(raw) ? raw : raw?.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartSkeleton />;

  const chartData = data.map((d) => ({
    name: d.month ?? d.name,
    invoices: d.invoices ?? d.value ?? 0,
  }));

  const maxVal = Math.max(...chartData.map((d) => d.invoices), 1);

  return (
    <div
      className="rounded-xl border border-[#E5E7EB] p-6 shadow-sm"
      style={{ background: 'linear-gradient(135deg, #F5F3FF, #FFFFFF)' }}
    >
      <h3 className="text-base font-semibold text-[#111827] mb-1">Monthly Invoice Activity</h3>
      <p className="text-xs text-[#6B7280] mb-4">Spikes in trading volume can indicate abnormal behaviour</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 12 }} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} domain={[0, maxVal * 1.2]} />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 8 }}
              formatter={(v) => [v, 'Invoices']}
            />
            <Area
              type="monotone"
              dataKey="invoices"
              stroke="#6366F1"
              strokeWidth={2}
              fill="url(#gradient)"
              animationBegin={0}
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
