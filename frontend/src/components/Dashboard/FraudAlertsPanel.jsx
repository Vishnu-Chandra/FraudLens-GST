import { useEffect, useState } from 'react';
import { dashboardApi } from '../../services/api';

const alertIcons = {
  circular: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  eway: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  itc: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

const severityColors = {
  high: { border: '#EF4444', bg: '#FEE2E2', text: '#EF4444' },
  medium: { border: '#F59E0B', bg: '#FEF3C7', text: '#F59E0B' },
  low: { border: '#22C55E', bg: '#D1FAE5', text: '#22C55E' },
};

function PanelSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function FraudAlertsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getAlerts().then((raw) => {
      setData(Array.isArray(raw) ? raw : raw?.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PanelSkeleton />;

  return (
    <div
      className="rounded-xl border border-[#E5E7EB] p-6 shadow-sm"
      style={{ background: 'linear-gradient(135deg, #FFF1F2, #FFFFFF)' }}
    >
      <h3 className="text-base font-semibold text-[#111827] mb-1">Fraud Alerts</h3>
      <p className="text-xs text-[#6B7280] mb-3">High-priority cases surfaced from reconciliation and graph analysis</p>
      <div className="space-y-3">
        {data.map((alert) => {
          const severity = (alert.severity || 'medium').toLowerCase();
          const colors = severityColors[severity] || severityColors.medium;
          const iconPath = alertIcons[alert.type] || alertIcons.itc;
          return (
            <div
              key={alert.id}
              className="flex items-start gap-4 p-4 rounded-lg border-l-4 transition-shadow hover:shadow-sm"
              style={{ borderLeftColor: colors.border, backgroundColor: `${colors.bg}40` }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: colors.bg }}
              >
                <svg className="w-5 h-5" style={{ color: colors.text }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#111827]">{alert.title}</p>
                <p className="text-sm text-[#6B7280] mt-0.5">{alert.detail}</p>
              </div>
              <span
                className="shrink-0 px-2 py-1 rounded text-xs font-medium capitalize"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {severity}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
