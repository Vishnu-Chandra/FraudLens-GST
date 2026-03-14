import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { anomalyApi } from '../services/api';

export default function Anomalies() {
  const navigate = useNavigate();
  const [anomalies, setAnomalies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [liveFeatures, setLiveFeatures] = useState(null);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [filters, setFilters] = useState({
    type: 'all',
    riskLevel: 'all',
    status: 'all',
  });

  useEffect(() => {
    loadData();
  }, [filters]);

  useEffect(() => {
    async function loadLiveFeatures() {
      if (!selectedAnomaly?.businessGstin) {
        setLiveFeatures(null);
        return;
      }

      try {
        setFeaturesLoading(true);
        const response = await anomalyApi.getFeatures(selectedAnomaly.businessGstin);
        setLiveFeatures(response?.data || null);
      } catch (error) {
        console.error('Error loading live features:', error);
        setLiveFeatures(null);
      } finally {
        setFeaturesLoading(false);
      }
    }

    loadLiveFeatures();
  }, [selectedAnomaly]);

  async function loadData() {
    try {
      setLoading(true);
      
      // Build filters object, excluding 'all' values
      const apiFilters = {};
      if (filters.type !== 'all') apiFilters.type = filters.type;
      if (filters.riskLevel !== 'all') apiFilters.riskLevel = filters.riskLevel;
      if (filters.status !== 'all') apiFilters.status = filters.status;
      
      const [anomaliesData, statsData] = await Promise.all([
        anomalyApi.getAnomalies(apiFilters),
        anomalyApi.getStats(),
      ]);
      
      setAnomalies(anomaliesData.data || []);
      setStats(statsData.data || null);
    } catch (error) {
      console.error('Error loading anomalies:', error);
      showNotification('Error loading anomalies. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(anomalyId, newStatus) {
    try {
      setActionLoading(true);
      await anomalyApi.updateStatus(anomalyId, { status: newStatus });
      showNotification(`Anomaly ${newStatus.toLowerCase()} successfully!`, 'success');
      await loadData();
      setSelectedAnomaly(null);
    } catch (error) {
      console.error('Error updating status:', error);
      showNotification('Error updating anomaly status. Please try again.', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRunDetection() {
    try {
      showNotification('Running fraud detection on all businesses...', 'info');
      setActionLoading(true);
      await anomalyApi.batchDetect([]);  // Empty array = detect for all businesses
      showNotification('Fraud detection completed! Refreshing results...', 'success');
      await loadData();
    } catch (error) {
      console.error('Error running detection:', error);
      showNotification('Error running fraud detection. Please try again.', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  function showNotification(message, type = 'info') {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }

  function exportToCSV() {
    const headers = ['Business', 'GSTIN', 'Anomaly Type', 'Risk Level', 'Fraud Probability', 'Status', 'Detected At'];
    const rows = filteredAnomalies.map(a => [
      a.businessName,
      a.businessGstin,
      a.type,
      a.riskLevel,
      (a.fraudProbability * 100).toFixed(1) + '%',
      a.status,
      new Date(a.detectedAt).toLocaleString()
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anomalies_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showNotification('Anomalies exported successfully!', 'success');
  }

  // Filter anomalies by search term
  const filteredAnomalies = anomalies.filter(anomaly =>
    anomaly.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    anomaly.businessGstin.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRiskColor = (level) => {
    switch (level) {
      case 'HIGH':
      case 'CRITICAL':
        return 'text-red-700 bg-red-100 border-red-300';
      case 'MEDIUM':
        return 'text-orange-700 bg-orange-100 border-orange-300';
      case 'LOW':
        return 'text-green-700 bg-green-100 border-green-300';
      default:
        return 'text-gray-700 bg-gray-100 border-gray-300';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'AI_PREDICTION':
        return '🤖';
      case 'GRAPH_ANALYSIS':
        return '🌐';
      case 'RULE_BASED':
        return '📋';
      case 'MANUAL':
        return '👤';
      default:
        return '⚠️';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'AI_PREDICTION':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'GRAPH_ANALYSIS':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'RULE_BASED':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'MANUAL':
        return 'bg-gray-50 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getTypeLabel = (anomaly) => {
    if (anomaly.type === 'AI_PREDICTION') return 'ML Prediction';

    return (anomaly.title || anomaly.type || '')
      .replace(/AI Prediction/gi, 'ML Prediction')
      .replace(/AI_PREDICTION/g, 'ML Prediction')
      .replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl border-2 animate-slide-in-right ${
          notification.type === 'success' ? 'bg-green-100 border-green-500 text-green-900' :
          notification.type === 'error' ? 'bg-red-100 border-red-500 text-red-900' :
          'bg-blue-100 border-blue-500 text-blue-900'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {notification.type === 'success' ? '✅' : notification.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span className="font-semibold">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-red-600 via-orange-500 to-pink-500 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>
        <div className="relative p-6 md:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">AI-Powered Anomaly Detection</h1>
          </div>
          <p className="text-sm text-white/90 leading-relaxed max-w-2xl">
            🔍 Intelligent fraud detection combining rule-based analysis, supply network patterns, and machine learning predictions
          </p>
          
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-xl p-4">
                <p className="text-xs text-white/90 font-semibold uppercase tracking-wide">Total Anomalies</p>
                <p className="text-3xl font-bold mt-1">{stats.total || 0}</p>
              </div>
              <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-xl p-4">
                <p className="text-xs text-white/90 font-semibold uppercase tracking-wide">High Risk</p>
                <p className="text-3xl font-bold mt-1">{stats.highRisk ?? stats.byRiskLevel?.HIGH ?? 0}</p>
              </div>
              <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-xl p-4">
                <p className="text-xs text-white/90 font-semibold uppercase tracking-wide">ML Detected</p>
                <p className="text-3xl font-bold mt-1">{stats.aiDetected ?? stats.byType?.AI_PREDICTION ?? 0}</p>
              </div>
              <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-xl p-4">
                <p className="text-xs text-white/90 font-semibold uppercase tracking-wide">Last 7 Days</p>
                <p className="text-3xl font-bold mt-1">{stats.recent ?? 0}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="bg-gradient-to-br from-white to-indigo-50 rounded-2xl border-2 border-indigo-200 p-5 shadow-lg">
        <div className="flex flex-wrap gap-4 items-center mb-4">
          {/* Search */}
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by business name or GSTIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-indigo-200 bg-white text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={handleRunDetection}
            disabled={actionLoading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-bold hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Run Detection
              </>
            )}
          </button>

          <button
            onClick={exportToCSV}
            disabled={filteredAnomalies.length === 0}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-bold hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="font-bold text-gray-800">Filters:</span>
          </div>

          {/* Type Filter */}
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="px-4 py-2 rounded-xl border-2 border-indigo-200 bg-white text-sm font-medium focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          >
            <option value="all">All Types</option>
            <option value="AI_PREDICTION">🤖 ML Prediction</option>
            <option value="GRAPH_ANALYSIS">🌐 Graph Analysis</option>
            <option value="RULE_BASED">📋 Rule-Based</option>
            <option value="MANUAL">👤 Manual</option>
          </select>

          {/* Risk Level Filter */}
          <select
            value={filters.riskLevel}
            onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })}
            className="px-4 py-2 rounded-xl border-2 border-indigo-200 bg-white text-sm font-medium focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          >
            <option value="all">All Risk Levels</option>
            <option value="CRITICAL">🔴 Critical</option>
            <option value="HIGH">🟠 High</option>
            <option value="MEDIUM">🟡 Medium</option>
            <option value="LOW">🟢 Low</option>
          </select>

          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 rounded-xl border-2 border-indigo-200 bg-white text-sm font-medium focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          >
            <option value="all">All Status</option>
            <option value="NEW">🆕 New</option>
            <option value="INVESTIGATING">🔍 Investigating</option>
            <option value="CONFIRMED">✅ Confirmed</option>
            <option value="DISMISSED">❌ Dismissed</option>
            <option value="ESCALATED">⬆️ Escalated</option>
          </select>

          <button
            onClick={loadData}
            className="ml-auto px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Anomalies Table */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
        {/* Results Count */}
        {!loading && filteredAnomalies.length > 0 && (
          <div className="px-6 py-3 bg-gradient-to-r from-gray-50 to-indigo-50 border-b-2 border-gray-200">
            <p className="text-sm font-semibold text-gray-700">
              Showing <span className="text-indigo-600">{filteredAnomalies.length}</span> of <span className="text-indigo-600">{anomalies.length}</span> anomalies
            </p>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <span className="text-gray-600 font-medium">Loading anomalies...</span>
            </div>
          </div>
        ) : filteredAnomalies.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No Anomalies Found</h3>
            <p className="text-sm text-gray-600 mt-2">
              {searchTerm ? 'No anomalies match your search criteria.' : 'No suspicious activities detected with current filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Anomaly Type</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Business Name</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">GSTIN</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Risk Level</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Fraud Probability</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Detected</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredAnomalies.map((anomaly) => (
                  <tr 
                    key={anomaly._id} 
                    className="hover:bg-indigo-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedAnomaly(anomaly)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${getTypeColor(anomaly.type)}`}>
                        <span className="text-base">{getTypeIcon(anomaly.type)}</span>
                        {getTypeLabel(anomaly)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="font-semibold text-gray-900">{anomaly.businessName}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">{anomaly.businessGstin}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold border-2 ${getRiskColor(anomaly.riskLevel)}`}>
                        {anomaly.riskLevel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {anomaly.fraudProbability > 0 ? (
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-gray-900">
                            {(anomaly.fraudProbability * 100).toFixed(1)}%
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                anomaly.fraudProbability > 0.7 
                                  ? 'bg-gradient-to-r from-red-500 to-red-600' 
                                  : anomaly.fraudProbability > 0.4 
                                  ? 'bg-gradient-to-r from-orange-500 to-orange-600' 
                                  : 'bg-gradient-to-r from-green-500 to-green-600'
                              }`}
                              style={{ width: `${anomaly.fraudProbability * 100}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-xs font-medium text-gray-700">
                        {anomaly.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(anomaly.detectedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAnomaly(anomaly);
                        }}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Anomaly Detail Modal */}
      {selectedAnomaly && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedAnomaly(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{selectedAnomaly.businessName}</h2>
                  <p className="text-sm text-white/90 mt-1">{selectedAnomaly.businessGstin}</p>
                </div>
                <button
                  onClick={() => setSelectedAnomaly(null)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Overview */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-4">
                  <p className="text-xs text-red-700 font-semibold uppercase">Risk Level</p>
                  <p className={`text-2xl font-bold mt-1 ${getRiskColor(selectedAnomaly.riskLevel)}`}>
                    {selectedAnomaly.riskLevel}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-4">
                  <p className="text-xs text-purple-700 font-semibold uppercase">Fraud Probability</p>
                  <p className="text-2xl font-bold text-purple-600 mt-1">
                    {(selectedAnomaly.fraudProbability * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
                  <p className="text-xs text-blue-700 font-semibold uppercase">Detection Type</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {selectedAnomaly.type === 'AI_PREDICTION' ? '🤖 ML' : 
                     selectedAnomaly.type === 'GRAPH_ANALYSIS' ? '🌐 Graph' :
                     selectedAnomaly.type === 'RULE_BASED' ? '📋 Rule' : '👤 Manual'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button 
                  onClick={() => handleUpdateStatus(selectedAnomaly._id, 'CONFIRMED')}
                  disabled={actionLoading || selectedAnomaly.status === 'CONFIRMED'}
                  className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✅ Confirm Fraud
                </button>
                <button 
                  onClick={() => handleUpdateStatus(selectedAnomaly._id, 'DISMISSED')}
                  disabled={actionLoading || selectedAnomaly.status === 'DISMISSED'}
                  className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 text-white font-bold hover:from-gray-700 hover:to-gray-800 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ❌ Dismiss
                </button>
                <button 
                  onClick={() => handleUpdateStatus(selectedAnomaly._id, 'ESCALATED')}
                  disabled={actionLoading || selectedAnomaly.status === 'ESCALATED'}
                  className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold hover:from-orange-700 hover:to-red-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ⬆️ Escalate
                </button>
                <button
                  onClick={() => navigate(`/cases?business=${encodeURIComponent(selectedAnomaly.businessGstin)}&anomaly=${encodeURIComponent(selectedAnomaly._id)}`)}
                  className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg"
                >
                  🗂️ Create Case
                </button>
              </div>

              {/* Description */}
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-2">
                  <span className="text-lg">⚠️</span>
                  Description
                </h3>
                <p className="text-sm text-gray-700">{selectedAnomaly.description}</p>
              </div>

              {/* Explanation */}
              {selectedAnomaly.explanation && selectedAnomaly.explanation.length > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
                    <span className="text-lg">🔍</span>
                    Fraud Indicators
                  </h3>
                  <ul className="space-y-2">
                    {selectedAnomaly.explanation.map((item, idx) => (
                      <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-red-600 font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Features */}
              {(selectedAnomaly.features || liveFeatures) && (
                <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
                    <span className="text-lg">📊</span>
                    Analysis Features
                  </h3>
                  {featuresLoading && (
                    <p className="text-xs text-indigo-700 mb-3">Refreshing latest business features...</p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries({ ...(selectedAnomaly.features || {}), ...(liveFeatures || {}) }).map(([key, value]) => (
                      <div key={key} className="bg-white rounded-lg p-3 border border-indigo-200">
                        <p className="text-xs text-gray-600 font-medium">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                        <p className="text-lg font-bold text-gray-900 mt-1">
                          {typeof value === 'number' ? value.toFixed(2) : value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t-2 border-gray-200">
                <button className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg">
                  ✅ Confirm Fraud
                </button>
                <button className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 text-white font-bold hover:from-gray-700 hover:to-gray-800 transition-all shadow-lg">
                  ❌ Dismiss
                </button>
                <button className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold hover:from-orange-700 hover:to-red-700 transition-all shadow-lg">
                  ⬆️ Escalate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
