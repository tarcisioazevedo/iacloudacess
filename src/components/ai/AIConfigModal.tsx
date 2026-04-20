import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Save, Eye, EyeOff, Zap, Building2, School,
  Plus, Trash2, ChevronDown, ChevronRight, CheckCircle,
  AlertCircle, Info, ToggleLeft, ToggleRight,
} from 'lucide-react';

const GEMINI_MODELS = [
  { value: 'gemini-2.5-pro-preview-05-06',    label: 'Gemini 2.5 Pro Preview (mais poderoso)' },
  { value: 'gemini-2.5-flash-preview-04-17',  label: 'Gemini 2.5 Flash Preview (recomendado)' },
  { value: 'gemini-2.0-flash',                label: 'Gemini 2.0 Flash (rápido)' },
  { value: 'gemini-1.5-flash',                label: 'Gemini 1.5 Flash (econômico)' },
];
const OPENAI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (econômico)' },
  { value: 'gpt-4o',      label: 'GPT-4o (balanceado)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (avançado)' },
];

interface ConfigData {
  id?: string;
  enabled: boolean;
  primaryProvider: 'gemini' | 'openai';
  geminiApiKey: string;
  openaiApiKey: string;
  geminiModel: string;
  openaiModel: string;
  monthlyTokenQuota: number;
  cacheEnabled: boolean;
  cacheTtlMinutes: number;
  hasGeminiKey?: boolean;
  hasOpenaiKey?: boolean;
}

interface SchoolConfig extends ConfigData {
  schoolId: string;
  schoolName?: string;
  scope: 'school';
}

// Roles that can manage AI configuration (tenant keys, enable/disable, quotas)
const ADMIN_ROLES = ['superadmin', 'integrator_admin'];

interface Props {
  token: string;
  userRole: string;
  onClose: () => void;
}

const DEFAULT_CONFIG: ConfigData = {
  enabled: false,
  primaryProvider: 'gemini',
  geminiApiKey: '',
  openaiApiKey: '',
  geminiModel: 'gemini-2.5-flash-preview-04-17',
  openaiModel: 'gpt-4o-mini',
  monthlyTokenQuota: 500000,
  cacheEnabled: true,
  cacheTtlMinutes: 60,
};

export default function AIConfigModal({ token, userRole, onClose }: Props) {
  const isAdmin = ADMIN_ROLES.includes(userRole);
  const [tab, setTab] = useState<'tenant' | 'schools'>('tenant');
  const [tenantConfig, setTenantConfig] = useState<ConfigData>({ ...DEFAULT_CONFIG });
  const [schoolConfigs, setSchoolConfigs] = useState<SchoolConfig[]>([]);
  const [availableSchools, setAvailableSchools] = useState<{ id: string; name: string }[]>([]);
  const [expandedSchool, setExpandedSchool] = useState<string | null>(null);
  const [editingSchool, setEditingSchool] = useState<SchoolConfig | null>(null);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSchool, setSavingSchool] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [deletingSchool, setDeletingSchool] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      const [cfgRes, schoolsRes] = await Promise.all([
        fetch('/api/ai/config', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/schools', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (cfgRes.ok) {
        const d = await cfgRes.json();
        if (d.tenantConfig) {
          setTenantConfig(prev => ({
            ...prev,
            ...d.tenantConfig,
            geminiApiKey: '',  // never prefill keys from masked values
            openaiApiKey: '',
          }));
        }
        if (d.schoolConfigs) {
          setSchoolConfigs(d.schoolConfigs.map((c: any) => ({
            ...DEFAULT_CONFIG,
            ...c,
            geminiApiKey: '',
            openaiApiKey: '',
          })));
        }
      }
      if (schoolsRes.ok) {
        const d = await schoolsRes.json();
        setAvailableSchools((d.schools ?? []).map((s: any) => ({ id: s.id, name: s.name })));
      }
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // ── Save tenant config ──────────────────────────────────────────────────────
  const saveTenant = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        enabled:          tenantConfig.enabled,
        primaryProvider:  tenantConfig.primaryProvider,
        geminiModel:      tenantConfig.geminiModel,
        openaiModel:      tenantConfig.openaiModel,
        monthlyTokenQuota: tenantConfig.monthlyTokenQuota,
        cacheEnabled:     tenantConfig.cacheEnabled,
        cacheTtlMinutes:  tenantConfig.cacheTtlMinutes,
      };
      if (tenantConfig.geminiApiKey) body.geminiApiKey = tenantConfig.geminiApiKey;
      if (tenantConfig.openaiApiKey) body.openaiApiKey = tenantConfig.openaiApiKey;

      const res = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      showToast('success', 'Configuração do tenant salva com sucesso!');
      setTenantConfig(p => ({ ...p, geminiApiKey: '', openaiApiKey: '' }));
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Save school override ────────────────────────────────────────────────────
  const saveSchoolOverride = async (cfg: SchoolConfig) => {
    setSavingSchool(cfg.schoolId);
    try {
      const body: Record<string, unknown> = {
        enabled:          cfg.enabled,
        primaryProvider:  cfg.primaryProvider,
        geminiModel:      cfg.geminiModel,
        openaiModel:      cfg.openaiModel,
        monthlyTokenQuota: cfg.monthlyTokenQuota,
        cacheEnabled:     cfg.cacheEnabled,
        cacheTtlMinutes:  cfg.cacheTtlMinutes,
      };
      if (cfg.geminiApiKey) body.geminiApiKey = cfg.geminiApiKey;
      if (cfg.openaiApiKey) body.openaiApiKey = cfg.openaiApiKey;

      const res = await fetch(`/api/ai/config/schools/${cfg.schoolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      showToast('success', 'Override da escola salvo!');
      setEditingSchool(null);
      await load();
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSavingSchool(null);
    }
  };

  // ── Delete school override ──────────────────────────────────────────────────
  const deleteSchoolOverride = async (schoolId: string) => {
    setDeletingSchool(schoolId);
    try {
      const res = await fetch(`/api/ai/config/schools/${schoolId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).message);
      showToast('success', 'Override removido. Escola usará configuração do tenant.');
      await load();
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setDeletingSchool(null);
    }
  };

  // ── Add new school override ─────────────────────────────────────────────────
  const addSchoolOverride = (schoolId: string) => {
    const school = availableSchools.find(s => s.id === schoolId);
    if (!school) return;
    const exists = schoolConfigs.find(c => c.schoolId === schoolId);
    if (exists) { setExpandedSchool(schoolId); return; }
    const newCfg: SchoolConfig = {
      ...DEFAULT_CONFIG,
      schoolId,
      schoolName: school.name,
      scope: 'school',
      primaryProvider: tenantConfig.primaryProvider,
      geminiModel: tenantConfig.geminiModel,
      openaiModel: tenantConfig.openaiModel,
    };
    setEditingSchool(newCfg);
    setTab('schools');
  };

  const schoolsWithoutOverride = availableSchools.filter(
    s => !schoolConfigs.some(c => c.schoolId === s.id),
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--color-surface)', borderRadius: 16,
        width: '100%', maxWidth: 640, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '18px 24px', borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={17} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text)' }}>
              {isAdmin ? 'Configuração de IA' : 'Status da IA Analytics'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {isAdmin ? 'Gemini · OpenAI · Por tenant ou por escola' : 'Configurado pelo administrador do integrador'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs — only admins see the schools override tab */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', padding: '0 24px' }}>
          {(isAdmin
            ? [
                { key: 'tenant',  label: 'Tenant (todas as escolas)',          icon: <Building2 size={13} /> },
                { key: 'schools', label: `Overrides por escola (${schoolConfigs.length})`, icon: <School size={13} /> },
              ]
            : [
                { key: 'tenant',  label: 'Status da IA',                       icon: <Zap size={13} /> },
              ]
          ).map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? '#7c3aed' : 'var(--color-text-secondary)',
                borderBottom: tab === t.key ? '2px solid #7c3aed' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s',
              }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── TENANT TAB ───────────────────────────────────────────────────── */}
          {tab === 'tenant' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* ── ADMIN view: full config ──────────────────────────────────── */}
              {isAdmin ? (
                <>
                  <InfoBox>
                    Esta configuração é aplicada a <strong>todas as escolas</strong> do tenant. Para usar uma chave diferente em uma escola específica, configure um override na aba "Overrides por escola".
                  </InfoBox>

                  <EnableToggle
                    enabled={tenantConfig.enabled}
                    onChange={v => setTenantConfig(p => ({ ...p, enabled: v }))}
                    label="Habilitar IA Analytics para todo o tenant"
                  />

                  <ConfigForm
                    config={tenantConfig}
                    onChange={setTenantConfig}
                    showGeminiKey={showGeminiKey}
                    showOpenAIKey={showOpenAIKey}
                    onToggleGemini={() => setShowGeminiKey(v => !v)}
                    onToggleOpenAI={() => setShowOpenAIKey(v => !v)}
                  />
                </>
              ) : (
                /* ── END-USER view: read-only status only ───────────────────── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <InfoBox>
                    A ativação e configuração da IA é realizada pelo <strong>administrador do integrador</strong>. Você pode utilizar os recursos de IA conforme o acesso concedido.
                  </InfoBox>

                  {/* Status card */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '18px 20px', borderRadius: 10,
                    background: tenantConfig.enabled ? '#f0fdf4' : '#f9fafb',
                    border: `1px solid ${tenantConfig.enabled ? '#bbf7d0' : 'var(--color-border)'}`,
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                      background: tenantConfig.enabled ? '#dcfce7' : 'var(--color-bg)',
                      border: `1px solid ${tenantConfig.enabled ? '#86efac' : 'var(--color-border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Zap size={20} style={{ color: tenantConfig.enabled ? '#16a34a' : 'var(--color-text-muted)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', marginBottom: 3 }}>
                        IA Analytics está{' '}
                        <span style={{ color: tenantConfig.enabled ? '#16a34a' : '#dc2626' }}>
                          {tenantConfig.enabled ? 'ativa' : 'inativa'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {tenantConfig.enabled
                          ? `Provedor: ${tenantConfig.primaryProvider === 'gemini' ? '✦ Google Gemini' : '⬡ OpenAI'} · ${tenantConfig.primaryProvider === 'gemini' ? tenantConfig.geminiModel : tenantConfig.openaiModel}`
                          : 'Entre em contato com o administrador para ativar.'
                        }
                      </div>
                    </div>
                  </div>

                  {tenantConfig.enabled && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                    }}>
                      {[
                        { label: 'Quota mensal', value: `${tenantConfig.monthlyTokenQuota.toLocaleString()} tokens` },
                        { label: 'Cache de respostas', value: tenantConfig.cacheEnabled ? `Ativo (${tenantConfig.cacheTtlMinutes} min)` : 'Inativo' },
                      ].map(item => (
                        <div key={item.label} style={{
                          padding: '10px 14px', borderRadius: 8,
                          background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{item.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── SCHOOLS TAB ──────────────────────────────────────────────────── */}
          {tab === 'schools' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <InfoBox>
                Configure uma chave ou modelo diferente para escolas específicas. Se não houver override, a escola usará a configuração do tenant.
              </InfoBox>

              {/* Add override */}
              {schoolsWithoutOverride.length > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    id="add-school-select"
                    style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)' }}
                    defaultValue=""
                  >
                    <option value="" disabled>Selecionar escola para override...</option>
                    {schoolsWithoutOverride.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button
                    onClick={() => {
                      const sel = document.getElementById('add-school-select') as HTMLSelectElement;
                      if (sel.value) addSchoolOverride(sel.value);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', background: '#7c3aed', color: '#fff',
                      border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    <Plus size={14} /> Adicionar
                  </button>
                </div>
              )}

              {/* New override form */}
              {editingSchool && (
                <div style={{ border: '2px solid #7c3aed', borderRadius: 10, padding: 16, background: '#faf5ff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <School size={14} style={{ color: '#7c3aed' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>
                      {editingSchool.schoolName ?? editingSchool.schoolId}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 4 }}>novo override</span>
                    <button onClick={() => setEditingSchool(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                      <X size={14} />
                    </button>
                  </div>
                  <EnableToggle
                    enabled={editingSchool.enabled}
                    onChange={v => setEditingSchool(p => p ? { ...p, enabled: v } : p)}
                    label="Habilitar IA para esta escola"
                  />
                  <div style={{ marginTop: 14 }}>
                    <ConfigForm
                      config={editingSchool}
                      onChange={cfg => setEditingSchool(p => p ? { ...p, ...cfg } : p)}
                      showGeminiKey={false}
                      showOpenAIKey={false}
                      onToggleGemini={() => {}}
                      onToggleOpenAI={() => {}}
                      compact
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <button onClick={() => setEditingSchool(null)}
                      style={{ padding: '7px 14px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                      Cancelar
                    </button>
                    <button
                      onClick={() => saveSchoolOverride(editingSchool)}
                      disabled={!!savingSchool}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 16px', background: '#7c3aed', color: '#fff',
                        border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
                        cursor: savingSchool ? 'not-allowed' : 'pointer', opacity: savingSchool ? 0.7 : 1,
                      }}
                    >
                      <Save size={13} /> Salvar override
                    </button>
                  </div>
                </div>
              )}

              {/* Existing overrides list */}
              {schoolConfigs.length === 0 && !editingSchool && (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)' }}>
                  <School size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p style={{ fontSize: 13, margin: 0 }}>Nenhum override configurado</p>
                  <p style={{ fontSize: 12, margin: '4px 0 0', opacity: 0.7 }}>Todas as escolas usam a configuração do tenant</p>
                </div>
              )}

              {schoolConfigs.map(sc => (
                <SchoolOverrideRow
                  key={sc.schoolId}
                  cfg={sc}
                  expanded={expandedSchool === sc.schoolId}
                  onToggleExpand={() => setExpandedSchool(v => v === sc.schoolId ? null : sc.schoolId)}
                  onUpdate={updated => setSchoolConfigs(prev => prev.map(c => c.schoolId === updated.schoolId ? updated : c))}
                  onSave={saveSchoolOverride}
                  onDelete={deleteSchoolOverride}
                  saving={savingSchool === sc.schoolId}
                  deleting={deletingSchool === sc.schoolId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {toast ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: toast.type === 'success' ? '#16a34a' : '#dc2626' }}>
              {toast.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {toast.msg}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Chaves API são criptografadas em repouso
            </span>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
              style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              Fechar
            </button>
            {/* Save button only for admins — end users cannot change any config */}
            {isAdmin && tab === 'tenant' && (
              <button onClick={saveTenant} disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', background: saving ? 'var(--color-border)' : '#7c3aed',
                  color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}>
                <Save size={14} />
                {saving ? 'Salvando...' : 'Salvar configuração'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
      <Info size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 1 }} />
      <p style={{ fontSize: 12, color: '#1d4ed8', margin: 0, lineHeight: 1.5 }}>{children}</p>
    </div>
  );
}

function EnableToggle({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!enabled)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
      {enabled
        ? <ToggleRight size={26} style={{ color: '#7c3aed', flexShrink: 0 }} />
        : <ToggleLeft size={26} style={{ color: 'var(--color-border)', flexShrink: 0 }} />
      }
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{label}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
        background: enabled ? '#f3e8ff' : 'var(--color-bg)',
        color: enabled ? '#7c3aed' : 'var(--color-text-muted)',
        border: `1px solid ${enabled ? '#ddd6fe' : 'var(--color-border)'}`,
      }}>
        {enabled ? 'ATIVO' : 'INATIVO'}
      </span>
    </button>
  );
}

function ConfigForm({
  config, onChange, showGeminiKey, showOpenAIKey, onToggleGemini, onToggleOpenAI, compact,
}: {
  config: ConfigData;
  onChange: (c: any) => void;
  showGeminiKey: boolean;
  showOpenAIKey: boolean;
  onToggleGemini: () => void;
  onToggleOpenAI: () => void;
  compact?: boolean;
}) {
  const set = (patch: Partial<ConfigData>) => onChange({ ...config, ...patch });
  const fSize = compact ? 12 : 13;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 12 : 16 }}>
      {/* Provider selector */}
      <div>
        <Label compact={compact}>Provedor Primário</Label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {(['gemini', 'openai'] as const).map(p => (
            <button key={p} onClick={() => set({ primaryProvider: p })}
              style={{
                flex: 1, padding: compact ? '7px 10px' : '9px 14px',
                border: `2px solid ${config.primaryProvider === p ? '#7c3aed' : 'var(--color-border)'}`,
                borderRadius: 8, background: config.primaryProvider === p ? '#f3e8ff' : 'var(--color-bg)',
                color: config.primaryProvider === p ? '#7c3aed' : 'var(--color-text-secondary)',
                fontWeight: config.primaryProvider === p ? 700 : 500,
                fontSize: fSize, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {p === 'gemini' ? '✦ Google Gemini' : '⬡ OpenAI'}
            </button>
          ))}
        </div>
      </div>

      {/* Gemini section */}
      <ProviderSection title="Google Gemini" active={config.primaryProvider === 'gemini'} compact={compact}>
        <div style={{ position: 'relative' }}>
          <input
            type={showGeminiKey ? 'text' : 'password'}
            placeholder={config.hasGeminiKey ? '(chave salva — deixe em branco para manter)' : 'AIza... (Google AI Studio)'}
            value={config.geminiApiKey}
            onChange={e => set({ geminiApiKey: e.target.value })}
            style={keyInputStyle(fSize)}
          />
          <button onClick={onToggleGemini} tabIndex={-1}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            {showGeminiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <select value={config.geminiModel} onChange={e => set({ geminiModel: e.target.value })}
          style={{ ...selectStyle(fSize), marginTop: 6 }}>
          {GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </ProviderSection>

      {/* OpenAI section */}
      <ProviderSection title="OpenAI" active={config.primaryProvider === 'openai'} compact={compact}>
        <div style={{ position: 'relative' }}>
          <input
            type={showOpenAIKey ? 'text' : 'password'}
            placeholder={config.hasOpenaiKey ? '(chave salva — deixe em branco para manter)' : 'sk-... (platform.openai.com)'}
            value={config.openaiApiKey}
            onChange={e => set({ openaiApiKey: e.target.value })}
            style={keyInputStyle(fSize)}
          />
          <button onClick={onToggleOpenAI} tabIndex={-1}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            {showOpenAIKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <select value={config.openaiModel} onChange={e => set({ openaiModel: e.target.value })}
          style={{ ...selectStyle(fSize), marginTop: 6 }}>
          {OPENAI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </ProviderSection>

      {/* Quota + cache */}
      {!compact && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Label compact={compact}>Quota Mensal (tokens)</Label>
            <input type="number" value={config.monthlyTokenQuota} min={10000}
              onChange={e => set({ monthlyTokenQuota: Number(e.target.value) })}
              style={{ ...inputStyle(fSize), marginTop: 4 }} />
          </div>
          <div>
            <Label compact={compact}>Cache TTL (minutos)</Label>
            <input type="number" value={config.cacheTtlMinutes} min={1}
              onChange={e => set({ cacheTtlMinutes: Number(e.target.value) })}
              style={{ ...inputStyle(fSize), marginTop: 4 }} />
          </div>
        </div>
      )}

      {!compact && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={config.cacheEnabled}
            onChange={e => set({ cacheEnabled: e.target.checked })}
            style={{ width: 14, height: 14, accentColor: '#7c3aed' }} />
          <span style={{ fontSize: fSize, color: 'var(--color-text-secondary)' }}>Habilitar cache de respostas (economiza tokens)</span>
        </label>
      )}
    </div>
  );
}

function ProviderSection({ title, active, compact, children }: { title: string; active: boolean; compact?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      border: `1px solid ${active ? '#ddd6fe' : 'var(--color-border)'}`,
      borderRadius: 8, padding: compact ? '10px 12px' : '12px 14px',
      background: active ? '#faf5ff' : 'var(--color-bg)',
      opacity: active ? 1 : 0.65, transition: 'all 0.2s',
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: active ? '#7c3aed' : 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
        {title} {active && '(ativo)'}
      </p>
      {children}
    </div>
  );
}

function SchoolOverrideRow({ cfg, expanded, onToggleExpand, onUpdate, onSave, onDelete, saving, deleting }: {
  cfg: SchoolConfig;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (c: SchoolConfig) => void;
  onSave: (c: SchoolConfig) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  deleting: boolean;
}) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={onToggleExpand}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}>
        <School size={14} style={{ color: cfg.enabled ? '#7c3aed' : 'var(--color-text-muted)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{cfg.schoolName ?? cfg.schoolId}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
          background: cfg.enabled ? '#f3e8ff' : 'var(--color-bg)',
          color: cfg.enabled ? '#7c3aed' : 'var(--color-text-muted)',
          border: `1px solid ${cfg.enabled ? '#ddd6fe' : 'var(--color-border)'}`,
        }}>
          {cfg.enabled ? cfg.primaryProvider.toUpperCase() : 'OFF'}
        </span>
        <button onClick={e => { e.stopPropagation(); onDelete(cfg.schoolId); }}
          disabled={deleting}
          title="Remover override"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4, opacity: deleting ? 0.5 : 1 }}>
          <Trash2 size={13} />
        </button>
        {expanded ? <ChevronDown size={14} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} />}
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ paddingTop: 12, marginBottom: 12 }}>
            <EnableToggle
              enabled={cfg.enabled}
              onChange={v => onUpdate({ ...cfg, enabled: v })}
              label="Habilitar IA para esta escola"
            />
          </div>
          <ConfigForm
            config={cfg}
            onChange={updated => onUpdate({ ...cfg, ...updated })}
            showGeminiKey={false}
            showOpenAIKey={false}
            onToggleGemini={() => {}}
            onToggleOpenAI={() => {}}
            compact
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => onSave(cfg)} disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', background: saving ? 'var(--color-border)' : '#7c3aed',
                color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}>
              <Save size={12} />{saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return <span style={{ fontSize: compact ? 11 : 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>{children}</span>;
}

const keyInputStyle = (fSize: number): React.CSSProperties => ({
  width: '100%', border: '1px solid var(--color-border)', borderRadius: 7,
  padding: '8px 36px 8px 10px', fontSize: fSize,
  background: 'var(--color-bg)', color: 'var(--color-text)',
  boxSizing: 'border-box', fontFamily: 'monospace',
});
const selectStyle = (fSize: number): React.CSSProperties => ({
  width: '100%', border: '1px solid var(--color-border)', borderRadius: 7,
  padding: '7px 10px', fontSize: fSize,
  background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box',
});
const inputStyle = (fSize: number): React.CSSProperties => ({
  width: '100%', border: '1px solid var(--color-border)', borderRadius: 7,
  padding: '7px 10px', fontSize: fSize,
  background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box',
});
