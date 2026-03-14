import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { businessApi } from '../services/api';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import EntityNode from '../components/Graph/EntityNode';

const riskPalette = {
  low: { solid: '#22C55E', soft: '#D1FAE5', text: '#166534' },
  medium: { solid: '#F59E0B', soft: '#FEF3C7', text: '#92400E' },
  high: { solid: '#EF4444', soft: '#FEE2E2', text: '#991B1B' },
};

function formatINR(value) {
  const num = Number(value || 0);
  return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function Badge({ label, tone = 'medium' }) {
  const c = riskPalette[tone] || riskPalette.medium;
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: c.soft, color: c.solid }}>
      {label}
    </span>
  );
}

function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm animate-pulse ${className}`}>
      <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="h-8 bg-gray-200 rounded w-1/2" />
    </div>
  );
}

function toRiskTone(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('low')) return 'low';
  if (c.includes('high') || c.includes('critical')) return 'high';
  return 'medium';
}

function StatusPill({ value }) {
  const v = String(value || '').toLowerCase();
  const config =
    v === 'filed' || v === 'reflected' || v === 'match' || v === 'matched'
      ? { bg: '#D1FAE5', text: '#22C55E', label: value }
      : v === 'partial' || v === 'pending'
        ? { bg: '#FEF3C7', text: '#F59E0B', label: value }
        : v === 'missing' || v === 'mismatch' || v === 'fraud'
          ? { bg: '#FEE2E2', text: '#EF4444', label: value }
          : { bg: '#E5E7EB', text: '#6B7280', label: value || 'unknown' };

  return (
    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize"
      style={{ backgroundColor: config.bg, color: config.text }}>
      {config.label}
    </span>
  );
}

function downloadCSV(filename, rows) {
  const escape = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const headers = [
    'Invoice No',
    'Supplier GSTIN',
    'Supplier Name',
    'Taxable Value',
    'GST Amount',
    'GSTR-1 Status',
    'GSTR-2B Status',
    'Books Status',
    'Status',
    'Insight',
  ];
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => ([
      r.invoice_no,
      r.supplier_gstin,
      r.supplier_name,
      r.taxable_value,
      r.gst_amount,
      r.gstr1_status,
      r.gstr2b_status,
      r.books_status,
      r.status,
      r.insight,
    ]).map(escape).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Business() {
  const { gstin } = useParams();
  const navigate = useNavigate();

  const [business, setBusiness] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [network, setNetwork] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [graphUnavailable, setGraphUnavailable] = useState(false);

  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('taxable_value');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [hover, setHover] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [reconModal, setReconModal] = useState(false);
  const [reconData, setReconData] = useState([]);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError] = useState('');

  async function openReconReport() {
    setReconModal(true);
    setReconError('');
    if (reconData.length > 0) return;
    try {
      setReconLoading(true);
      const res = await businessApi.getReconciliationReport(gstin);
      setReconData(Array.isArray(res?.report) ? res.report : []);
    } catch {
      setReconError('Failed to load reconciliation report.');
    } finally {
      setReconLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPage(1);

    Promise.all([
      businessApi.getBusiness(gstin),
      businessApi.getRisk(gstin),
      businessApi.getTransactions(gstin),
      businessApi.getNetwork(gstin),
    ]).then(([biz, risk, tx, net]) => {
      if (!alive) return;
      const merged = {
        ...biz,
        gstin: biz?.gstin || gstin,
        riskScore: (biz?.riskScore ?? biz?.risk_score ?? 0) || (risk?.score ?? 0),
        riskCategory: (biz?.riskCategory ?? biz?.risk_category) || (risk?.category ?? 'medium'),
      };
      setBusiness(merged);
      setTransactions(Array.isArray(tx?.invoices) ? tx.invoices : []);

      const netNodes = net?.nodes || net?.data?.nodes || net?.nodes || [];
      const netEdges = net?.edges || net?.data?.edges || net?.edges || [];
      setGraphUnavailable(Boolean(net?.success === false) || (Array.isArray(netNodes) && netNodes.length === 0));
      setNetwork({ nodes: netNodes, edges: netEdges });
      setSelectedNodeId(gstin);
    }).finally(() => alive && setLoading(false));

    return () => { alive = false; };
  }, [gstin]);

  const tone = toRiskTone(business?.riskCategory);
  const toneColors = riskPalette[tone];

  const riskFactors = useMemo(() => {
    // Derive from transactions as a simple heuristic (backend can later provide a dedicated endpoint)
    const factors = [];
    const mismatchCount = transactions.filter((t) => ['mismatch', 'fraud'].includes(String(t.status).toLowerCase())).length;
    const missingEway = transactions.filter((t) => (String(t.insight || '').toLowerCase().includes('e-way'))).length;
    const missingGstr1 = transactions.filter((t) => String(t.gstr1_status).toLowerCase() === 'missing').length;
    if (missingGstr1 > 0) factors.push({ key: 'gstr1', label: 'Invoice mismatch / Missing in GSTR-1', tone: 'high' });
    if (missingEway > 0) factors.push({ key: 'eway', label: 'Missing e-Way bills', tone: 'medium' });
    if (mismatchCount > 0) factors.push({ key: 'mismatch', label: 'Suspicious invoice patterns detected', tone: 'high' });
    factors.push({ key: 'circular', label: 'Circular trading indicators (graph check)', tone: 'medium' });
    return factors.slice(0, 4);
  }, [transactions]);

  const stats = useMemo(() => {
    const totalInvoices = transactions.length;
    const avgInvoice = totalInvoices ? Math.round(transactions.reduce((s, t) => s + (Number(t.taxable_value) || 0), 0) / totalInvoices) : 0;
    const buyers = new Set(transactions.map((t) => t.buyer_gstin).filter(Boolean));
    const suppliers = new Set(transactions.map((t) => t.supplier_gstin).filter(Boolean));
    return {
      totalInvoices,
      avgInvoice,
      uniqueBuyers: buyers.size || 0,
      uniqueSuppliers: suppliers.size || 0,
    };
  }, [transactions]);

  const monthly = useMemo(() => {
    const map = new Map();
    for (const t of transactions) {
      const m = t.month || 'Unknown';
      map.set(m, (map.get(m) || 0) + 1);
    }
    const preferred = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const arr = Array.from(map.entries()).map(([month, count]) => ({ month, count }));
    arr.sort((a, b) => (preferred.indexOf(a.month) - preferred.indexOf(b.month)));
    return arr.length ? arr : [
      { month: 'Jan', count: 10 },
      { month: 'Feb', count: 12 },
      { month: 'Mar', count: 35 },
      { month: 'Apr', count: 8 },
    ];
  }, [transactions]);

  // Build ReactFlow graph
  useEffect(() => {
    const center = gstin;

    const recent = transactions.slice(0, 12); // keep graph readable

    // Derive suppliers/buyers from transactions
    const suppliers = new Map();
    const buyers = new Map();
    for (const t of recent) {
      if (t.supplier_gstin) suppliers.set(t.supplier_gstin, { gstin: t.supplier_gstin, name: t.supplier_name || t.supplier_gstin });
      if (t.buyer_gstin) buyers.set(t.buyer_gstin, { gstin: t.buyer_gstin, name: t.buyer_gstin });
    }

    // If Neo4j returned business names, use them to improve labels
    const neoNodes = Array.isArray(network?.nodes) ? network.nodes : [];
    const neoNameByGstin = new Map(neoNodes.map((n) => [n.gstin, n.name]));
    for (const [k, v] of suppliers) suppliers.set(k, { ...v, name: neoNameByGstin.get(k) || v.name });
    for (const [k, v] of buyers) buyers.set(k, { ...v, name: neoNameByGstin.get(k) || v.name });

    // Center node
    const centerNode = {
      id: center,
      type: 'entity',
      position: { x: 0, y: 140 },
      data: {
        kind: 'center',
        title: (business?.name || business?.business_name || 'Business').slice(0, 10),
        subtitle: 'GSTIN',
        metaLeft: String(center).slice(0, 6),
        metaRight: `R:${business?.riskScore ?? 0}`,
        emphasis: true,
        selected: true,
        size: 86,
        meta: { gstin: center, name: business?.name || center, riskScore: business?.riskScore ?? 0, riskCategory: business?.riskCategory || 'medium', invoiceCount: recent.length },
        onClick: () => {
          setSelectedNodeId(center);
          navigate(`/business/${encodeURIComponent(center)}`);
        },
      },
    };

    const supplierNodes = Array.from(suppliers.values()).map((s, i) => {
      const id = s.gstin;
      const isSelected = id === selectedNodeId;
      return {
        id,
        type: 'entity',
        position: { x: -320, y: 40 + i * 120 },
        data: {
          kind: 'supplier',
          title: (s.name || 'SUPP').split(' ')[0].toUpperCase().slice(0, 8),
          subtitle: String(s.gstin).slice(0, 6),
          metaLeft: 'SUPP',
          size: 78,
          emphasis: isSelected,
          selected: isSelected,
          meta: { gstin: s.gstin, name: s.name, riskScore: '-', riskCategory: 'medium', invoiceCount: recent.filter((t) => t.supplier_gstin === s.gstin).length },
          onClick: () => {
            setSelectedNodeId(id);
            navigate(`/business/${encodeURIComponent(id)}`);
          },
        },
      };
    });

    const buyerNodes = Array.from(buyers.values())
      .filter((b) => b.gstin !== center)
      .map((b, i) => ({
        id: b.gstin,
        type: 'entity',
        position: { x: 320, y: 40 + i * 120 },
        data: {
          kind: 'buyer',
          title: (neoNameByGstin.get(b.gstin) || 'BUYER').split(' ')[0].toUpperCase().slice(0, 8),
          subtitle: String(b.gstin).slice(0, 6),
          metaLeft: 'BUYER',
          metaRight: recent.some((t) => t.buyer_gstin === b.gstin && String(t.gstr2b_status).toLowerCase() === 'reflected') ? 'ITC ✓' : 'ITC ?',
          size: 78,
          emphasis: b.gstin === selectedNodeId,
          selected: b.gstin === selectedNodeId,
          meta: { gstin: b.gstin, name: neoNameByGstin.get(b.gstin) || b.gstin, riskScore: '-', riskCategory: 'medium', invoiceCount: recent.filter((t) => t.buyer_gstin === b.gstin).length },
          onClick: () => {
            setSelectedNodeId(b.gstin);
            navigate(`/business/${encodeURIComponent(b.gstin)}`);
          },
        },
      }));

    // Invoice nodes sit between supplier and buyer/center
    const invoiceNodes = recent.map((t, i) => {
      const kind = (String(t.status).toLowerCase() === 'fraud' || String(t.status).toLowerCase() === 'mismatch') ? 'fraud' : 'invoice';
      const x = -60 + (i % 2) * 120;
      const y = 20 + i * 60;
      const amount = Number(t.taxable_value || 0);
      const nodeId = `inv-${t.invoice_no || i}`;
      return {
        id: nodeId,
        type: 'entity',
        position: { x, y },
        data: {
          kind: kind === 'fraud' ? 'invoice' : 'invoice',
          title: `INV-${String(t.invoice_no || '').slice(-3) || i}`,
          subtitle: amount ? `${Math.round(amount / 1000)}k` : '',
          metaLeft: kind === 'fraud' ? '⚠' : '',
          size: 70,
          emphasis: nodeId === selectedNodeId,
          selected: nodeId === selectedNodeId,
          meta: { gstin: t.supplier_gstin, name: t.invoice_no, riskScore: t.status, riskCategory: kind === 'fraud' ? 'high' : 'low', invoiceCount: 1 },
          onClick: () => {
            setSelectedNodeId(nodeId);
            setSelectedInvoice(t);
          },
        },
      };
    });

    // Optional filing node (GSTR-1)
    const filingNode = {
      id: 'gstr1',
      type: 'entity',
      position: { x: 210, y: 10 },
      data: {
        kind: 'filing',
        title: 'GSTR-1',
        subtitle: 'Filed ✓',
        size: 74,
        meta: { gstin: 'GSTR1', name: 'GSTR-1', riskScore: '-', riskCategory: 'low', invoiceCount: '-' },
        onClick: () => {},
      },
    };

    const centerEmphasis = center === selectedNodeId || !selectedNodeId;
    const allNodes = [
      {
        ...centerNode,
        data: { ...centerNode.data, emphasis: centerEmphasis },
      },
      ...supplierNodes,
      ...buyerNodes,
      ...invoiceNodes,
      filingNode,
    ];

    const edgeForStatus = (status) => {
      const s = String(status || '').toLowerCase();
      if (s === 'matched') return { color: '#22C55E', dash: undefined, label: 'matched' };
      if (s === 'partial') return { color: '#F59E0B', dash: '6 4', label: 'partial' };
      if (s === 'mismatch' || s === 'fraud') return { color: '#EF4444', dash: '6 4', label: 'mismatch' };
      return { color: '#3B82F6', dash: undefined, label: '' };
    };

    const allEdges = [];
    recent.forEach((t, i) => {
      const invId = `inv-${t.invoice_no || i}`;
      const seller = t.supplier_gstin;
      const buyer = t.buyer_gstin || center;
      const style = edgeForStatus(t.status);

      if (seller) {
        allEdges.push({
          id: `e-${seller}-${invId}-${i}`,
          source: seller,
          target: invId,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: style.color },
          animated: style.label !== 'matched',
          label: style.label ? style.label.toUpperCase() : undefined,
          labelStyle: { fill: '#6B7280', fontSize: 10, fontWeight: 700 },
          labelBgStyle: { fill: '#FFFFFF', fillOpacity: 0.92 },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 6,
          style: { stroke: style.color, strokeWidth: 2, strokeDasharray: style.dash, opacity: 0.9 },
        });
      }
      allEdges.push({
        id: `e-${invId}-${buyer}-${i}`,
        source: invId,
        target: buyer,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: style.color },
        animated: style.label !== 'matched',
        label: style.label ? style.label.toUpperCase() : undefined,
        labelStyle: { fill: '#6B7280', fontSize: 10, fontWeight: 700 },
        labelBgStyle: { fill: '#FFFFFF', fillOpacity: 0.92 },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 6,
        style: { stroke: style.color, strokeWidth: 2.2, strokeDasharray: style.dash, opacity: 0.95 },
      });

      // Invoice -> Filing hint
      allEdges.push({
        id: `e-${invId}-gstr1-${i}`,
        source: invId,
        target: 'gstr1',
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#8B5CF6' },
        style: { stroke: '#8B5CF6', strokeWidth: 1.6, opacity: 0.5 },
      });
    });

    setNodes(allNodes);
    setEdges(allEdges);
  }, [network, gstin, setEdges, setNodes, business, transactions.length, selectedNodeId, navigate]);

  const explainIssue = (inv) => {
    if (!inv) return { title: 'No invoice selected', detail: 'Click an invoice node or a table row to inspect issues.' };
    const status = String(inv.status || '').toLowerCase();
    if (status === 'matched') return { title: 'Matched', detail: 'All available sources reconcile without material anomalies.' };
    if (status === 'partial') return { title: 'Partial', detail: inv.insight || 'Partial match detected — review books vs filing alignment.' };
    if (status === 'mismatch') return { title: 'Mismatch', detail: inv.insight || 'Mismatch detected between sources (GSTR/2B/Books).' };
    if (status === 'fraud') return { title: 'Fraud risk', detail: inv.insight || 'High-risk anomaly detected — prioritize investigation.' };
    return { title: 'Needs review', detail: inv.insight || 'Potential anomaly detected.' };
  };

  const filteredSorted = useMemo(() => {
    const rows = transactions.slice();
    const filtered = statusFilter === 'all'
      ? rows
      : rows.filter((r) => String(r.status || '').toLowerCase() === statusFilter);

    filtered.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'taxable_value') return dir * ((Number(a.taxable_value) || 0) - (Number(b.taxable_value) || 0));
      if (sortKey === 'gst_amount') return dir * ((Number(a.gst_amount) || 0) - (Number(b.gst_amount) || 0));
      return dir * String(a.invoice_no || '').localeCompare(String(b.invoice_no || ''));
    });
    return filtered;
  }, [transactions, statusFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  const pageRows = filteredSorted.slice((page - 1) * pageSize, page * pageSize);

  const footerStats = useMemo(() => {
    const matched = transactions.filter((t) => String(t.status).toLowerCase() === 'matched').length;
    const mismatches = transactions.filter((t) => ['mismatch', 'fraud'].includes(String(t.status).toLowerCase())).length;
    const partial = transactions.filter((t) => String(t.status).toLowerCase() === 'partial').length;
    return { matched, mismatches, partial, total: transactions.length };
  }, [transactions]);

  const onSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard className="lg:col-span-1" />
          <SkeletonCard className="lg:col-span-2" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Business Header */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 text-white shadow-sm">
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {business?.name || business?.business_name || 'Business Investigation'}
            </h1>
            <div className="mt-2 text-sm text-white/85 flex flex-wrap gap-x-4 gap-y-1">
              <span><span className="font-semibold">GSTIN:</span> {gstin}</span>
              <span><span className="font-semibold">State:</span> {business?.state || business?.state_name || '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-white/80">Risk Score</p>
              <p className="text-3xl font-bold leading-tight">{business?.riskScore ?? business?.risk_score ?? 0}</p>
            </div>
            <div className="px-4 py-3 rounded-xl shadow-sm bg-white/10 border border-white/30">
              <p className="text-xs text-white/80">Risk Category</p>
              <p className="text-sm font-semibold uppercase">{String(business?.riskCategory || 'medium')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2 + 3: Risk factors + Stats */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div
          className="rounded-2xl border border-[#E5E7EB] p-6 shadow-sm"
          style={{ background: 'linear-gradient(135deg, #FEF3C7, #FFFFFF)' }}
        >
          <h2 className="text-base font-semibold text-[#111827]">Risk Factors</h2>
          <p className="text-sm text-[#6B7280] mt-1">Detected fraud indicators for quick triage</p>
          <div className="mt-4 space-y-3">
            {riskFactors.map((f) => (
              <div key={f.key} className="flex items-start gap-3 p-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB]">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: (riskPalette[f.tone] || riskPalette.medium).soft }}>
                  <svg className="w-5 h-5" style={{ color: (riskPalette[f.tone] || riskPalette.medium).solid }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#111827]">{f.label}</p>
                  <div className="mt-1"><Badge label={f.tone} tone={f.tone} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { label: 'Total Invoices', value: stats.totalInvoices },
            { label: 'Average Invoice Value', value: formatINR(stats.avgInvoice) },
            { label: 'Unique Buyers', value: stats.uniqueBuyers },
            { label: 'Unique Suppliers', value: stats.uniqueSuppliers },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border border-[#E5E7EB] p-6 shadow-sm hover:shadow-md transition-shadow"
              style={{ background: c.label.includes('Average') ? 'linear-gradient(135deg, #DBEAFE, #FFFFFF)' : 'linear-gradient(135deg, #F3F4F6, #FFFFFF)' }}
            >
              <p className="text-sm text-[#6B7280]">{c.label}</p>
              <p className="text-2xl font-bold text-[#111827] mt-2">{c.value}</p>
            </div>
          ))}

          {/* Investigation Actions */}
          <div
            className="md:col-span-2 rounded-2xl border border-[#E5E7EB] p-6 shadow-sm"
            style={{ background: 'linear-gradient(135deg, #EEF2FF, #FFFFFF)' }}
          >
            <h2 className="text-base font-semibold text-[#111827]">Investigation Actions</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="px-4 py-2 rounded-lg bg-[#6366F1] text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
                onClick={() => navigate('/supply-network')}
              >
                View Full Supply Network
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-white border border-[#E5E7EB] text-[#111827] text-sm font-medium hover:bg-gray-50 transition-colors"
                onClick={() => navigate(`/anomalies`)}
              >
                View Detected Anomalies
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-white border border-[#E5E7EB] text-[#111827] text-sm font-medium hover:bg-gray-50 transition-colors"
                onClick={openReconReport}
              >
                View Reconciliation Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Monthly Trading Chart */}
      <div
        className="rounded-2xl border border-[#E5E7EB] p-6 shadow-sm"
        style={{ background: 'linear-gradient(135deg, #F5F3FF, #FFFFFF)' }}
      >
        <h2 className="text-base font-semibold text-[#111827]">Monthly Trading Activity</h2>
        <p className="text-sm text-[#6B7280] mt-1">Invoice volume over time; spikes may indicate abnormal trading</p>
        <div className="h-64 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} animationDuration={600} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 5: Supply Network Graph */}
      <div
        className="rounded-2xl border border-[#E5E7EB] p-6 shadow-sm"
        style={{ background: 'linear-gradient(135deg, #ECFEFF, #FFFFFF)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#111827]">Supply Network Graph</h2>
            <p className="text-sm text-[#6B7280] mt-1">
              <span className="font-medium text-[#111827]">Arrow direction indicates invoice flow:</span>{' '}
              <span className="font-medium text-[#111827]">Seller → Buyer</span>. Supplier nodes appear left, buyers right, and invoice nodes sit in-between.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-[#6B7280]">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#6366F1' }} /> Supplier</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22C55E' }} /> Buyer</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#F59E0B' }} /> Invoice</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#8B5CF6' }} /> Filing</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><span className="w-3 h-[2px] rounded" style={{ backgroundColor: '#22C55E' }} /> matched</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-[2px] rounded border-t-2 border-dashed" style={{ borderColor: '#EF4444' }} /> mismatch/fraud</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-[2px] rounded border-t-2 border-dashed" style={{ borderColor: '#F59E0B' }} /> partial</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-2">
                <svg width="68" height="12" viewBox="0 0 68 12" className="shrink-0">
                  <line x1="2" y1="6" x2="58" y2="6" stroke="#3B82F6" strokeWidth="2" />
                  <path d="M58 2 L66 6 L58 10" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span>Seller → Buyer</span>
              </span>
            </div>
          </div>
        </div>

        <div className="relative h-[420px] mt-4 rounded-xl overflow-hidden border border-[#E5E7EB]">
          {hover && (
            <div className="absolute z-10 top-3 left-3 bg-white/95 border border-[#E5E7EB] rounded-lg shadow-sm p-3 w-72">
              <p className="text-sm font-semibold text-[#111827] truncate">{hover.name}</p>
              <p className="text-xs text-[#6B7280] mt-0.5">GSTIN: {hover.gstin}</p>
              <div className="mt-2 flex gap-2 items-center">
                <Badge label={`Risk: ${hover.riskScore}`} tone={toRiskTone(hover.riskCategory)} />
                <span className="text-xs text-[#6B7280]">Invoices: {hover.invoiceCount}</span>
              </div>
              <p className="text-[11px] text-[#6B7280] mt-2">Tip: click a node to investigate that business.</p>
            </div>
          )}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            onNodeMouseEnter={(_, n) => setHover(n.data?.meta ? n.data.meta : null)}
            onNodeMouseLeave={() => setHover(null)}
            onNodeClick={(_, n) => {
              const handler = n.data?.onClick;
              if (typeof handler === 'function') {
                handler();
              }
            }}
            nodeTypes={{ entity: EntityNode }}
          >
            <Background gap={16} color="#E5E7EB" />
            <Controls />
            <MiniMap
              nodeStrokeColor={(n) => n.style?.border?.toString()?.split(' ').slice(-1)[0] || '#6366F1'}
              nodeColor={() => '#FFFFFF'}
            />
          </ReactFlow>
        </div>
        {graphUnavailable && (
          <div className="mt-3 text-sm text-[#6B7280]">
            Graph data is currently unavailable (Neo4j not running / no relationships found). The page will still work with transactions and charts.
          </div>
        )}
      </div>

      {/* Issue details panel (click invoice node/table row) */}
      <div
        className="rounded-2xl border border-[#E5E7EB] p-6 shadow-sm"
        style={{ background: 'linear-gradient(135deg, #FFF1F2, #FFFFFF)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#111827]">Issue Details</h2>
            <p className="text-sm text-[#6B7280] mt-1">Click an invoice node (or a table row) to see why it’s flagged</p>
          </div>
          {selectedInvoice && (
            <button
              className="px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm hover:bg-gray-50"
              onClick={() => setSelectedInvoice(null)}
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
          {(() => {
            const exp = explainIssue(selectedInvoice);
            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[#111827]">{exp.title}</span>
                  {selectedInvoice?.status && <StatusPill value={selectedInvoice.status} />}
                  {selectedInvoice?.invoice_no && (
                    <span className="text-xs text-[#6B7280]">Invoice: <span className="font-medium text-[#111827]">{selectedInvoice.invoice_no}</span></span>
                  )}
                </div>
                <p className="text-sm text-[#6B7280]">{exp.detail}</p>
                {selectedInvoice && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg border border-[#E5E7EB] p-3">
                      <p className="text-xs text-[#6B7280]">GSTR-1</p>
                      <div className="mt-1"><StatusPill value={selectedInvoice.gstr1_status} /></div>
                    </div>
                    <div className="bg-white rounded-lg border border-[#E5E7EB] p-3">
                      <p className="text-xs text-[#6B7280]">GSTR-2B</p>
                      <div className="mt-1"><StatusPill value={selectedInvoice.gstr2b_status} /></div>
                    </div>
                    <div className="bg-white rounded-lg border border-[#E5E7EB] p-3">
                      <p className="text-xs text-[#6B7280]">Books</p>
                      <div className="mt-1"><StatusPill value={selectedInvoice.books_status} /></div>
                    </div>
                    <div className="bg-white rounded-lg border border-[#E5E7EB] p-3">
                      <p className="text-xs text-[#6B7280]">Amounts</p>
                      <p className="text-sm font-medium text-[#111827] mt-1">{formatINR(selectedInvoice.taxable_value)}</p>
                      <p className="text-xs text-[#6B7280] mt-0.5">GST: {formatINR(selectedInvoice.gst_amount)}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#111827]">Recent Transactions</h2>
            <p className="text-sm text-[#6B7280] mt-0.5">Audit-style view of invoices linked to this business</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm bg-white"
            >
              <option value="all">All statuses</option>
              <option value="matched">Matched</option>
              <option value="partial">Partial</option>
              <option value="mismatch">Mismatch</option>
              <option value="fraud">Fraud</option>
            </select>
            <button
              className="px-3 py-2 rounded-lg bg-[#6366F1] text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
              onClick={() => downloadCSV(`transactions-${gstin}.csv`, transactions)}
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                <th className="px-6 py-4">Invoice No</th>
                <th className="px-6 py-4">Supplier GSTIN</th>
                <th className="px-6 py-4">Supplier Name</th>
                <th className="px-6 py-4 cursor-pointer select-none" onClick={() => onSort('taxable_value')}>
                  Taxable Value {sortKey === 'taxable_value' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="px-6 py-4 cursor-pointer select-none" onClick={() => onSort('gst_amount')}>
                  GST Amount {sortKey === 'gst_amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="px-6 py-4">GSTR-1</th>
                <th className="px-6 py-4">GSTR-2B</th>
                <th className="px-6 py-4">Books</th>
                <th className="px-6 py-4">Overall</th>
                <th className="px-6 py-4">Graph Insight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {pageRows.map((inv, i) => (
                <tr
                  key={`${inv.invoice_no}-${i}`}
                  className="hover:bg-indigo-50/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedInvoice(inv)}
                >
                  <td className="px-6 py-4 text-sm font-medium text-[#111827]">{inv.invoice_no}</td>
                  <td className="px-6 py-4 text-sm text-[#6366F1] font-medium">{inv.supplier_gstin}</td>
                  <td className="px-6 py-4 text-sm text-[#111827]">
                    {inv.supplier_name}{String(inv.supplier_name || '').toLowerCase().includes('unknown') ? ' ⚠' : ''}
                  </td>
                  <td className="px-6 py-4 text-sm text-[#111827]">{formatINR(inv.taxable_value)}</td>
                  <td className="px-6 py-4 text-sm text-[#111827]">{formatINR(inv.gst_amount)}</td>
                  <td className="px-6 py-4"><StatusPill value={inv.gstr1_status} /></td>
                  <td className="px-6 py-4"><StatusPill value={inv.gstr2b_status} /></td>
                  <td className="px-6 py-4"><StatusPill value={inv.books_status} /></td>
                  <td className="px-6 py-4"><StatusPill value={inv.status} /></td>
                  <td className="px-6 py-4 text-sm text-[#6B7280] max-w-[340px] truncate">{inv.insight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer stats + pagination */}
        <div className="px-6 py-4 border-t border-[#E5E7EB] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm text-[#6B7280]">
            Showing <span className="font-medium text-[#111827]">{Math.min(page * pageSize, filteredSorted.length)}</span> of{' '}
            <span className="font-medium text-[#111827]">{filteredSorted.length}</span>
            <span className="ml-4 inline-flex gap-3">
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22C55E' }} /> {footerStats.matched} matched</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#F59E0B' }} /> {footerStats.partial} partial</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#EF4444' }} /> {footerStats.mismatches} mismatches</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="text-sm text-[#6B7280]">Page <span className="font-medium text-[#111827]">{page}</span> / {pageCount}</span>
            <button
              className="px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Reconciliation Report Modal */}
      {reconModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <div>
                <h2 className="text-base font-semibold text-[#111827]">Reconciliation Report</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">Invoice-level cross-check against GSTR-1, GSTR-3B &amp; e-Way bills</p>
              </div>
              <button
                onClick={() => setReconModal(false)}
                className="text-[#6B7280] hover:text-[#111827] transition-colors text-xl font-bold leading-none"
              >
                &times;
              </button>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              {reconLoading && (
                <div className="flex items-center justify-center py-16 text-[#6B7280] text-sm">Loading report…</div>
              )}
              {reconError && (
                <div className="flex items-center justify-center py-16 text-red-500 text-sm">{reconError}</div>
              )}
              {!reconLoading && !reconError && reconData.length === 0 && (
                <div className="flex items-center justify-center py-16 text-[#6B7280] text-sm">No invoices found for this GSTIN.</div>
              )}
              {!reconLoading && !reconError && reconData.length > 0 && (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#F9FAFB] text-left">
                      <th className="px-3 py-2 font-medium text-[#374151] border-b border-[#E5E7EB]">Invoice ID</th>
                      <th className="px-3 py-2 font-medium text-[#374151] border-b border-[#E5E7EB]">Seller GSTIN</th>
                      <th className="px-3 py-2 font-medium text-[#374151] border-b border-[#E5E7EB]">Buyer GSTIN</th>
                      <th className="px-3 py-2 font-medium text-[#374151] border-b border-[#E5E7EB]">Risk Score</th>
                      <th className="px-3 py-2 font-medium text-[#374151] border-b border-[#E5E7EB]">Status</th>
                      <th className="px-3 py-2 font-medium text-[#374151] border-b border-[#E5E7EB]">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconData.map((row, i) => {
                      const tone = row.status === 'HIGH' ? 'high' : row.status === 'MEDIUM' ? 'medium' : 'low';
                      const c = riskPalette[tone];
                      return (
                        <tr key={i} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors">
                          <td className="px-3 py-2 text-[#111827] font-mono text-xs">{row.invoice_id}</td>
                          <td className="px-3 py-2 text-[#374151] font-mono text-xs">{row.seller}</td>
                          <td className="px-3 py-2 text-[#374151] font-mono text-xs">{row.buyer}</td>
                          <td className="px-3 py-2 font-semibold" style={{ color: c.solid }}>{row.riskScore}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: c.soft, color: c.solid }}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[#6B7280] text-xs">
                            {row.issues && row.issues.length > 0
                              ? row.issues.map((issue, j) => (
                                  <span key={j} className="inline-flex mr-1 mb-0.5 px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] text-xs">{issue}</span>
                                ))
                              : <span className="text-[#22C55E]">No issues</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-3 border-t border-[#E5E7EB] flex justify-between items-center text-xs text-[#6B7280]">
              <span>{reconData.length} invoice(s) checked</span>
              <button
                onClick={() => setReconModal(false)}
                className="px-4 py-1.5 rounded-lg border border-[#E5E7EB] text-[#374151] hover:bg-gray-50 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

