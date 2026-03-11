import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../services/api';

export default function TopBusinessHighlight() {
  const [top, setTop] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    dashboardApi.getTopRisk()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : rows?.data ?? [];
        if (list.length > 0) setTop(list[0]);
      })
      .catch(() => {});
  }, []);

  if (!top) return null;

  const category = String(top.riskCategory || 'high').toLowerCase();
  const tone =
    category === 'high' || category === 'critical'
      ? { bg: '#FEE2E2', text: '#B91C1C', ring: '#F97373' }
      : category === 'medium'
        ? { bg: '#FEF3C7', text: '#92400E', ring: '#FBBF24' }
        : { bg: '#DCFCE7', text: '#166534', ring: '#4ADE80' };

  return (
    <div
      className="rounded-2xl border px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-sm"
      style={{
        backgroundImage: `linear-gradient(135deg, ${tone.bg}, #FFFFFF)`,
        borderColor: `${tone.ring}55`,
      }}
    >
      <div>
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Top Risk Business</p>
        <p className="text-sm md:text-base font-semibold text-[#111827] mt-1 truncate">{top.businessName}</p>
        <p className="text-xs text-[#6B7280] mt-0.5 truncate">
          GSTIN: {top.gstin} • {top.state || '—'} • {top.totalInvoices} invoices
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="px-3 py-2 rounded-full text-xs font-semibold border"
          style={{ backgroundColor: tone.bg, color: tone.text, borderColor: tone.ring }}
        >
          Risk Score {top.riskScore}
        </div>
        <button
          className="px-4 py-2 rounded-xl bg-[#111827] text-white text-xs md:text-sm font-medium hover:bg-black transition-colors"
          onClick={() => navigate(`/business/${encodeURIComponent(top.gstin)}`)}
        >
          Investigate
        </button>
      </div>
    </div>
  );
}

