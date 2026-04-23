import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Users, Plus, Search, GraduationCap, X, Upload, FileSpreadsheet, Camera, CheckCircle, AlertTriangle, Download, ChevronRight } from 'lucide-react';
import StudentPanel from '../components/students/StudentPanel';

interface Student {
  id: string; name: string; accessId: string; enrollment: string | null; grade: string; classGroup: string; shift: string; status: string;
  photo?: { storagePath: string; validationStatus: string };
  deviceLinks?: { syncStatus: string }[];
  school?: { name: string };
}

const syncBadge = (links: any[] = []) => {
  if (links.length === 0) return <span className="badge badge-neutral">⚪ Sem vínculo</span>;
  const allSynced = links.every(l => l.syncStatus === 'synced');
  const anyFailed = links.some(l => l.syncStatus === 'failed');
  if (allSynced) return <span className="badge badge-success">🟢 Sincronizado</span>;
  if (anyFailed) return <span className="badge badge-danger">🔴 Falhou</span>;
  return <span className="badge badge-warning">🟡 Pendente</span>;
};

// ─── Photo Upload Modal ──────────────────────
function PhotoUploadModal({ student, token, onClose, onUploaded }: {
  student: Student; token: string; onClose: () => void; onUploaded: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; warnings?: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.type.startsWith('image/')) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('photo', file);
    try {
      const res = await fetch(`/api/students/${student.id}/photo`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: data.message, warnings: data.validationErrors });
        onUploaded();
      } else {
        setResult({ success: false, message: data.message });
      }
    } catch {
      setResult({ success: false, message: 'Erro de conexão' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 32, width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)' }} className="animate-fade-in-up">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Camera size={20} /> Foto — {student.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={20} /></button>
        </div>

        {result ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            {result.success ? <CheckCircle size={48} color="var(--color-success-500)" /> : <AlertTriangle size={48} color="var(--color-danger-500)" />}
            <p style={{ marginTop: 12, fontWeight: 600 }}>{result.message}</p>
            {result.warnings?.map((w, i) => <p key={i} style={{ fontSize: 12, color: 'var(--color-warning-500)' }}>⚠️ {w}</p>)}
            <button onClick={onClose} style={{
              marginTop: 16, padding: '10px 24px', fontSize: 13, fontWeight: 600, background: 'var(--color-primary-600)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            }}>Fechar</button>
          </div>
        ) : (
          <>
            <div
              onDrop={handleDrop} onDragOver={e => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              style={{
                border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: preview ? 0 : 40,
                textAlign: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden',
                minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--color-primary-400)')}
              onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            >
              {preview ? (
                <img src={preview} alt="Preview" style={{ width: '100%', maxHeight: 300, objectFit: 'contain' }} />
              ) : (
                <div>
                  <Upload size={32} style={{ color: 'var(--color-text-muted)', marginBottom: 8 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Clique ou arraste a foto</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>JPG, PNG, WEBP — máx 5MB</p>
                </div>
              )}
              <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>

            {/* Requirements */}
            <div style={{ marginTop: 12, padding: 12, background: 'var(--color-primary-50)', borderRadius: 'var(--radius-md)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
              <strong>Requisitos:</strong> Foto frontal do rosto, fundo claro, sem óculos escuros. Mínimo 200×200px.
            </div>

            <button onClick={handleUpload} disabled={!file || uploading} style={{
              width: '100%', marginTop: 16, padding: '12px 0', fontSize: 14, fontWeight: 700, color: '#fff',
              border: 'none', borderRadius: 'var(--radius-md)', cursor: file ? 'pointer' : 'not-allowed',
              background: file ? 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))' : 'var(--color-border)',
              opacity: uploading ? 0.7 : 1,
            }}>
              {uploading ? '⏳ Enviando...' : '📤 Salvar Foto'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── CSV Import Modal ────────────────────────
function CSVImportModal({ token, onClose, onImported }: {
  token: string; onClose: () => void; onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = (e.target?.result as string).replace(/^\uFEFF/, '');
      const sep = csv.includes(';') ? ';' : ',';
      const lines = csv.split(/\r?\n/).filter(l => l.trim()).slice(0, 6);
      setPreview(lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))));
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/students/import-csv', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      setResult(data);
      if (res.ok) onImported();
    } catch {
      setResult({ message: 'Erro de conexão' });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'Nome;Matrícula;Série;Turma;Turno\nAna Julia Oliveira;2026001;8ª série;8A;manhã\nPedro Henrique Santos;2026002;7ª série;7B;tarde\n';
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo_alunos.csv';
    a.click();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 32, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }} className="animate-fade-in-up">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><FileSpreadsheet size={20} /> Importar CSV</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={20} /></button>
        </div>

        {result ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircle size={48} color="var(--color-success-500)" />
            <p style={{ marginTop: 12, fontWeight: 600 }}>{result.message}</p>
            {result.errors?.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--color-danger-50)', borderRadius: 'var(--radius-md)', textAlign: 'left', maxHeight: 150, overflowY: 'auto' }}>
                {result.errors.map((e: any, i: number) => (
                  <p key={i} style={{ fontSize: 11, color: 'var(--color-danger-600)', margin: '2px 0' }}>Linha {e.line}: {e.error}</p>
                ))}
              </div>
            )}
            <button onClick={onClose} style={{
              marginTop: 16, padding: '10px 24px', fontSize: 13, fontWeight: 600, background: 'var(--color-primary-600)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            }}>Fechar</button>
          </div>
        ) : (
          <>
            {/* Template download */}
            <button onClick={downloadTemplate} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600,
              background: 'var(--color-primary-50)', color: 'var(--color-primary-700)',
              border: '1px solid var(--color-primary-200)', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginBottom: 16,
            }}><Download size={14} /> Baixar modelo CSV</button>

            {/* Drop zone */}
            <div
              onClick={() => inputRef.current?.click()}
              style={{
                border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 30,
                textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--color-primary-400)')}
              onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            >
              <FileSpreadsheet size={28} style={{ color: 'var(--color-text-muted)', marginBottom: 6 }} />
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{file ? `📄 ${file.name}` : 'Clique para selecionar o CSV'}</p>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>CSV separado por ; ou , — UTF-8</p>
              <input ref={inputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>

            {/* Preview table */}
            {preview && (
              <div style={{ marginTop: 16, overflow: 'auto' }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📋 Prévia (primeiras {Math.min(preview.length - 1, 5)} linhas):</p>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{preview[0].map((h, i) => (
                      <th key={i} style={{ padding: '6px 8px', textAlign: 'left', background: 'var(--color-primary-50)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid var(--color-primary-200)' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {preview.slice(1).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        {row.map((cell, ci) => <td key={ci} style={{ padding: '6px 8px' }}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Column hints */}
            <div style={{ marginTop: 12, padding: 12, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
              <strong>Colunas aceitas:</strong> Nome*, Matrícula* (obrigatórias) · Série, Turma, Turno (opcionais)
              <br />Variações: nome, aluno, nome_completo | matricula, ra, registro, codigo
            </div>

            <button onClick={handleImport} disabled={!file || importing} style={{
              width: '100%', marginTop: 16, padding: '12px 0', fontSize: 14, fontWeight: 700, color: '#fff',
              border: 'none', borderRadius: 'var(--radius-md)', cursor: file ? 'pointer' : 'not-allowed',
              background: file ? 'linear-gradient(135deg, var(--color-success-500), var(--color-success-700))' : 'var(--color-border)',
              opacity: importing ? 0.7 : 1,
            }}>
              {importing ? '⏳ Importando...' : `📥 Importar ${preview ? preview.length - 1 : 0} alunos`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Students Page ──────────────────────
export default function Students({ isHubMode = false, hubSchoolId }: { isHubMode?: boolean; hubSchoolId?: string | null }) {
  const { profile, token } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<Student | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', accessId: '', enrollment: '', grade: '', classGroup: '', shift: 'manhã' });
  const [loading, setLoading] = useState(true);
  const [schoolClasses, setSchoolClasses] = useState<any[]>([]);

  const load = () => {
    if (!token) return;
    const query = hubSchoolId ? `?schoolId=${hubSchoolId}` : '';
    Promise.all([
      fetch(`/api/students${query}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`/api/school-classes${query}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([studentsData, classesData]) => {
      setStudents(studentsData.students || []);
      setSchoolClasses(classesData.classes || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [token, hubSchoolId]);

  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || (s.enrollment || '').includes(search) || s.accessId.includes(search));
  const photoStats = { total: students.length, withPhoto: students.filter(s => s.photo).length };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, schoolId: hubSchoolId || undefined };
    await fetch('/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    setShowForm(false); setForm({ name: '', accessId: '', enrollment: '', grade: '', classGroup: '', shift: 'manhã' }); load();
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <div>
          {!isHubMode && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><Users size={22} /> Alunos</h1>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{students.length} alunos cadastrados</p>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowImport(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: 13, fontWeight: 600,
            background: 'var(--color-surface)', color: 'var(--color-success-600)',
            border: '1.5px solid var(--color-success-300)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          }}><FileSpreadsheet size={16} /> Importar CSV</button>
          <a href={`/api/students/export`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: 13, fontWeight: 600,
              background: 'var(--color-surface)', color: 'var(--color-primary-600)',
              border: '1.5px solid var(--color-primary-200)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
              textDecoration: 'none',
            }}
            onClick={e => {
              // Inject auth token via fetch-redirect since <a> can't set headers
              e.preventDefault();
              const exportQuery = hubSchoolId ? `?schoolId=${hubSchoolId}` : '';
              fetch(`/api/students/export${exportQuery}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.blob()).then(blob => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `alunos_${new Date().toISOString().split('T')[0]}.csv`;
                  a.click(); URL.revokeObjectURL(url);
                }).catch(() => {});
            }}
          ><Download size={16} /> Exportar CSV</a>
          <button onClick={() => setShowForm(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600,
            background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          }}><Plus size={16} /> Novo Aluno</button>
        </div>
      </div>

      {/* Photo Stats Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: '12px 18px',
        background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-success-50))',
        borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)',
      }}>
        <Camera size={18} style={{ color: 'var(--color-primary-600)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            <span>Fotos cadastradas</span>
            <span>{photoStats.withPhoto}/{photoStats.total} ({photoStats.total > 0 ? Math.round(photoStats.withPhoto / photoStats.total * 100) : 0}%)</span>
          </div>
          <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, transition: 'width 0.5s ease',
              width: `${photoStats.total > 0 ? (photoStats.withPhoto / photoStats.total * 100) : 0}%`,
              background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-success-500))',
            }} />
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou matrícula..."
          style={{ width: '100%', padding: '10px 14px 10px 40px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none' }}
          onFocus={e => e.target.style.borderColor = 'var(--color-primary-400)'} onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Aluno', 'ID Acesso', 'Matrícula', 'Série', 'Turma', 'Turno', 'Foto', 'Sync', 'Ações', ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} onClick={() => setSelectedStudentId(s.id)} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.15s', cursor: 'pointer' }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--color-bg-subtle)')}
                onMouseOut={e => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: s.photo
                        ? `url(data:image/jpeg;base64,${s.photo.storagePath}) center / cover`
                        : 'var(--color-primary-50)',
                      color: 'var(--color-primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, border: s.photo ? '2px solid var(--color-success-400)' : '2px solid transparent',
                    }}>
                      {!s.photo && s.name.charAt(0)}
                    </div>
                    <div>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      {s.school && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block' }}>{s.school.name}</span>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                    background: 'var(--color-primary-50)', color: 'var(--color-primary-700)',
                    padding: '3px 8px', borderRadius: 'var(--radius-sm)', letterSpacing: '0.02em',
                    border: '1px solid var(--color-primary-200)',
                  }}>{s.accessId}</span>
                </td>
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.enrollment || '—'}</td>
                <td style={{ padding: '12px 16px' }}>{s.grade || '—'}</td>
                <td style={{ padding: '12px 16px' }}><span className="badge badge-neutral">{s.classGroup || '—'}</span></td>
                <td style={{ padding: '12px 16px' }}>{s.shift || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  {s.photo ? (
                    <span className="badge badge-success" style={{ fontSize: 10 }}>
                      {s.photo.validationStatus === 'approved' ? '✅ OK' : '⚠️ Aviso'}
                    </span>
                  ) : (
                    <button onClick={() => setPhotoTarget(s)} style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 600, background: 'var(--color-warning-50)',
                      color: 'var(--color-warning-700)', border: '1px solid var(--color-warning-200)',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}><Camera size={12} /> Enviar</button>
                  )}
                </td>
                <td style={{ padding: '12px 16px' }}>{syncBadge(s.deviceLinks)}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={(e) => { e.stopPropagation(); setPhotoTarget(s); }} style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600, background: 'var(--color-primary-50)',
                    color: 'var(--color-primary-700)', border: '1px solid var(--color-primary-200)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  }}>📷 Foto</button>
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Carregando...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <GraduationCap size={40} style={{ color: 'var(--color-text-muted)', marginBottom: 12 }} />
            <p style={{ fontWeight: 600, margin: 0 }}>Nenhum aluno encontrado</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Cadastre manualmente ou importe um CSV</p>
          </div>
        )}
      </div>

      {/* Create Student Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 32, width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-lg)' }} className="animate-fade-in-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><GraduationCap size={20} /> Novo Aluno</h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Nome completo', key: 'name', type: 'text', required: true },
                { label: 'ID Acesso / Catraca (Apenas Números - Auto-gerado se vazio)', key: 'accessId', type: 'text', required: false },
                { label: 'Matrícula (opcional)', key: 'enrollment', type: 'text', required: false },
              ].map(f => (
                <label key={f.key}>
                  <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{f.label}</span>
                  <input required={f.required} value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', outline: 'none' }}
                  />
                </label>
              ))}

              <label>
                <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Série / Turma / Turno</span>
                <select 
                  required 
                  value={`${form.grade}|${form.classGroup}|${form.shift}`} 
                  onChange={e => {
                    const [g, c, s] = e.target.value.split('|');
                    setForm({ ...form, grade: g, classGroup: c, shift: s });
                  }}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', background: '#fff' }}
                >
                  <option value="||" disabled selected>Selecione no catálogo...</option>
                  {schoolClasses.length === 0 && <option value="Sem Série|Sem Turma|manhã">Nenhuma turma cadastrada. Será salvo como padrão.</option>}
                  {schoolClasses.map(c => (
                    <option key={c.id} value={`${c.grade}|${c.classGroup}|${c.shift}`}>
                      {c.grade} — Turma {c.classGroup} ({c.shift})
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit" style={{
                padding: '10px 0', fontSize: 14, fontWeight: 700, color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginTop: 8,
                background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
              }}>Cadastrar Aluno</button>
            </form>
          </div>
        </div>
      )}

      {/* Photo Upload Modal */}
      {photoTarget && token && (
        <PhotoUploadModal student={photoTarget} token={token} onClose={() => setPhotoTarget(null)} onUploaded={load} />
      )}

      {/* CSV Import Modal */}
      {showImport && token && (
        <CSVImportModal token={token} onClose={() => setShowImport(false)} onImported={load} />
      )}

      {/* Unified Student Dashboard Panel */}
      {selectedStudentId && token && (
        <StudentPanel 
          studentId={selectedStudentId} 
          token={token} 
          onClose={() => setSelectedStudentId(null)} 
          onUpdate={load} 
        />
      )}
    </div>
  );
}
