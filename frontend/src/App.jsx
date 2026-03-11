import { Routes, Route } from 'react-router-dom';
import DashboardLayout from './components/Layout/DashboardLayout';
import Dashboard from './pages/Dashboard';
import BusinessInvestigation from './pages/BusinessInvestigation';
import Business from './pages/Business';
import SupplyNetwork from './pages/SupplyNetwork';
import Anomalies from './pages/Anomalies';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="business/:gstin" element={<Business />} />
        <Route path="business-investigation" element={<BusinessInvestigation />} />
        <Route path="supply-network" element={<SupplyNetwork />} />
        <Route path="anomalies" element={<Anomalies />} />
      </Route>
    </Routes>
  );
}
