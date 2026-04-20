import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, Plus, Search, ShieldCheck, X, Check,
  UserX, Edit2, KeyRound, Building2, School,
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  integratorId: string | null;
  schoolId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  school?: { name: string } | null;
  integrator?: { name: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  integrator_admin: 'Admin Integrador',
  integrator_support: 'Suporte Integrador',
  school_admin: 'Admin Escola',
  coordinator: 'Coordenador',
  operator: 'Operador',
};

const ROLE_BADGE: Record<string, string> = {
  superadmin:        'badge-danger',
  integrator_admin:  'badge-warning',
  integrator_support:'badge-neutral',
  school_admin:      'badge-success',
  coordinator:       'badge-neutral',
  operator:          'badge-neutral',
};

// Roles each requester can create (mirrors backend CREATABLE_ROLES)
const CREATABLE_ROLES: Record<string, string[]> = {
  superadmin:        ['superadmin', 'integrator_admin', 'integrator_support', 'school_admin', 'coordinator', 'operator'],
  integrator_admin:  ['integrator_support', 'school_admin', 'coordinator', 'operator'],
  integrator_support:['school_admin', 'coordinator', 'operator'],
  school_admin:      ['coordinator', 'operator'],
};

// ── Modals ────────────────────────────────────────────────────────────────────

function CreateUserModal({ token, callerRole, callerSchoolId, callerIntegratorId, onClose, onCreated }: {
  token: string;
  callerRole: string;
  callerSchoolId: string | null;
  callerIntegratorId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ email: '', name: '', role: '', password: '', schoolId: callerSchoolId || '', integratorId: callerIntegratorId || '' });
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const creatableRoles = CREATABLE_ROLES[callerRole] ?? [];

  useEffect(() => {
    if (['superadmin', 'integrator_admin', 'integrator_support'].includes(callerRole)) {
      fetch('/api/schools', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setSchools(d.schools || []))
        .catch(() => {});
    }
  }, []);

  const needsSchool = ['school_admin', 'coordinator', 'operator'].includes(form.role);
  const needsIntegrator = ['integrator_admin', 'integrator_support'].includes(form.role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.name || !form.role || !form.password) {
      setError('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        email: form.email, name: form.name, role: form.role, password: form.password,
      };
      if (form.schoolId) body.schoolId = form.schoolId;
      if (form.integratorId && callerRole === 'superadmin') body.integratorId = form.integratorId;

      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      onCreated();
    } catch {
      setError('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
        width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-xl)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={18} color="var(--color-primary-600)" /> Novo Usuário
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 13, color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Nome completo *</label>
            <input
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Maria Silva"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>E-mail *</label>
            <input
              type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="maria@escola.com.br"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Perfil (role) *</label>
            <select
              value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="">Selecione o perfil...</option>
              {creatableRoles.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
              ))}
            </select>
          </div>

          {/* School selector — shown for school-level roles */}
          {needsSchool && schools.length > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Escola *</label>
              <select
                value={form.schoolId} onChange={e => setForm(f => ({ ...f, schoolId: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)' }}
              >
                <option value="">Selecione a escola...</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              <KeyRound size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Senha inicial *
            </label>
            <input
              type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Mínimo 8 caracteres"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>O usuário deverá alterar a senha no primeiro acesso.</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '10px', background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{
              flex: 1, padding: '10px', background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>{saving ? 'Criando...' : 'Criar Usuário'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const { token, profile } = useAuth();
  const role = profile?.role || '';

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);

  const h = { Authorization: `Bearer ${token}` };

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (roleFilter) params.set('role', roleFilter);
    fetch(`/api/profiles?${params}`, { headers: h })
      .then(r => r.json())
      .then(d => setProfiles(d.profiles || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [roleFilter, token]);

  const handleToggleActive = async (p: UserProfile) => {
    const res = await fetch(`/api/profiles/${p.id}`, {
      method: 'PUT',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (res.ok) load();
  };

  const filtered = profiles.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase())
  );

  const creatableRoles = CREATABLE_ROLES[role] ?? [];

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} color="var(--color-primary-600)" /> Gestão de Usuários
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {filtered.length} usuário{filtered.length !== 1 ? 's' : ''} no seu escopo
          </p>
        </div>
        {creatableRoles.length > 0 && (
          <button onClick={() => setShowCreate(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
            color: '#fff', border: 'none', borderRadius: 'var(--radius-md)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <Plus size={16} /> Novo Usuário
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16, padding: '12px 16px',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', alignItems: 'center',
      }}>
        <Search size={16} color="var(--color-text-muted)" />
        <input
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-text)' }}
        />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-text)' }}>
          <option value="">Todos os perfis</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
            Carregando usuários...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Users size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum usuário encontrado</div>
            {creatableRoles.length > 0 && (
              <button onClick={() => setShowCreate(true)} style={{ marginTop: 12, padding: '8px 18px', background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Criar primeiro usuário
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                {['Usuário', 'Perfil', 'Escola / Integrador', 'Último Acesso', 'Status', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)', opacity: p.isActive ? 1 : 0.55 }}>
                  {/* User info */}
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: p.isActive ? 'var(--color-primary-100)' : 'var(--color-bg)',
                        color: 'var(--color-primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, flexShrink: 0,
                      }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.email}</div>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${ROLE_BADGE[p.role] || 'badge-neutral'}`}>
                      {ROLE_LABELS[p.role] || p.role}
                    </span>
                  </td>

                  {/* Scope */}
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {p.school ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <School size={12} /> {p.school.name}
                      </span>
                    ) : p.integrator ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Building2 size={12} /> {p.integrator.name}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </td>

                  {/* Last login */}
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {p.lastLoginAt
                      ? new Date(p.lastLoginAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : <span style={{ color: 'var(--color-text-muted)' }}>Nunca acessou</span>
                    }
                  </td>

                  {/* Status */}
                  <td style={{ padding: '12px 16px' }}>
                    {p.isActive
                      ? <span className="badge badge-success"><Check size={10} /> Ativo</span>
                      : <span className="badge badge-neutral"><UserX size={10} /> Inativo</span>
                    }
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {canEdit(role, p.role) && (
                        <>
                          <button
                            onClick={() => setEditTarget(p)}
                            title="Editar"
                            style={{ padding: '5px 8px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                          >
                            <Edit2 size={12} /> Editar
                          </button>
                          {p.id !== profile?.id && (
                            <button
                              onClick={() => handleToggleActive(p)}
                              title={p.isActive ? 'Desativar' : 'Reativar'}
                              style={{
                                padding: '5px 8px',
                                background: p.isActive ? 'var(--color-danger-bg)' : 'var(--color-success-bg)',
                                border: `1px solid ${p.isActive ? 'var(--color-danger)' : 'var(--color-success)'}`,
                                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                color: p.isActive ? 'var(--color-danger)' : 'var(--color-success)',
                                display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                              }}
                            >
                              {p.isActive ? <><UserX size={12} /> Desativar</> : <><Check size={12} /> Reativar</>}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit drawer */}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          token={token!}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateUserModal
          token={token!}
          callerRole={role}
          callerSchoolId={profile?.schoolId || null}
          callerIntegratorId={profile?.integratorId || null}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

// Helper: can the current user edit another user of targetRole?
function canEdit(callerRole: string, targetRole: string) {
  return (CREATABLE_ROLES[callerRole] ?? []).includes(targetRole);
}

// ── Edit User Modal ───────────────────────────────────────────────────────────
function EditUserModal({ user, token, onClose, onSaved }: {
  user: UserProfile; token: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]   = useState(user.name);
  const [pwd, setPwd]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const body: Record<string, string> = { name };
    if (pwd) body.password = pwd;
    try {
      const res = await fetch(`/api/profiles/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      onSaved();
    } catch {
      setError('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Edit2 size={16} /> Editar Usuário
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 13, color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'var(--color-bg)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
            <strong>{user.email}</strong> · <span className={`badge ${ROLE_BADGE[user.role] || 'badge-neutral'}`}>{ROLE_LABELS[user.role]}</span>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              <KeyRound size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Nova senha <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(deixe em branco para não alterar)</span>
            </label>
            <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: 10, background: 'var(--color-primary-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
