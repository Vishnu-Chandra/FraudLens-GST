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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getItcStatus().then((raw) => {
      setData([
        { name: 'Valid ITC', value: raw.valid ?? 0 },
        { name: 'Suspicious ITC', value: raw.suspicious ?? 0 },
        { name: 'High Risk ITC', value: raw.highRisk ?? 0 },
      ].filter((d) => d.value > 0));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartSkeleton />;

  return (
    <div
      className="rounded-xl border border-[#E5E7EB] p-6 shadow-sm"
      style={{ background: 'linear-gradient(135deg, #ECFEFF, #FFFFFF)' }}
    >
      <h3 className="text-base font-semibold text-[#111827] mb-1">Input Tax Credit Risk Analysis</h3>
      <p className="text-xs text-[#6B7280] mb-4">Distribution of valid, suspicious, and high-risk ITC</p>
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
            <Tooltip formatter={(v) => [`${v}%`, '']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
