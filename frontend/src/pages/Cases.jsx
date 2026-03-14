import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { anomalyApi, caseApi, investigationApi } from '../services/api';

const defaultForm = {
  title: '',
  description: '',
  businesses: [],
  linked_anomalies: [],
  priority: 'MEDIUM',
  investigator: '',
};

export default function Cases() {
  const navigate = useNavigate();
  const location = useLocation();
  const handledPrefillRef = useRef('');

  const [summary, setSummary] = useState({ total: 0, open: 0, underInvestigation: 0, closed: 0 });
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [businessOptions, setBusinessOptions] = useState([]);
  const [anomalyOptions, setAnomalyOptions] = useState([]);
  const [investigatorOptions, setInvestigatorOptions] = useState([]);
  const [error, setError] = useState('');
  const [businessQuery, setBusinessQuery] = useState('');
  const [anomalyQuery, setAnomalyQuery] = useState('');

  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    investigator: '',
    page: 1,
    limit: 20,
  });
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    loadPageData();
  }, [filters]);

  useEffect(() => {
    loadCreateOptions();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const business = params.get('business');
    const anomaly = params.get('anomaly');
    const token = `${business || ''}|${anomaly || ''}`;

    if ((business || anomaly) && handledPrefillRef.current !== token) {
      handledPrefillRef.current = token;
      setForm((prev) => ({
        ...prev,
        title: anomaly ? 'Anomaly Investigation Case' : 'Business Risk Investigation',
        businesses: business ? [...new Set([...(prev.businesses || []), business])] : prev.businesses,
        linked_anomalies: anomaly ? [...new Set([...(prev.linked_anomalies || []), anomaly])] : prev.linked_anomalies,
      }));
      setShowCreate(true);
      // Consume prefill query params once so refresh won't re-open modal.
      navigate('/cases', { replace: true });
    }
  }, [location.search, navigate]);

  async function loadPageData() {
    try {
      setLoading(true);
      setError('');
      const payloadFilters = {
        page: filters.page,
        limit: filters.limit,
      };
      if (filters.status !== 'all') payloadFilters.status = filters.status;
      if (filters.priority !== 'all') payloadFilters.priority = filters.priority;
      if (filters.investigator.trim()) payloadFilters.investigator = filters.investigator.trim();

      const [summaryRes, listRes] = await Promise.all([
        caseApi.getSummary(),
        caseApi.listCases(payloadFilters),
      ]);

      setSummary(summaryRes?.data || { total: 0, open: 0, underInvestigation: 0, closed: 0 });
      setCases(listRes?.data || []);
      setMeta(listRes?.meta || { page: 1, limit: 20, total: 0, pages: 1 });
    } catch (err) {
      console.error('Error loading cases:', err);
      setError('Unable to load case data. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function loadCreateOptions() {
    try {
      const [biz, anomalies, investigators] = await Promise.all([
        investigationApi.getBusinesses({ limit: 100 }),
        anomalyApi.getAnomalies({ limit: 200 }),
        caseApi.getInvestigators(),
      ]);

      setBusinessOptions((biz || []).map((b) => ({
        gstin: b.gstin,
        name: b.businessName || b.gstin,
      })));

      setAnomalyOptions((anomalies?.data || []).map((a) => ({
        id: a._id,
        label: `${a.businessName} (${a.riskLevel})`,
      })));

      setInvestigatorOptions(investigators?.data || []);
    } catch (err) {
      console.error('Error loading create options:', err);
      setInvestigatorOptions([]);
    }
  }

  async function handleCreateCase(e) {
    e.preventDefault();

    try {
      setCreating(true);
      setError('');
      const payload = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        investigator: form.investigator.trim(),
      };
      const created = await caseApi.createCase(payload);
      setShowCreate(false);
      setForm(defaultForm);
      await loadPageData();
      navigate(`/cases/${encodeURIComponent(created?.data?.case_id)}`);
    } catch (err) {
      console.error('Error creating case:', err);
      setError(err?.response?.data?.message || 'Unable to create case. Please check the form fields.');
    } finally {
      setCreating(false);
    }
  }

  const rows = useMemo(() => cases || [], [cases]);
  const businessMap = useMemo(
    () => new Map((businessOptions || []).map((b) => [b.gstin, `${b.name} (${b.gstin})`])),
    [businessOptions]
  );
  const anomalyMap = useMemo(
    () => new Map((anomalyOptions || []).map((a) => [a.id, a.label])),
    [anomalyOptions]
  );
  const filteredBusinessOptions = useMemo(() => {
    const q = businessQuery.trim().toLowerCase();
    if (!q) return businessOptions;
    return businessOptions.filter((b) => `${b.name} ${b.gstin}`.toLowerCase().includes(q));
  }, [businessOptions, businessQuery]);
  const filteredAnomalyOptions = useMemo(() => {
    const q = anomalyQuery.trim().toLowerCase();
    if (!q) return anomalyOptions;
    return anomalyOptions.filter((a) => a.label.toLowerCase().includes(q));
  }, [anomalyOptions, anomalyQuery]);

  const toggleMultiValue = (field, value) => {
    setForm((prev) => {
      const current = Array.isArray(prev[field]) ? prev[field] : [];
      const exists = current.includes(value);
      return {
        ...prev,
        [field]: exists ? current.filter((v) => v !== value) : [...current, value],
      };
    });
  };

  const priorityClass = (priority) => {
    switch (priority) {
      case 'CRITICAL': return 'bg-red-100 text-red-700 border-red-300';
      case 'HIGH': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      default: return 'bg-green-100 text-green-700 border-green-300';
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-slate-700 via-indigo-700 to-blue-700 text-white p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Case Investigation System</h1>
            <p className="text-sm text-white/90 mt-1">Organize anomalies into investigation cases, assign investigators, and track lifecycle to closure.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 rounded-xl bg-white text-indigo-700 font-bold text-sm hover:bg-indigo-50"
          >
            + Create Case
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Total Cases" value={summary.total} color="from-slate-100 to-slate-200" />
        <Card title="Open Cases" value={summary.open} color="from-blue-100 to-blue-200" />
        <Card title="Under Investigation" value={summary.underInvestigation} color="from-orange-100 to-orange-200" />
        <Card title="Closed Cases" value={summary.closed} color="from-green-100 to-green-200" />
      </div>

      <div className="bg-white rounded-2xl border-2 border-indigo-200 p-4 shadow-lg space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value, page: 1 }))}
            className="px-3 py-2.5 rounded-xl border-2 border-indigo-200 text-sm"
          >
            <option value="all">All Status</option>
            <option value="OPEN">OPEN</option>
            <option value="UNDER_INVESTIGATION">UNDER_INVESTIGATION</option>
            <option value="EVIDENCE_COLLECTED">EVIDENCE_COLLECTED</option>
            <option value="ESCALATED">ESCALATED</option>
            <option value="CLOSED">CLOSED</option>
          </select>

          <select
            value={filters.priority}
            onChange={(e) => setFilters((p) => ({ ...p, priority: e.target.value, page: 1 }))}
            className="px-3 py-2.5 rounded-xl border-2 border-indigo-200 text-sm"
          >
            <option value="all">All Priority</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>

          <select
            value={filters.investigator}
            onChange={(e) => setFilters((p) => ({ ...p, investigator: e.target.value, page: 1 }))}
            className="px-3 py-2.5 rounded-xl border-2 border-indigo-200 text-sm"
          >
            <option value="">All Investigators</option>
            {investigatorOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <button
            onClick={() => setFilters({ status: 'all', priority: 'all', investigator: '', page: 1, limit: 20 })}
            className="px-3 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold hover:bg-gray-200"
          >
            Reset Filters
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2 border-gray-200 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">Case ID</th>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Businesses Involved</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Investigator</th>
                <th className="px-4 py-3 text-left">Created Date</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading cases...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No cases found</td></tr>
              ) : rows.map((c) => (
                <tr key={c.case_id} className="hover:bg-indigo-50/50">
                  <td className="px-4 py-3 text-sm font-bold text-indigo-700">{c.case_id}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{c.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{(c.businesses || []).slice(0, 2).join(', ')}{(c.businesses || []).length > 2 ? ` +${c.businesses.length - 2}` : ''}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${priorityClass(c.priority)}`}>
                      {c.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-gray-700">{c.status}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{c.investigator}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/cases/${encodeURIComponent(c.case_id)}`)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-gray-600">Page {meta.page} of {meta.pages || 1} • {meta.total} total</span>
          <div className="flex items-center gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}
              className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-50"
            >Prev</button>
            <button
              disabled={meta.page >= meta.pages}
              onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
              className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-50"
            >Next</button>
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-indigo-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-indigo-100 flex items-start justify-between bg-gradient-to-r from-indigo-50 via-sky-50 to-cyan-50">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Create Investigation Case</h2>
                <p className="text-sm text-slate-600 mt-1">Build a case from real anomalies and assign an investigator.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800">Businesses: {form.businesses.length}</span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800">Anomalies: {form.linked_anomalies.length}</span>
                </div>
              </div>
              <button onClick={() => setShowCreate(false)} className="h-9 w-9 rounded-full bg-white border border-indigo-100 text-slate-500 hover:text-slate-800 hover:bg-slate-50">✕</button>
            </div>

            <form className="max-h-[75vh] overflow-y-auto p-6 space-y-5 bg-gradient-to-b from-white to-slate-50/40" onSubmit={handleCreateCase}>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label className="text-sm font-semibold text-gray-700">Case Title</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-indigo-400"
                  placeholder="Example: Circular Trading Investigation - Surat Cluster"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label className="text-sm font-semibold text-gray-700">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-indigo-400"
                  placeholder="Capture scope, objective, and suspected fraud pattern..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="min-w-0">
                  <label className="text-sm font-semibold text-gray-700">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-indigo-400">
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="text-sm font-semibold text-gray-700">Investigator</label>
                  <select
                    required
                    value={form.investigator}
                    onChange={(e) => setForm((p) => ({ ...p, investigator: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-indigo-400"
                  >
                    <option value="">Select investigator</option>
                    {investigatorOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  {investigatorOptions.length === 0 && (
                    <p className="text-xs text-amber-700 mt-1">No officers found in database. Please refresh after backend initialization.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-gray-700">Businesses Involved</label>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Selected: {form.businesses.length}</span>
                </div>
                <input
                  value={businessQuery}
                  onChange={(e) => setBusinessQuery(e.target.value)}
                  placeholder="Search business by name or GSTIN"
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-indigo-400"
                />
                <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border-2 border-gray-200 bg-gray-50">
                  {filteredBusinessOptions.map((b) => (
                    <label key={b.gstin} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-b-0">
                      <input
                        type="checkbox"
                        checked={form.businesses.includes(b.gstin)}
                        onChange={() => toggleMultiValue('businesses', b.gstin)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                      />
                      <span>{b.name} ({b.gstin})</span>
                    </label>
                  ))}
                  {filteredBusinessOptions.length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-500">No businesses match your search.</p>
                  )}
                </div>
                {form.businesses.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.businesses.map((gstin) => (
                      <span key={gstin} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-800 border border-indigo-200">
                        {businessMap.get(gstin) || gstin}
                        <button type="button" onClick={() => toggleMultiValue('businesses', gstin)} className="font-bold">x</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-gray-700">Linked Anomalies</label>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Selected: {form.linked_anomalies.length}</span>
                </div>
                <input
                  value={anomalyQuery}
                  onChange={(e) => setAnomalyQuery(e.target.value)}
                  placeholder="Search anomaly by business or risk"
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-rose-400"
                />
                <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border-2 border-gray-200 bg-gray-50">
                  {filteredAnomalyOptions.map((a) => (
                    <label key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-rose-50 cursor-pointer border-b border-gray-100 last:border-b-0">
                      <input
                        type="checkbox"
                        checked={form.linked_anomalies.includes(a.id)}
                        onChange={() => toggleMultiValue('linked_anomalies', a.id)}
                        className="h-4 w-4 rounded border-gray-300 text-rose-600"
                      />
                      <span>{a.label}</span>
                    </label>
                  ))}
                  {filteredAnomalyOptions.length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-500">No anomalies match your search.</p>
                  )}
                </div>
                {form.linked_anomalies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.linked_anomalies.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-rose-100 text-rose-800 border border-rose-200">
                        {anomalyMap.get(id) || id}
                        <button type="button" onClick={() => toggleMultiValue('linked_anomalies', id)} className="font-bold">x</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 -mx-6 px-6 py-4 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-gray-300 font-semibold hover:bg-gray-50">Cancel</button>
                <button disabled={creating || investigatorOptions.length === 0} type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 shadow-md">
                  {creating ? 'Creating...' : 'Create Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, value, color }) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${color} border border-white/70 p-4 shadow-md`}>
      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value || 0}</p>
    </div>
  );
}
