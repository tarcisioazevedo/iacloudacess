import React from 'react';
import { Filter, Calendar, Clock, BookOpen, Cpu, ArrowUpDown, X } from 'lucide-react';

export interface AIFilters {
  schoolId?: string;
  shift?: string;
  grade?: string;
  classGroup?: string;
  deviceId?: string;
  direction?: string;
  startDate?: string;
  endDate?: string;
}

interface Props {
  filters: AIFilters;
  onChange: (f: AIFilters) => void;
  schools?: { id: string; name: string }[];
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function AIFilterSidebar({ filters, onChange, schools = [], collapsed = false, onToggle }: Props) {
  const set = (patch: Partial<AIFilters>) => onChange({ ...filters, ...patch });
  const activeCount = Object.values(filters).filter(v => v && v !== '').length;

  if (collapsed) {
    return (
      <div style={{ width: 48, background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16, gap: 8 }}>
        <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', position: 'relative' }}>
          <Filter size={18} />
          {activeCount > 0 && (
            <span style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, background: 'var(--color-primary-600)', borderRadius: '50%', fontSize: 9, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {activeCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <aside style={{ width: 220, background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Filter size={14} style={{ color: 'var(--color-text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', flex: 1 }}>Filtros</span>
        {activeCount > 0 && (
          <button onClick={() => onChange({})} title="Limpar filtros"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
            <X size={13} />
          </button>
        )}
        {onToggle && (
          <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            <X size={14} />
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>

        {/* School (integrator/superadmin only) */}
        {schools.length > 1 && (
          <FilterGroup icon={<BookOpen size={11} />} label="Escola">
            <select value={filters.schoolId ?? ''} onChange={e => set({ schoolId: e.target.value || undefined })} style={selectStyle}>
              <option value="">Todas</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FilterGroup>
        )}

        {/* Date range */}
        <FilterGroup icon={<Calendar size={11} />} label="Período">
          <input type="date" value={filters.startDate ?? ''} onChange={e => set({ startDate: e.target.value || undefined })} style={inputStyle} />
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', display: 'block', margin: '2px 0' }}>até</span>
          <input type="date" value={filters.endDate ?? ''} onChange={e => set({ endDate: e.target.value || undefined })} style={inputStyle} />
        </FilterGroup>

        {/* Shift */}
        <FilterGroup icon={<Clock size={11} />} label="Turno">
          <select value={filters.shift ?? ''} onChange={e => set({ shift: e.target.value || undefined })} style={selectStyle}>
            <option value="">Todos</option>
            <option value="morning">Manhã</option>
            <option value="afternoon">Tarde</option>
            <option value="evening">Noite</option>
            <option value="full">Integral</option>
          </select>
        </FilterGroup>

        {/* Grade */}
        <FilterGroup icon={<BookOpen size={11} />} label="Série">
          <input type="text" placeholder="Ex: 6º Ano" value={filters.grade ?? ''} onChange={e => set({ grade: e.target.value || undefined })} style={inputStyle} />
        </FilterGroup>

        {/* Class group */}
        <FilterGroup label="Turma">
          <input type="text" placeholder="Ex: 6A, 7B" value={filters.classGroup ?? ''} onChange={e => set({ classGroup: e.target.value || undefined })} style={inputStyle} />
        </FilterGroup>

        {/* Direction */}
        <FilterGroup icon={<ArrowUpDown size={11} />} label="Direção">
          <select value={filters.direction ?? ''} onChange={e => set({ direction: e.target.value || undefined })} style={selectStyle}>
            <option value="">Entrada e Saída</option>
            <option value="entry">Apenas Entrada</option>
            <option value="exit">Apenas Saída</option>
          </select>
        </FilterGroup>

        {/* Device */}
        <FilterGroup icon={<Cpu size={11} />} label="Dispositivo">
          <input type="text" placeholder="ID ou nome" value={filters.deviceId ?? ''} onChange={e => set({ deviceId: e.target.value || undefined })} style={inputStyle} />
        </FilterGroup>

        {activeCount > 0 && (
          <button onClick={() => onChange({})}
            style={{ marginTop: 8, width: '100%', padding: '6px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            Limpar todos ({activeCount})
          </button>
        )}
      </div>
    </aside>
  );
}

function FilterGroup({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
        {icon && <span style={{ color: 'var(--color-text-muted)' }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--color-border)', borderRadius: 6,
  padding: '5px 8px', fontSize: 12, background: 'var(--color-bg)', color: 'var(--color-text)',
  boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle };
