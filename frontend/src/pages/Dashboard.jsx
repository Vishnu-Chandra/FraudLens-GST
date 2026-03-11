import RiskSummaryCards from '../components/Dashboard/RiskSummaryCards';
import InvoiceMatchChart from '../components/Dashboard/InvoiceMatchChart';
import ItcStatusChart from '../components/Dashboard/ItcStatusChart';
import ActivityChart from '../components/Dashboard/ActivityChart';
import TopRiskTable from '../components/Dashboard/TopRiskTable';
import FraudAlertsPanel from '../components/Dashboard/FraudAlertsPanel';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 text-white shadow-sm">
        <div className="p-6 md:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">GST Risk Intelligence Overview</h1>
          <p className="text-white/85 mt-2 text-sm max-w-2xl">
            Live compliance risk posture across businesses, invoices, ITC claims, and fraud alerts for tax investigators.
          </p>
        </div>
      </div>

      {/* Row 1: Risk Summary Cards */}
      <RiskSummaryCards />

      {/* Row 2: Invoice Match + ITC Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InvoiceMatchChart />
        <ItcStatusChart />
      </div>

      {/* Row 3: Invoice Activity */}
      <ActivityChart />

      {/* Row 4: Top Risk Businesses */}
      <TopRiskTable />

      {/* Row 5: Fraud Alerts */}
      <FraudAlertsPanel />
    </div>
  );
}
