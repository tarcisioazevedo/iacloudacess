import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Activity, ServerCrash, Zap, RefreshCw } from 'lucide-react';

interface DiagnosticDevice {
  id: string;
  name: string;
  location: string;
  firmwareVer?: string;
}

export default function DeviceDiagnostics() {
  const { token, profile } = useAuth();
  const [activeSockets, setActiveSockets] = useState<DiagnosticDevice[]>([]);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    if (!token) return;
    fetch('/api/diagnostics/active-sockets', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setActiveSockets(data.connectedDevices || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [token]);

  const handlePing = async (id: string) => {
    setPinging(true);
    setPingResult('Testando túnel TCP reverso...');
    try {
      const res = await fetch(`/api/diagnostics/device/${id}/ping`, { 
        method: 'POST', 
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.status === 'online') {
        setPingResult(`✅ Real-Time Socket OK: ${data.latency}`);
      } else {
        setPingResult(`❌ Falha: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setPingResult(`❌ Erro: ${err.message}`);
    } finally {
      setPinging(false);
    }
  };

  if (profile?.role === 'school_admin' || profile?.role === 'school_operator') {
    return <div style={{ padding: 40, textAlign: 'center' }}>Acesso Restrito ao Suporte Técnico (Engenharia de Redes).</div>;
  }

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={22} color="var(--color-primary-500)" /> Diagnóstico de Redes (CGI Auto-Register)
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Monitoramento em tempo real de túneis TCP Reversos
          </p>
        </div>
        <button onClick={loadData} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer'
        }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} color="orange" /> Sessões Tunnelling Ativas (Holdings TCP)
          </h3>
          
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Mapeando sockets...</div>
          ) : activeSockets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
              <ServerCrash size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              Não há nenhuma catraca com túnel TCP/HTTP mantido ativamente no momento. <br/>
              <span style={{ fontSize: 11 }}>Verifique se o firmware suporta "Registro automático de CGI".</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Túnel ID / Catraca</th>
                  <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Localização</th>
                  <th style={{ padding: 12, textAlign: 'center', fontWeight: 600 }}>CGI Multiplexing</th>
                  <th style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>Ações de Eng.</th>
                </tr>
              </thead>
              <tbody>
                {activeSockets.map(device => (
                  <tr key={device.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600 }}>{device.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>ID: {device.id}</div>
                    </td>
                    <td style={{ padding: 12 }}>{device.location}</td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      <span className="badge badge-success">ESTABLISHED</span>
                    </td>
                    <td style={{ padding: 12, textAlign: 'right' }}>
                      <button 
                        disabled={pinging}
                        onClick={() => handlePing(device.id)}
                        style={{ padding: '6px 12px', background: '#000', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                        Medir Latência TCP (Ping)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pingResult && (
            <div style={{ marginTop: 24, padding: 16, background: '#f8f9fa', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: 12, color: pingResult.includes('❌') ? 'red' : 'green' }}>
              &gt; {pingResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
