import { Routes, Route } from 'react-router-dom';
import DashboardLayout from './components/Layout/DashboardLayout';
import Dashboard from './pages/Dashboard';
import BusinessInvestigation from './pages/BusinessInvestigation';
import Business from './pages/Business';
import SupplyNetwork from './pages/SupplyNetwork';
import Anomalies from './pages/Anomalies';
import Cases from './pages/Cases';
import CaseDetails from './pages/CaseDetails';
import StateRiskMap from './pages/StateRiskMap';
import ItcAnalysis from './pages/ItcAnalysis';
import InvestigationCallCenter from './pages/InvestigationCallCenter';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="business/:gstin" element={<Business />} />
        <Route path="business-investigation" element={<BusinessInvestigation />} />
        <Route path="supply-network" element={<SupplyNetwork />} />
        <Route path="itc-analysis" element={<ItcAnalysis />} />
        <Route path="state-risk-map" element={<StateRiskMap />} />
        <Route path="anomalies" element={<Anomalies />} />
        <Route path="cases" element={<Cases />} />
        <Route path="cases/:caseId" element={<CaseDetails />} />
        <Route path="investigation-call-center" element={<InvestigationCallCenter />} />
      </Route>
    </Routes>
  );
}
