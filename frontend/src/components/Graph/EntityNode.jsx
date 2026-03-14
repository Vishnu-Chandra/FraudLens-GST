import { Handle, Position } from 'reactflow';

const typeStyles = {
  supplier: { ring: '#6366F1', fill: '#EEF2FF', text: '#1F2937' },   // indigo — fallback
  buyer:    { ring: '#22C55E', fill: '#ECFDF5', text: '#1F2937' },   // green  — normal buyer
  invoice:  { ring: '#F59E0B', fill: '#FFFBEB', text: '#1F2937' },   // amber  — invoice
  fraud:    { ring: '#DC2626', fill: '#FEF2F2', text: '#991B1B' },   // red    — circular trading fraud
  highrisk: { ring: '#F97316', fill: '#FFF7ED', text: '#7C2D12' },   // orange — high-risk business
  filing:   { ring: '#8B5CF6', fill: '#F5F3FF', text: '#1F2937' },   // purple — filing
  center:   { ring: '#2563EB', fill: '#EFF6FF', text: '#1E40AF' },   // blue   — normal business
};

export default function EntityNode({ data }) {
  const {
    title,
    subtitle,
    metaLeft,
    metaRight,
    kind = 'supplier',
    emphasis = false,
    selected = false,
    size = 78,
    onClick,
  } = data || {};

  const s = typeStyles[kind] || typeStyles.supplier;

  return (
    <div
      className="rounded-full flex items-center justify-center relative shadow-sm cursor-pointer select-none transition-transform hover:scale-[1.03] active:scale-[0.99]"
      onClick={(e) => {
        // Make sure clicks always work even when dragging/flow events interfere
        e.stopPropagation();
        if (typeof onClick === 'function') onClick();
      }}
      style={{
        width: size,
        height: size,
        border: `3px solid ${selected ? '#111827' : s.ring}`,
        background: s.fill,
        boxShadow: emphasis
          ? `0 0 0 6px ${s.ring}18`
          : selected
            ? '0 0 0 6px rgba(17,24,39,0.10)'
            : '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div className="text-center px-2">
        <div className="text-[11px] font-semibold leading-tight" style={{ color: s.text }}>
          {title}
        </div>
        {subtitle && (
          <div className="text-[10px] text-[#6B7280] mt-0.5 leading-tight">
            {subtitle}
          </div>
        )}
        {(metaLeft || metaRight) && (
          <div className="mt-1 text-[10px] text-[#6B7280] flex items-center justify-center gap-1">
            {metaLeft && <span className="px-1.5 py-0.5 rounded bg-white/70 border border-[#E5E7EB]">{metaLeft}</span>}
            {metaRight && <span className="px-1.5 py-0.5 rounded bg-white/70 border border-[#E5E7EB]">{metaRight}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

