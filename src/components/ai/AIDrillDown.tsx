import React from 'react';
import { ChevronRight } from 'lucide-react';

export type DrillLevel = 'platform' | 'integrator' | 'school' | 'class' | 'student';

interface DrillItem {
  level: DrillLevel;
  label: string;
  id?: string;
  name?: string;
}

interface Props {
  path: DrillItem[];
  onNavigate: (item: DrillItem, index: number) => void;
  userRole: string;
}

const LEVEL_ROLES: Record<DrillLevel, string[]> = {
  platform:   ['superadmin'],
  integrator: ['superadmin', 'integrator_admin', 'integrator_support'],
  school:     ['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator'],
  class:      ['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator'],
  student:    ['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator'],
};

export function canDrill(level: DrillLevel, role: string): boolean {
  return LEVEL_ROLES[level]?.includes(role) ?? false;
}

export default function AIDrillDown({ path, onNavigate, userRole }: Props) {
  if (path.length === 0) return null;

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', fontSize: 13 }}>
      {path.map((item, i) => {
        const isLast = i === path.length - 1;
        return (
          <React.Fragment key={`${item.level}-${i}`}>
            {i > 0 && <ChevronRight size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />}
            <button
              onClick={() => !isLast && onNavigate(item, i)}
              disabled={isLast}
              style={{
                background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer',
                padding: '3px 6px', borderRadius: 4,
                fontWeight: isLast ? 700 : 500,
                color: isLast
                  ? 'var(--color-primary-700)'
                  : 'var(--color-text-secondary)',
                textDecoration: isLast ? 'none' : 'underline',
                textUnderlineOffset: 2,
                transition: 'color 0.15s',
              }}
            >
              {item.name ?? levelLabel(item.level)}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function levelLabel(level: DrillLevel): string {
  const map: Record<DrillLevel, string> = {
    platform:   'Plataforma',
    integrator: 'Integrador',
    school:     'Escola',
    class:      'Turma',
    student:    'Aluno',
  };
  return map[level] ?? level;
}
