import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { path: '/business-investigation', label: 'Business Investigation', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7' },
  { path: '/supply-network', label: 'Supply Network', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { path: '/anomalies', label: 'Anomalies', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  { path: '/cases', label: 'Cases', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
];

const mapNavItem = {
  path: '/state-risk-map',
  label: 'State Risk Map',
  icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 01.553-.894L9 2m0 18l6-3m-6 3V2m6 15l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 2',
};

const belowMapItems = [
  { path: '/itc-analysis', label: 'ITC Analysis', icon: 'M12 8c-1.657 0-3-1.343-3-3m3 3c1.657 0 3-1.343 3-3m-3 3v13m-7-6h14M5 17h14' },
  { path: '/investigation-call-center', label: 'Investigation Call Center', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen sticky top-0 bg-[#FFFFFF] border-r border-[#E5E7EB] flex flex-col">
      <div className="p-6 border-b border-[#E5E7EB]">
        <h2 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wider">GST Risk</h2>
        <p className="text-xs text-[#6B7280] mt-0.5">Intelligence Platform</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-[#6366F1]'
                  : 'text-[#6B7280] hover:bg-gray-50 hover:text-[#111827]'
              }`
            }
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
            {label}
          </NavLink>
        ))}

        <div className="my-3 border-t border-[#E5E7EB]" />

        <NavLink
          to={mapNavItem.path}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-indigo-50 text-[#6366F1]'
                : 'text-[#6B7280] hover:bg-gray-50 hover:text-[#111827]'
            }`
          }
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mapNavItem.icon} />
          </svg>
          {mapNavItem.label}
        </NavLink>

        {belowMapItems.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-[#6366F1]'
                  : 'text-[#6B7280] hover:bg-gray-50 hover:text-[#111827]'
              }`
            }
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
