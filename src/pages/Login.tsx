import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, ChevronRight, X, ArrowLeft, CheckCircle, KeyRound, Check } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { label: 'Superadmin', email: 'admin@plataforma.com', icon: '👑', desc: 'Visão global da plataforma' },
  { label: 'Integrador', email: 'integrador@techseg.com', icon: '🏗️', desc: 'Gestão de portfólio' },
  { label: 'Diretora', email: 'diretor@colegio.com', icon: '🎓', desc: 'Cockpit escolar' },
];

type RegStep = 'idle' | 'form' | 'otp' | 'success';
type ForgotStep = 'idle' | 'email' | 'sent' | 'reset' | 'done';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 14,
  border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  outline: 'none', fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
};

export default function Login() {
  const { login, setAuthFromRegistration } = useAuth() as any;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  // Forgot/Reset password state
  const [forgotStep, setForgotStep] = useState<ForgotStep>('idle');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [passwordRules, setPasswordRules] = useState<{id:string;label:string;regex:string}[]>([]);

  // Check URL for reset token on mount
  useEffect(() => {
    const token = searchParams.get('reset');
    const emailParam = searchParams.get('email');
    if (token && emailParam) {
      setResetToken(token);
      setForgotEmail(emailParam);
      setForgotStep('reset');
      // Clean URL
      setSearchParams({}, { replace: true });
    }
    // Fetch password policy rules
    fetch('/api/auth/password-policy').then(r => r.json()).then(d => {
      if (d.rules) setPasswordRules(d.rules);
    }).catch(() => {});
  }, []);

  // Registration modal state
  const [regStep, setRegStep] = useState<RegStep>('idle');
  const [regData, setRegData] = useState({ companyName: '', adminName: '', email: '', password: '' });
  const [regOtp, setRegOtp] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ─── Login ──────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar login');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setError('');
    setLoading(true);
    try {
      await login(demoEmail, 'admin123');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar login');
    } finally {
      setLoading(false);
    }
  };

  // ─── Registration — Step 1 ──────────────────

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/trial/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regData),
      });
      const data = await res.json();
      if (!res.ok) { setRegError(data.message); return; }
      setRegOtp('');
      setRegStep('otp');
    } catch {
      setRegError('Erro de conexão. Tente novamente.');
    } finally {
      setRegLoading(false);
    }
  };

  // ─── Registration — Step 2 (OTP) ────────────

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regOtp.length !== 6) { setRegError('Digite os 6 dígitos do código.'); return; }
    setRegError('');
    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/trial/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: regData.email, otp: regOtp }),
      });
      const data = await res.json();
      if (!res.ok) { setRegError(data.message); return; }

      // Auto-login via context if available
      if (typeof setAuthFromRegistration === 'function') {
        setAuthFromRegistration(data.accessToken, data.profile);
      }
      setRegStep('success');
    } catch {
      setRegError('Erro de conexão. Tente novamente.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleResend = async () => {
    setRegError('');
    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/trial/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regData.email }),
      });
      const data = await res.json();
      if (!res.ok) { setRegError(data.message); return; }
      setRegError('✓ Novo código enviado.');
    } catch {
      setRegError('Erro ao reenviar código.');
    } finally {
      setRegLoading(false);
    }
  };

  // OTP input — 6 individual digit boxes
  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const arr = regOtp.split('').concat(Array(6).fill('')).slice(0, 6);
    arr[i] = digit;
    setRegOtp(arr.join(''));
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !regOtp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) { setRegOtp(text); otpRefs.current[5]?.focus(); }
    e.preventDefault();
  };

  const resetReg = () => {
    setRegStep('idle');
    setRegData({ companyName: '', adminName: '', email: '', password: '' });
    setRegOtp('');
    setRegError('');
  };

  // ─── Forgot Password ───────────────────────

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      await res.json();
      setForgotStep('sent');
    } catch {
      setForgotError('Erro de conexão. Tente novamente.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetPassword !== resetConfirm) {
      setForgotError('As senhas não conferem');
      return;
    }
    setForgotError('');
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, token: resetToken, newPassword: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotError(data.errors ? data.errors.join('. ') : data.message);
        return;
      }
      setForgotStep('done');
    } catch {
      setForgotError('Erro de conexão. Tente novamente.');
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgot = () => {
    setForgotStep('idle');
    setForgotEmail('');
    setForgotError('');
    setResetToken('');
    setResetPw('');
    setResetConfirm('');
  };

  const goToDashboard = () => {
    resetReg();
    navigate('/dashboard', { replace: true });
  };

  // ─── Render ─────────────────────────────────

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 50,
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  };

  const modalStyle: React.CSSProperties = {
    width: '100%', maxWidth: 440,
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-xl)',
    padding: '40px 36px',
    boxShadow: 'var(--shadow-lg)',
    position: 'relative',
  };

  return (
    <>
      {/* ── Registration Modal ── */}
      {regStep !== 'idle' && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) resetReg(); }}>
          <div style={modalStyle} className="animate-fade-in-up">

            {/* Close */}
            <button onClick={resetReg} style={{
              position: 'absolute', top: 16, right: 16, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4,
            }}>
              <X size={18} />
            </button>

            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
              {['Dados', 'Verificação', 'Concluído'].map((label, idx) => {
                const stepNum = idx + 1;
                const current = regStep === 'form' ? 1 : regStep === 'otp' ? 2 : 3;
                const active  = stepNum === current;
                const done    = stepNum < current;
                return (
                  <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height: 3, borderRadius: 99, marginBottom: 6,
                      background: done || active ? 'var(--color-primary-600)' : 'var(--color-border)',
                      transition: 'background 0.3s',
                    }} />
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: active ? 'var(--color-primary-700)' : done ? 'var(--color-primary-500)' : 'var(--color-text-muted)',
                    }}>{label}</span>
                  </div>
                );
              })}
            </div>

            {/* ── Step: form ── */}
            {regStep === 'form' && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: 'var(--color-text)' }}>
                  Solicitar demonstração
                </h2>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
                  Crie sua conta de avaliação gratuita: <strong>1 escola · 1 dispositivo · 7 dias</strong>.
                </p>
                <form onSubmit={handleInitiate}>
                  {[
                    { label: 'Nome da empresa', key: 'companyName', placeholder: 'Colégio Exemplo', type: 'text' },
                    { label: 'Seu nome', key: 'adminName', placeholder: 'João Silva', type: 'text' },
                    { label: 'E-mail', key: 'email', placeholder: 'joao@escola.com.br', type: 'email' },
                    { label: 'Senha', key: 'password', placeholder: '••••••••', type: 'password' },
                  ].map(f => (
                    <label key={f.key} style={{ display: 'block', marginBottom: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: 5 }}>
                        {f.label}
                      </span>
                      <input
                        type={f.type}
                        required
                        minLength={f.key === 'password' ? 6 : 2}
                        placeholder={f.placeholder}
                        value={(regData as any)[f.key]}
                        onChange={e => setRegData(d => ({ ...d, [f.key]: e.target.value }))}
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                        onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                      />
                    </label>
                  ))}

                  {regError && (
                    <div style={{ padding: '9px 12px', marginBottom: 14, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                      {regError}
                    </div>
                  )}

                  <button type="submit" disabled={regLoading} style={{
                    width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                    color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                    cursor: regLoading ? 'wait' : 'pointer',
                    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {regLoading ? 'Enviando código...' : 'Enviar código de verificação'}
                  </button>
                </form>
              </>
            )}

            {/* ── Step: otp ── */}
            {regStep === 'otp' && (
              <>
                <button onClick={() => setRegStep('form')} style={{
                  background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 6, color: 'var(--color-text-muted)', fontSize: 13,
                  padding: 0, marginBottom: 20, fontFamily: 'var(--font-sans)',
                }}>
                  <ArrowLeft size={14} /> Voltar
                </button>

                <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: 'var(--color-text)' }}>
                  Confirme seu e-mail
                </h2>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
                  Enviamos um código de 6 dígitos para<br />
                  <strong style={{ color: 'var(--color-text)' }}>{regData.email}</strong>
                </p>

                <form onSubmit={handleConfirm}>
                  {/* OTP input boxes */}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }} onPaste={handleOtpPaste}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <input
                        key={i}
                        ref={el => { otpRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={regOtp[i] || ''}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        style={{
                          width: 46, height: 54, textAlign: 'center', fontSize: 22, fontWeight: 700,
                          border: `2px solid ${regOtp[i] ? 'var(--color-primary-500)' : 'var(--color-border)'}`,
                          borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)',
                          outline: 'none', color: 'var(--color-text)',
                          background: regOtp[i] ? 'var(--color-primary-50)' : 'var(--color-surface)',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onFocus={e => { e.target.style.borderColor = 'var(--color-primary-600)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-100)'; }}
                        onBlur={e => { e.target.style.boxShadow = 'none'; }}
                      />
                    ))}
                  </div>

                  {regError && (
                    <div style={{
                      padding: '9px 12px', marginBottom: 14, borderRadius: 'var(--radius-sm)', fontSize: 13,
                      background: regError.startsWith('✓') ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                      color: regError.startsWith('✓') ? 'var(--color-success)' : 'var(--color-danger)',
                    }}>
                      {regError}
                    </div>
                  )}

                  <button type="submit" disabled={regLoading || regOtp.length !== 6} style={{
                    width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                    color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                    cursor: (regLoading || regOtp.length !== 6) ? 'not-allowed' : 'pointer',
                    background: regOtp.length === 6
                      ? 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))'
                      : 'var(--color-border)',
                    fontFamily: 'var(--font-sans)', transition: 'background 0.2s',
                  }}>
                    {regLoading ? 'Verificando...' : 'Confirmar e criar conta'}
                  </button>
                </form>

                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 16 }}>
                  Não recebeu?{' '}
                  <button onClick={handleResend} disabled={regLoading} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-600)',
                    fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
                  }}>
                    Reenviar código
                  </button>
                </p>
              </>
            )}

            {/* ── Step: success ── */}
            {regStep === 'success' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'var(--color-success-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px',
                }}>
                  <CheckCircle size={32} color="var(--color-success)" />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>Conta criada!</h2>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '0 0 8px', lineHeight: 1.6 }}>
                  Sua avaliação gratuita está ativa.
                </p>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
                  <strong>1 escola · 1 dispositivo · 7 dias</strong>
                </p>
                <button onClick={goToDashboard} style={{
                  width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                  color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
                  fontFamily: 'var(--font-sans)',
                }}>
                  Ir para o painel
                </button>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
                  Enviamos um e-mail de boas-vindas com os próximos passos.
                </p>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Forgot/Reset Password Modal ── */}
      {forgotStep !== 'idle' && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) resetForgot(); }}>
          <div style={modalStyle} className="animate-fade-in-up">
            <button onClick={resetForgot} style={{
              position: 'absolute', top: 16, right: 16, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4,
            }}>
              <X size={18} />
            </button>

            {/* Icon */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto',
                background: 'linear-gradient(135deg, var(--color-primary-100), var(--color-primary-200))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <KeyRound size={26} color="var(--color-primary-700)" />
              </div>
            </div>

            {/* Step: email */}
            {forgotStep === 'email' && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: 'var(--color-text)', textAlign: 'center' }}>
                  Recuperar senha
                </h2>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.5 }}>
                  Informe o e-mail associado à sua conta e enviaremos um link para redefinir sua senha.
                </p>
                <form onSubmit={handleForgotSubmit}>
                  <label style={{ display: 'block', marginBottom: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 5 }}>E-mail</span>
                    <input type="email" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      placeholder="seu@email.com" style={inputStyle}
                      onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                      onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                    />
                  </label>
                  {forgotError && (
                    <div style={{ padding: '9px 12px', marginBottom: 14, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                      {forgotError}
                    </div>
                  )}
                  <button type="submit" disabled={forgotLoading} style={{
                    width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                    color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                    cursor: forgotLoading ? 'wait' : 'pointer',
                    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {forgotLoading ? 'Enviando...' : 'Enviar link de recuperação'}
                  </button>
                </form>
              </>
            )}

            {/* Step: sent */}
            {forgotStep === 'sent' && (
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>E-mail enviado!</h2>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>
                  Se <strong>{forgotEmail}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
                </p>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 24px' }}>
                  Verifique sua caixa de entrada e a pasta de spam.
                </p>
                <button onClick={resetForgot} style={{
                  width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                  color: 'var(--color-primary-700)', border: '1.5px solid var(--color-primary-300)',
                  borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'var(--color-primary-50)',
                  fontFamily: 'var(--font-sans)',
                }}>
                  Voltar ao login
                </button>
              </div>
            )}

            {/* Step: reset (new password form) */}
            {forgotStep === 'reset' && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', textAlign: 'center' }}>Nova senha</h2>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 24px', textAlign: 'center' }}>
                  Crie uma nova senha para <strong>{forgotEmail}</strong>
                </p>
                <form onSubmit={handleResetSubmit}>
                  <label style={{ display: 'block', marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 5 }}>Nova senha</span>
                    <input type="password" required value={resetPassword} onChange={e => setResetPw(e.target.value)}
                      placeholder="••••••••" style={inputStyle}
                      onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                      onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                    />
                  </label>
                  {/* Password policy indicators */}
                  {passwordRules.length > 0 && (
                    <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {passwordRules.map(rule => {
                        const met = new RegExp(rule.regex).test(resetPassword);
                        return (
                          <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                            color: met ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                            <Check size={12} style={{ opacity: met ? 1 : 0.3 }} />
                            {rule.label}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <label style={{ display: 'block', marginBottom: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 5 }}>Confirmar senha</span>
                    <input type="password" required value={resetConfirm} onChange={e => setResetConfirm(e.target.value)}
                      placeholder="••••••••" style={inputStyle}
                      onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                      onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                    />
                  </label>
                  {forgotError && (
                    <div style={{ padding: '9px 12px', marginBottom: 14, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                      {forgotError}
                    </div>
                  )}
                  <button type="submit" disabled={forgotLoading} style={{
                    width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                    color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                    cursor: forgotLoading ? 'wait' : 'pointer',
                    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {forgotLoading ? 'Redefinindo...' : 'Redefinir senha'}
                  </button>
                </form>
              </>
            )}

            {/* Step: done */}
            {forgotStep === 'done' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', background: 'var(--color-success-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                }}>
                  <CheckCircle size={32} color="var(--color-success)" />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>Senha redefinida!</h2>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '0 0 24px' }}>
                  Sua senha foi alterada com sucesso. Faça login com a nova senha.
                </p>
                <button onClick={resetForgot} style={{
                  width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                  color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
                  fontFamily: 'var(--font-sans)',
                }}>
                  Ir para o login
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Login Card ── */}
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--color-primary-800) 0%, var(--color-primary-900) 50%, #0a1f30 100%)',
        padding: 20,
      }}>
        <div style={{
          width: '100%', maxWidth: 440,
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          padding: '48px 40px',
          boxShadow: 'var(--shadow-lg)',
        }} className="animate-fade-in-up">

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={24} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-primary-800)', margin: 0 }}>
                Controle de Acesso
              </h1>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, fontWeight: 500 }}>
                Plataforma Escolar
              </p>
            </div>
          </div>

          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '16px 0 32px' }}>
            Operação em tempo real para escolas, integradores e suporte técnico.
          </p>

          {/* Login form */}
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: 6 }}>
                E-mail
              </span>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                style={{ ...inputStyle }}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 24 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: 6 }}>
                Senha
              </span>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputStyle }}
                onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
              />
            </label>

            {error && (
              <div style={{
                padding: '10px 14px', marginBottom: 16,
                background: 'var(--color-danger-bg)', color: 'var(--color-danger)',
                borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                cursor: loading ? 'wait' : 'pointer',
                background: loading
                  ? 'var(--color-primary-400)'
                  : 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
                transition: 'opacity 0.2s', fontFamily: 'var(--font-sans)',
              }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 24, marginBottom: 0 }}>
            <button
              onClick={() => setForgotStep('email')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-primary-600)', fontSize: 12, fontWeight: 600,
                fontFamily: 'var(--font-sans)', textDecoration: 'underline',
              }}
            >
              Esqueci minha senha
            </button>
          </p>

          {/* Trial CTA */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button
              onClick={() => setRegStep('form')}
              style={{
                width: '100%', padding: '11px 0', fontSize: 13, fontWeight: 700,
                color: 'var(--color-primary-700)',
                border: '1.5px solid var(--color-primary-300)',
                borderRadius: 'var(--radius-md)', cursor: 'pointer',
                background: 'var(--color-primary-50)',
                fontFamily: 'var(--font-sans)', transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-100)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-primary-50)')}
            >
              🚀 Solicitar demonstração gratuita
            </button>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
              1 escola · 1 dispositivo · 7 dias · sem cartão
            </p>
          </div>

          {/* Demo Access */}
          <div style={{ marginTop: 20, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
            <button
              onClick={() => setShowDemo(!showDemo)}
              style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)',
              }}
            >
              ⚡ Acesso Demo
              <ChevronRight size={12} style={{ transform: showDemo ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {showDemo && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DEMO_ACCOUNTS.map(d => (
                  <button
                    key={d.email}
                    onClick={() => handleDemoLogin(d.email)}
                    disabled={loading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-bg)', cursor: 'pointer', width: '100%',
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-primary-400)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary-50)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg)'; }}
                  >
                    <span style={{ fontSize: 20 }}>{d.icon}</span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{d.desc}</div>
                    </div>
                    <ChevronRight size={14} color="var(--color-text-muted)" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
