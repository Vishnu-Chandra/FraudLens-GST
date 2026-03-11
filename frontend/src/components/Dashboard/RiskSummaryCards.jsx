import { useEffect, useState } from 'react';
import { dashboardApi } from '../../services/api';

const riskConfig = {
  total: { label: 'Total Businesses', color: '#6366F1', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  highRisk: { label: 'High Risk Businesses', color: '#EF4444', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  mediumRisk: { label: 'Medium Risk Businesses', color: '#F59E0B', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  lowRisk: { label: 'Low Risk Businesses', color: '#22C55E', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
};

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm animate-pulse">
      <div className="h-10 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="h-8 bg-gray-200 rounded w-1/4" />
    </div>
  );
}

export default function RiskSummaryCards() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getRiskSummary().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const keys = ['total', 'highRisk', 'mediumRisk', 'lowRisk'];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {keys.map((key) => {
        const config = riskConfig[key];
        const value = data?.[key] ?? 0;
        return (
          <div
            key={key}
            className="rounded-xl border p-6 shadow-sm hover:shadow-md transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              backgroundImage: `linear-gradient(135deg, ${config.color}10, #FFFFFF)`,
              borderColor: `${config.color}33`,
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-[#6B7280]">{config.label}</p>
                <p className="text-3xl font-bold text-[#111827] mt-1">{value}</p>
              </div>
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${config.color}15` }}
              >
                <svg className="w-5 h-5" style={{ color: config.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
                </svg>
              </div>
            </div>
            <div className="mt-3 h-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (value / (data?.total || 1)) * 100)}%`, backgroundColor: config.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
