import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../services/api';

const riskColors = {
  high: { bg: '#FEE2E2', text: '#EF4444' },
  medium: { bg: '#FEF3C7', text: '#F59E0B' },
  low: { bg: '#D1FAE5', text: '#22C55E' },
};

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded" />
        ))}
      </div>
    </div>
  );
}

export default function TopRiskTable() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    dashboardApi.getTopRisk(10).then((raw) => {
      setData(Array.isArray(raw) ? raw : raw?.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <TableSkeleton />;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h3 className="text-base font-semibold text-[#111827]">Top Risk Businesses</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
              <th className="px-6 py-4">GSTIN</th>
              <th className="px-6 py-4">Business Name</th>
              <th className="px-6 py-4">Risk Score</th>
              <th className="px-6 py-4">Risk Category</th>
              <th className="px-6 py-4">Total Invoices</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {data.map((row, i) => {
              const category = (row.riskCategory || 'medium').toLowerCase();
              const colors = riskColors[category] || riskColors.medium;
              return (
                <tr
                  key={row.gstin || i}
                  onClick={() => navigate(`/business/${encodeURIComponent(row.gstin || '')}`)}
                  className="cursor-pointer transition-colors"
                  style={{ backgroundColor: `${colors.bg}40` }}
                >
                  <td className="px-6 py-4 text-sm font-medium text-[#2563EB] hover:underline">
                    {row.gstin}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="text-[#2563EB] font-medium hover:underline">
                      {row.businessName}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-[#111827]">{row.riskScore}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      {category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#6B7280]">{row.totalInvoices}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
