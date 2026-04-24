import React, { useEffect, useState } from 'react';
import { AlertTriangle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface LicenseSummary {
  status: string;
  plan: string;
  daysLeft: number;
  graceActive: boolean;
  graceUntil: string | null;
  validTo: string;
  isExpiringSoon: boolean;
  usedSchools: number;
  maxSchools: number;
  usedDevices: number;
  maxDevices: number;
}

export function LicenseBanner() {
  const { token, profile } = useAuth();
  const [license, setLicense] = useState<LicenseSummary | null>(null);

  useEffect(() => {
    if (profile?.role !== 'integrator_admin') return;
    fetch('/api/licenses/my-license', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.license ? setLicense(d.license) : null)
      .catch(() => null);
  }, [token, profile]);

  if (!license) return null;

  const { status, plan, daysLeft, graceActive, graceUntil, isExpiringSoon } = license;

  // Blocked
  if (status === 'blocked') {
    return (
      <div style={{
        background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <XCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#991b1b' }}>
            Acesso bloqueado —
          </span>
          <span style={{ fontSize: 13, color: '#7f1d1d', marginLeft: 4 }}>
            Licença {plan.toUpperCase()} vencida. Entre em contato com o suporte para renovar.
          </span>
        </div>
        <a href="mailto:alerta@iacloud.com.br" style={{
          fontSize: 12, fontWeight: 700, color: '#dc2626', textDecoration: 'none',
          border: '1px solid #fca5a5', borderRadius: 6, padding: '4px 10px', whiteSpace: 'nowrap',
        }}>
          Contatar suporte
        </a>
      </div>
    );
  }

  // Grace period
  if (graceActive && graceUntil) {
    return (
      <div style={{
        background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8,
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
            Licença em carência —
          </span>
          <span style={{ fontSize: 13, color: '#78350f', marginLeft: 4 }}>
            Acesso total suspenso em {new Date(graceUntil).toLocaleDateString('pt-BR')}. Renove para evitar bloqueio.
          </span>
        </div>
        <a href="mailto:alerta@iacloud.com.br" style={{
          fontSize: 12, fontWeight: 700, color: '#d97706', textDecoration: 'none',
          border: '1px solid #fdba74', borderRadius: 6, padding: '4px 10px', whiteSpace: 'nowrap',
        }}>
          Renovar
        </a>
      </div>
    );
  }

  // Expiring soon (≤ 7 days)
  if (isExpiringSoon && daysLeft <= 7) {
    return (
      <div style={{
        background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8,
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Clock size={16} color="#ca8a04" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: '#713f12', flex: 1 }}>
          Sua licença <strong>{plan.toUpperCase()}</strong> vence em <strong>{daysLeft} dia(s)</strong>. Entre em contato para renovar.
        </span>
        <a href="mailto:alerta@iacloud.com.br" style={{
          fontSize: 12, fontWeight: 700, color: '#ca8a04', textDecoration: 'none',
          border: '1px solid #fde047', borderRadius: 6, padding: '4px 10px', whiteSpace: 'nowrap',
        }}>
          Renovar
        </a>
      </div>
    );
  }

  // Expiring soon (8–30 days)
  if (isExpiringSoon) {
    return (
      <div style={{
        background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
        padding: '10px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <RefreshCw size={14} color="#16a34a" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: '#14532d' }}>
          Licença <strong>{plan.toUpperCase()}</strong> vence em <strong>{daysLeft} dias</strong>.
        </span>
      </div>
    );
  }

  return null;
}
