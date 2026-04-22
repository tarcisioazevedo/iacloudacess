import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { GraduationCap, BookOpen, HardDrive, ShieldCheck, MessageSquare, Building } from 'lucide-react';

// Import existing pages to use as Tabs
import Students from '../Students';
import Devices from '../Devices';
import SchoolWhatsApp from '../SchoolWhatsApp';

// Import new Tabs
import ClassesTab from '../../components/hub/ClassesTab';
import StaffTab from '../../components/hub/StaffTab';

export default function SchoolHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, token, isDemo } = useAuth();
  const role = profile?.role || '';
  
  // Parse active tab and schoolId from URL or default
  const activeTab = searchParams.get('tab') || 'students';
  const urlSchoolId = searchParams.get('schoolId');

  const [hubSchoolId, setHubSchoolId] = useState<string | null>(urlSchoolId || profile?.schoolId || null);
  const [schools, setSchools] = useState<any[]>([]);

  const isIntegratorOrSuperadmin = ['integrator_admin', 'integrator_support', 'superadmin'].includes(role);

  useEffect(() => {
    // If URL has a schoolId, make sure local state matches
    if (urlSchoolId && urlSchoolId !== hubSchoolId) {
      setHubSchoolId(urlSchoolId);
    }
  }, [urlSchoolId]);

  const setTab = (tab: string) => {
    const params: any = { tab };
    if (hubSchoolId) params.schoolId = hubSchoolId;
    setSearchParams(params);
  };

  const handleSchoolChange = (newSchoolId: string) => {
    setHubSchoolId(newSchoolId);
    setSearchParams({ tab: activeTab, schoolId: newSchoolId });
  };

  useEffect(() => {
    if (!isIntegratorOrSuperadmin || isDemo) return;
    fetch('/api/schools', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setSchools(data.schools || []);
        // Autoselect first school if none is selected
        if (!hubSchoolId && data.schools && data.schools.length > 0) {
          handleSchoolChange(data.schools[0].id);
        }
      })
      .catch(() => {});
  }, [isIntegratorOrSuperadmin, token, isDemo]);

  const isSchoolAdminOrIntegrator = ['school_admin', 'integrator_admin', 'integrator_support', 'superadmin'].includes(role);
  const isOperator = role === 'operator';

  // Tabs config
  const TABS = [
    { id: 'students', label: 'Alunos & Matrículas', icon: <GraduationCap size={16} /> },
    { id: 'classes', label: 'Matrizes & Turmas', icon: <BookOpen size={16} /> },
  ];

  if (!isOperator) {
    TABS.push({ id: 'devices', label: 'Dispositivos', icon: <HardDrive size={16} /> });
  }

  if (isSchoolAdminOrIntegrator) {
    TABS.push({ id: 'staff', label: 'Equipe Escolar', icon: <ShieldCheck size={16} /> });
    TABS.push({ id: 'whatsapp', label: 'WhatsApp Escolar', icon: <MessageSquare size={16} /> });
  }

  // Ensure active tab is valid for role
  useEffect(() => {
    if (!TABS.find(t => t.id === activeTab)) {
      setTab('students');
    }
  }, [activeTab, TABS]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
      
      {/* Premium Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0 4px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--color-primary-900)' }}>Secretaria Acadêmica</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>
            Gestão centralizada de alunos, estrutura escolar e equipamentos essenciais.
          </p>
        </div>
        
        {isIntegratorOrSuperadmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-surface)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            <Building size={16} color="var(--color-text-secondary)" />
            <select
              value={hubSchoolId || ''}
              onChange={(e) => handleSchoolChange(e.target.value)}
              style={{
                border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600,
                color: 'var(--color-primary-800)', outline: 'none', cursor: 'pointer', maxWidth: 200
              }}
            >
              <option value="" disabled>Selecione uma Escola</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Segmented Control / Tabs */}
      <div style={{ 
        display: 'flex', gap: 8, padding: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border)', 
        borderRadius: 'var(--radius-lg)', overflowX: 'auto', flexShrink: 0 
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            style={{
              flex: 1, minWidth: 'max-content', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 16px', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
              background: activeTab === tab.id ? 'var(--color-primary-50)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-primary-700)' : 'var(--color-text-muted)',
              boxShadow: activeTab === tab.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content Container */}
      <div style={{ flex: 1, position: 'relative', minHeight: 400 }}>
        {(!hubSchoolId && isIntegratorOrSuperadmin) ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Building size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
            <p>Selecione uma escola no cabeçalho acima para carregar o Hub Acadêmico.</p>
          </div>
        ) : (
          <>
            {activeTab === 'students' && <Students isHubMode={true} hubSchoolId={hubSchoolId} />}
            {activeTab === 'classes' && <ClassesTab hubSchoolId={hubSchoolId} />}
            {activeTab === 'devices' && <Devices isHubMode={true} hubSchoolId={hubSchoolId} />}
            {activeTab === 'staff' && <StaffTab hubSchoolId={hubSchoolId} />}
            {activeTab === 'whatsapp' && <SchoolWhatsApp isHubMode={true} hubSchoolId={hubSchoolId} />}
          </>
        )}
      </div>
      
    </div>
  );
}
