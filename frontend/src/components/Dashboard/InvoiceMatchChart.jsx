import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { dashboardApi } from '../../services/api';

const COLORS = ['#22C55E', '#F59E0B', '#EF4444', '#6366F1'];

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/2 mb-6" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );
}

export default function InvoiceMatchChart() {
  const [data, setData] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getInvoiceMatch().then((raw) => {
      const rows = [
        { name: 'Matched Invoices', value: raw.matched ?? 0 },
        { name: 'Missing in GSTR-1', value: raw.missingGstr1 ?? 0 },
        { name: 'Missing e-Way Bill', value: raw.missingEwayBill ?? 0 },
        { name: 'Fully Verified', value: raw.fullyVerified ?? 0 },
      ].filter((d) => d.value > 0);

      setTotal(rows.reduce((sum, row) => sum + row.value, 0));
      setData(rows);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartSkeleton />;

  return (
    <div
      className="rounded-xl border border-[#E5E7EB] p-6 shadow-sm"
      style={{ background: 'linear-gradient(135deg, #EEF2FF, #FFFFFF)' }}
    >
      <h3 className="text-base font-semibold text-[#111827] mb-1">Invoice Reconciliation Status</h3>
      <p className="text-xs text-[#6B7280] mb-4">Matched vs missing invoices across filings and e-Way bills</p>
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
                return [`${value} invoices (${percentage}%)`, ''];
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
