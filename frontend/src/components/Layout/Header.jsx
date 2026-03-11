import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Header() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    const trimmed = search.trim();
    if (trimmed) {
      navigate(`/business/${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <header className="h-16 bg-gradient-to-r from-indigo-500 to-blue-500 px-6 flex items-center justify-between shadow-sm">
      <h1 className="text-white font-semibold text-lg tracking-tight">
        GST Risk Intelligence Platform
      </h1>
      <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-8">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by GSTIN or Business Name"
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/95 text-[#111827] placeholder-[#6B7280] text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </form>
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20">
        <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
          <span className="text-indigo-600 text-sm font-medium">A</span>
        </div>
        <span className="text-white text-sm font-medium">Admin</span>
      </div>
    </header>
  );
}
