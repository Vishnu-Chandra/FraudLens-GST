import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { caseApi } from '../services/api';

const statusOptions = ['OPEN', 'UNDER_INVESTIGATION', 'EVIDENCE_COLLECTED', 'ESCALATED', 'CLOSED'];

export default function CaseDetails() {
  const navigate = useNavigate();
  const { caseId } = useParams();

  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState('OPEN');
  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteText, setNoteText] = useState('');
  const isAdmin = true;

  useEffect(() => {
    loadDetails();
  }, [caseId]);

  async function loadDetails() {
    try {
      setLoading(true);
      setError('');
      const res = await caseApi.getCase(caseId);
      setCaseData(res?.data || null);
      setStatus(res?.data?.status || 'OPEN');
      setTitleDraft(res?.data?.title || '');
    } catch (err) {
      console.error('Error loading case details:', err);
      setError(err?.response?.data?.message || 'Unable to load case details');
    } finally {
      setLoading(false);
    }
  }

  async function updateCaseStatus() {
    try {
      setUpdating(true);
      setError('');
      await caseApi.updateCase(caseId, { status });
      await loadDetails();
    } catch (err) {
      console.error('Error updating case status:', err);
      setError(err?.response?.data?.message || 'Unable to update case status');
    } finally {
      setUpdating(false);
    }
  }

  async function updateCaseTitle() {
    const trimmedTitle = String(titleDraft || '').trim();
    if (trimmedTitle.length < 5) {
      setError('Title must be at least 5 characters long');
      return;
    }

    try {
      setUpdating(true);
      setError('');
      await caseApi.updateCase(caseId, { title: trimmedTitle });
      await loadDetails();
      setIsEditingTitle(false);
    } catch (err) {
      console.error('Error updating case title:', err);
      setError(err?.response?.data?.message || 'Unable to update case title');
    } finally {
      setUpdating(false);
    }
  }

  async function deleteCurrentCase() {
    if (!window.confirm(`Delete case ${caseData?.case_id || caseId}? This action cannot be undone.`)) return;

    try {
      setDeleting(true);
      setError('');
      await caseApi.deleteCase(caseId);
      navigate('/cases');
    } catch (err) {
      console.error('Error deleting case:', err);
      setError(err?.response?.data?.message || 'Unable to delete case');
    } finally {
      setDeleting(false);
    }
  }

  async function addNote(e) {
    e.preventDefault();
    try {
      setUpdating(true);
      setError('');
      await caseApi.addNote(caseId, { author: noteAuthor, note: noteText });
      setNoteText('');
      await loadDetails();
    } catch (err) {
      console.error('Error adding note:', err);
      setError(err?.response?.data?.message || 'Unable to add note');
    } finally {
      setUpdating(false);
    }
  }

  const anomalies = useMemo(() => caseData?.linkedAnomaliesData || [], [caseData]);
  const visibleNotes = useMemo(() => {
    const notes = Array.isArray(caseData?.notes) ? caseData.notes : [];
    return notes.filter((n) => {
      const author = String(n?.author || '').trim().toLowerCase();
      const note = String(n?.note || '').trim().toLowerCase();
      return !(author === 'system' && note.startsWith('auto-created initial case using'));
    });
  }, [caseData?.notes]);
  const businessNameByGstin = useMemo(() => {
    const map = new Map();
    anomalies.forEach((a) => {
      if (a?.businessGstin && a?.businessName) {
        map.set(a.businessGstin, a.businessName);
      }
    });
    return map;
  }, [anomalies]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-indigo-700 to-purple-700 text-white p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/80">Case ID</p>
            <h1 className="text-2xl font-bold">{caseData?.case_id || caseId}</h1>
            {isEditingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="mt-2 w-full max-w-xl px-3 py-2 rounded-lg text-slate-900 border border-white/40"
              />
            ) : (
              <p className="text-sm text-white/90 mt-1">{caseData?.title || 'Investigation Case Details'}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && !isEditingTitle && (
              <button
                onClick={() => {
                  setTitleDraft(caseData?.title || '');
                  setIsEditingTitle(true);
                }}
                className="h-9 w-9 rounded-lg bg-white/20 hover:bg-white/30 text-white text-lg font-bold"
                title="Edit title"
              >
                ✎
              </button>
            )}
            {isAdmin && isEditingTitle && (
              <>
                <button
                  onClick={updateCaseTitle}
                  disabled={updating}
                  className="h-9 w-9 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white text-lg font-bold disabled:opacity-50"
                  title="Save title"
                >
                  ✓
                </button>
                <button
                  onClick={() => {
                    setIsEditingTitle(false);
                    setTitleDraft(caseData?.title || '');
                  }}
                  className="h-9 w-9 rounded-lg bg-white/20 hover:bg-white/30 text-white text-lg font-bold"
                  title="Cancel edit"
                >
                  ✕
                </button>
              </>
            )}
            {isAdmin && (
              <button
                onClick={deleteCurrentCase}
                disabled={deleting}
                className="h-9 w-9 rounded-lg bg-red-500/90 hover:bg-red-500 text-white text-lg font-bold disabled:opacity-50"
                title="Delete case"
              >
                🗑
              </button>
            )}
            <button onClick={() => navigate('/cases')} className="px-4 py-2 rounded-xl bg-white text-indigo-700 font-bold text-sm">← Back to Cases</button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">Loading case details...</div>
      ) : !caseData ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">Case not found.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Info label="Priority" value={caseData.priority} />
            <Info label="Status" value={caseData.status} />
            <Info label="Investigator" value={caseData.investigator} />
            <Info label="Created" value={new Date(caseData.created_at).toLocaleDateString()} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <section className="bg-white rounded-2xl border-2 border-indigo-200 p-5 shadow-lg">
                <h2 className="text-base font-bold text-gray-900">Case Information</h2>
                <p className="text-sm text-gray-700 mt-3">{caseData.description || 'No description provided.'}</p>
              </section>

              <section className="bg-white rounded-2xl border-2 border-blue-200 p-5 shadow-lg">
                <h2 className="text-base font-bold text-gray-900">Businesses Involved</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(caseData.businesses || []).map((gstin) => (
                    <span key={gstin} className="inline-flex px-3 py-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                      {businessNameByGstin.get(gstin) ? `${businessNameByGstin.get(gstin)} (${gstin})` : `Business (${gstin})`}
                    </span>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-2xl border-2 border-amber-200 p-5 shadow-lg">
                <h2 className="text-base font-bold text-gray-900">Linked Anomalies</h2>
                {anomalies.length === 0 ? (
                  <p className="text-sm text-gray-600 mt-3">No linked anomaly details available.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {anomalies.map((a) => (
                      <div key={a._id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-sm font-semibold text-gray-900">{a.businessName} ({a.riskLevel})</p>
                        <p className="text-xs text-gray-700 mt-0.5">{a.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <section className="bg-white rounded-2xl border-2 border-green-200 p-5 shadow-lg">
                <h2 className="text-base font-bold text-gray-900">Case Actions</h2>
                <div className="mt-3 space-y-2">
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-sm">
                    {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={updateCaseStatus} disabled={updating} className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                    {updating ? 'Updating...' : 'Update Status'}
                  </button>
                </div>
              </section>

              <section className="bg-white rounded-2xl border-2 border-purple-200 p-5 shadow-lg">
                <h2 className="text-base font-bold text-gray-900">Investigation Notes</h2>
                <form className="mt-3 space-y-2" onSubmit={addNote}>
                  <input
                    required
                    placeholder="Author"
                    value={noteAuthor}
                    onChange={(e) => setNoteAuthor(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-sm"
                  />
                  <textarea
                    required
                    rows={3}
                    placeholder="Add an investigation note"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-sm"
                  />
                  <button disabled={updating} type="submit" className="w-full px-4 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 disabled:opacity-50">
                    Add Note
                  </button>
                </form>

                <div className="mt-4 space-y-2 max-h-72 overflow-auto pr-1">
                  {visibleNotes.length === 0 ? (
                    <p className="text-sm text-gray-600">No notes yet.</p>
                  ) : (
                    [...visibleNotes].reverse().map((n, idx) => (
                      <div key={`${n.timestamp}-${idx}`} className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2">
                        <p className="text-xs font-bold text-purple-800">{n.author} • {new Date(n.timestamp).toLocaleString()}</p>
                        <p className="text-sm text-gray-800 mt-1">{n.note}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-gray-600 font-semibold">{label}</p>
      <p className="text-sm font-bold text-gray-900 mt-1">{value || '—'}</p>
    </div>
  );
}
