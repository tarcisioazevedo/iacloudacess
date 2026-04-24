import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  Clock, Calendar, Save, Trash2, Plus, AlertTriangle, CheckCircle,
  Mail, MessageSquare, Settings, X, ChevronRight,
} from 'lucide-react';

interface AbsenceConfig {
  absenceAlertEnabled: boolean;
  absenceAlertCutoffTime: string;
  absenceAlertDays: string[];
  absenceAlertTemplate: string | null;
  absenceReportEmail: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  eventDate: string;
  endDate: string | null;
  eventType: string;
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
};

const DEFAULT_TEMPLATE = `*IA Cloud Access — Aviso de Falta*

Olá {{guardianName}},

Informamos que o(a) aluno(a) *{{studentName}}* (Turma: {{classGroup}}) não registrou entrada na escola *{{schoolName}}* até às {{cutoffTime}} de hoje ({{dateText}}).

Se a ausência é justificada, por favor desconsidere esta mensagem.

_Este é um aviso automático._`;

export default function AbsenceConfigTab({ hubSchoolId }: { hubSchoolId: string | null }) {
  const { token } = useAuth();
  const [config, setConfig] = useState<AbsenceConfig>({
    absenceAlertEnabled: false,
    absenceAlertCutoffTime: '08:30',
    absenceAlertDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    absenceAlertTemplate: null,
    absenceReportEmail: null,
  });
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', eventDate: '', endDate: '', eventType: 'holiday' });

  const schoolId = hubSchoolId;

  useEffect(() => {
    if (!schoolId) return;
    loadConfig();
    loadCalendar();
  }, [schoolId]);

  const loadConfig = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const s = data.school || data;
        setConfig({
          absenceAlertEnabled: s.absenceAlertEnabled ?? false,
          absenceAlertCutoffTime: s.absenceAlertCutoffTime ?? '08:30',
          absenceAlertDays: s.absenceAlertDays ?? ['mon', 'tue', 'wed', 'thu', 'fri'],
          absenceAlertTemplate: s.absenceAlertTemplate ?? null,
          absenceReportEmail: s.absenceReportEmail ?? null,
        });
      }
    } catch {}
  };

  const loadCalendar = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/calendar?year=${new Date().getFullYear()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCalendar(data.events || []);
      }
    } catch {}
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await fetch(`/api/schools/${schoolId}/absence-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const addCalendarEvent = async () => {
    if (!newEvent.title || !newEvent.eventDate) return;
    try {
      await fetch(`/api/schools/${schoolId}/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newEvent),
      });
      setShowNewEvent(false);
      setNewEvent({ title: '', eventDate: '', endDate: '', eventType: 'holiday' });
      loadCalendar();
    } catch {}
  };

  const deleteCalendarEvent = async (id: string) => {
    try {
      await fetch(`/api/schools/${schoolId}/calendar/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadCalendar();
    } catch {}
  };

  const toggleDay = (day: string) => {
    setConfig(prev => ({
      ...prev,
      absenceAlertDays: prev.absenceAlertDays.includes(day)
        ? prev.absenceAlertDays.filter(d => d !== day)
        : [...prev.absenceAlertDays, day],
    }));
  };

  if (!schoolId) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Selecione uma escola</div>;

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Config Section */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={18} color="var(--color-warning)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Aviso Automático de Falta</h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>Notifica responsáveis quando o aluno não registra entrada</p>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={config.absenceAlertEnabled} onChange={(e) => setConfig(p => ({ ...p, absenceAlertEnabled: e.target.checked }))}
              style={{ width: 18, height: 18, accentColor: 'var(--color-primary-600)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: config.absenceAlertEnabled ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {config.absenceAlertEnabled ? 'Ativado' : 'Desativado'}
            </span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Cutoff Time */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Clock size={12} /> Horário de Corte
            </label>
            <input type="time" value={config.absenceAlertCutoffTime}
              onChange={(e) => setConfig(p => ({ ...p, absenceAlertCutoffTime: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 14, background: 'var(--color-surface)' }} />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
              Alunos sem entrada até este horário serão considerados ausentes
            </p>
          </div>

          {/* Report Email */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Mail size={12} /> Email para Relatório Diário
            </label>
            <input type="email" value={config.absenceReportEmail || ''} placeholder="secretaria@escola.com.br"
              onChange={(e) => setConfig(p => ({ ...p, absenceReportEmail: e.target.value || null }))}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 14, background: 'var(--color-surface)' }} />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
              Recebe resumo diário com lista de alunos ausentes e taxa de presença
            </p>
          </div>
        </div>

        {/* Days of Week */}
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8, display: 'block' }}>
            Dias Letivos
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(DAY_LABELS).map(([key, label]) => (
              <button key={key} onClick={() => toggleDay(key)}
                style={{
                  padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  background: config.absenceAlertDays.includes(key) ? 'var(--color-primary-50)' : 'var(--color-surface)',
                  color: config.absenceAlertDays.includes(key) ? 'var(--color-primary-700)' : 'var(--color-text-muted)',
                  borderColor: config.absenceAlertDays.includes(key) ? 'var(--color-primary-300)' : 'var(--color-border)',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Template */}
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <MessageSquare size={12} /> Template da Mensagem WhatsApp
          </label>
          <textarea
            value={config.absenceAlertTemplate || DEFAULT_TEMPLATE}
            onChange={(e) => setConfig(p => ({ ...p, absenceAlertTemplate: e.target.value }))}
            rows={8}
            style={{ width: '100%', padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'monospace', background: 'var(--color-surface)', resize: 'vertical' }}
          />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Variáveis: {'{{guardianName}}'}, {'{{studentName}}'}, {'{{classGroup}}'}, {'{{grade}}'}, {'{{schoolName}}'}, {'{{cutoffTime}}'}, {'{{dateText}}'}, {'{{enrollment}}'}
          </p>
        </div>

        {/* Save Button */}
        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {saved && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>
              <CheckCircle size={14} /> Salvo com sucesso!
            </span>
          )}
          <button onClick={saveConfig} disabled={saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
            <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>

      {/* Calendar Section */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-info-bg, rgba(59,130,246,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={18} color="var(--color-info, #3B82F6)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Calendário Escolar — {new Date().getFullYear()}</h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>Feriados e recessos (avisos de falta são suspensos nestes dias)</p>
            </div>
          </div>
          <button onClick={() => setShowNewEvent(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Plus size={14} /> Adicionar
          </button>
        </div>

        {/* New Event Form */}
        {showNewEvent && (
          <div style={{ padding: 16, background: 'var(--color-surface-raised, var(--color-surface))', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Título</label>
                <input type="text" placeholder="Ex: Feriado Nacional" value={newEvent.title}
                  onChange={(e) => setNewEvent(p => ({ ...p, title: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Data Início</label>
                <input type="date" value={newEvent.eventDate}
                  onChange={(e) => setNewEvent(p => ({ ...p, eventDate: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Data Fim (opc.)</label>
                <input type="date" value={newEvent.endDate}
                  onChange={(e) => setNewEvent(p => ({ ...p, endDate: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
                <select value={newEvent.eventType} onChange={(e) => setNewEvent(p => ({ ...p, eventType: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <option value="holiday">Feriado</option>
                  <option value="recess">Recesso</option>
                  <option value="pedagogical">Pedagógico</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={addCalendarEvent} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}>
                  <Plus size={14} />
                </button>
                <button onClick={() => setShowNewEvent(false)} className="btn btn-ghost" style={{ padding: '8px 10px' }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Calendar Events List */}
        {calendar.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)', fontSize: 13 }}>
            Nenhum feriado ou recesso cadastrado para este ano.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {calendar.map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 600,
                    background: ev.eventType === 'holiday' ? 'rgba(239,68,68,0.1)' : ev.eventType === 'recess' ? 'rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)',
                    color: ev.eventType === 'holiday' ? '#EF4444' : ev.eventType === 'recess' ? '#3B82F6' : '#A855F7',
                  }}>
                    {ev.eventType === 'holiday' ? 'Feriado' : ev.eventType === 'recess' ? 'Recesso' : 'Pedagógico'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{ev.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {new Date(ev.eventDate).toLocaleDateString('pt-BR')}
                    {ev.endDate && ` → ${new Date(ev.endDate).toLocaleDateString('pt-BR')}`}
                  </span>
                </div>
                <button onClick={() => deleteCalendarEvent(ev.id)} className="btn btn-ghost" style={{ padding: 6, color: 'var(--color-danger)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
