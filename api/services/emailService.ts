import { createRequire } from 'module';

function loadNodemailer() {
  try {
    const require = createRequire(import.meta.url);
    return require('nodemailer') as {
      createTransport: (config: unknown) => { sendMail: (payload: unknown) => Promise<void> };
    };
  } catch {
    return null;
  }
}

// Configure via environment variables:
//   SMTP_HOST=www701.your-server.de
//   SMTP_PORT=587
//   SMTP_USER=alerta@iacloud.com.br
//   SMTP_PASS=<password>
//   SMTP_FROM="IA Cloud Access <alerta@iacloud.com.br>"

const nodemailer = loadNodemailer();

const transporter = nodemailer?.createTransport({
  host: process.env.SMTP_HOST || 'www701.your-server.de',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER || 'alerta@iacloud.com.br',
    pass: process.env.SMTP_PASS || '',
  },
  tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
}) || null;

const FROM = process.env.SMTP_FROM || 'IA Cloud Access <alerta@iacloud.com.br>';

export async function sendOtpEmail(to: string, recipientName: string, otp: string): Promise<void> {
  if (!transporter) {
    console.warn(`[Email] nodemailer not installed. OTP email skipped for ${to}.`);
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1b4965,#0a1f30);padding:32px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;background:rgba(255,255,255,0.15);border-radius:8px;display:inline-block;line-height:36px;text-align:center;font-size:20px;">🛡️</div>
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em;">IA Cloud Access</span>
              </div>
              <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:13px;">Plataforma Escolar de Controle de Acesso</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">Olá, ${recipientName}!</p>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 28px;">
                Recebemos seu pedido de demonstração gratuita. Use o código abaixo para confirmar seu e-mail e ativar sua conta de avaliação.
              </p>

              <!-- OTP Box -->
              <div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:10px;padding:28px;text-align:center;margin-bottom:28px;">
                <p style="color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Seu código de verificação</p>
                <div style="font-size:42px;font-weight:800;letter-spacing:0.18em;color:#1b4965;font-family:'Courier New',monospace;">${otp}</div>
                <p style="color:#94a3b8;font-size:12px;margin:12px 0 0;">⏱ Válido por <strong>15 minutos</strong></p>
              </div>

              <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 4px;">
                Sua avaliação inclui:
              </p>
              <ul style="color:#6b7280;font-size:13px;line-height:1.8;margin:0 0 28px;padding-left:20px;">
                <li><strong>1 escola</strong> cadastrada</li>
                <li><strong>1 dispositivo</strong> facial</li>
                <li><strong>7 dias</strong> de acesso completo</li>
              </ul>

              <p style="color:#9ca3af;font-size:12px;margin:0;">
                Se você não solicitou este acesso, ignore este e-mail com segurança.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                IA Cloud Access · Suporte: <a href="mailto:alerta@iacloud.com.br" style="color:#1b4965;text-decoration:none;">alerta@iacloud.com.br</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from:    FROM,
    to,
    subject: `${otp} — Seu código de verificação IA Cloud Access`,
    html,
    text: `Olá, ${recipientName}!\n\nSeu código de verificação: ${otp}\n\nVálido por 15 minutos.\n\nSe não solicitou, ignore este e-mail.`,
  });
}

export async function sendWelcomeEmail(to: string, recipientName: string, companyName: string, loginUrl: string): Promise<void> {
  if (!transporter) {
    console.warn(`[Email] nodemailer not installed. Welcome email skipped for ${to}.`);
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1b4965,#0a1f30);padding:32px 40px;text-align:center;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;">🛡️ IA Cloud Access</span>
            <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:13px;">Conta de avaliação criada com sucesso!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 16px;">Bem-vindo(a), ${recipientName}!</p>
            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
              A conta de avaliação de <strong>${companyName}</strong> foi criada. Você tem 7 dias para explorar a plataforma.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#1b4965,#0a1f30);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:700;">
                Acessar Plataforma
              </a>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">Dúvidas? Entre em contato: alerta@iacloud.com.br</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from:    FROM,
    to,
    subject: `Bem-vindo(a) ao IA Cloud Access — ${companyName}`,
    html,
    text: `Bem-vindo(a), ${recipientName}! Sua conta de avaliação de ${companyName} foi criada. Acesse: ${loginUrl}`,
  });
}

// ─── Shared layout helpers ────────────────────────────────────────────────────

function emailWrapper(headerText: string, headerSub: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1b4965,#0a1f30);padding:32px 40px;text-align:center;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;">🛡️ IA Cloud Access</span>
            <p style="color:rgba(255,255,255,0.65);margin:8px 0 0;font-size:13px;">${headerText}</p>
            ${headerSub ? `<p style="color:rgba(255,255,255,0.45);margin:4px 0 0;font-size:12px;">${headerSub}</p>` : ''}
          </td>
        </tr>
        <tr><td style="padding:36px 40px 28px;">${bodyHtml}</td></tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:18px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              IA Cloud Access &middot; Suporte: <a href="mailto:alerta@iacloud.com.br" style="color:#1b4965;text-decoration:none;">alerta@iacloud.com.br</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(url: string, label: string, color = '#1b4965'): string {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${url}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;">${label}</a>
  </div>`;
}

function infoBox(content: string, borderColor = '#cbd5e1', bg = '#f8fafc'): string {
  return `<div style="background:${bg};border-left:4px solid ${borderColor};border-radius:6px;padding:16px 20px;margin:20px 0;">${content}</div>`;
}

// ─── License expiry warnings (30d / 14d / 7d / 3d / 1d) ──────────────────────

export async function sendLicenseExpiryWarning(
  to: string,
  opts: { recipientName: string; integratorName: string; plan: string; daysLeft: number; validTo: Date },
): Promise<void> {
  if (!transporter) return;

  const { recipientName, integratorName, plan, daysLeft, validTo } = opts;
  const urgency  = daysLeft <= 1 ? '🔴' : daysLeft <= 7 ? '🟠' : '🟡';
  const subject  = daysLeft <= 1
    ? `${urgency} Sua licença ${plan} vence AMANHÃ — renove agora`
    : `${urgency} Licença ${plan} vence em ${daysLeft} dia(s) — ${integratorName}`;

  const borderColor = daysLeft <= 1 ? '#ef4444' : daysLeft <= 7 ? '#f97316' : '#eab308';
  const bg          = daysLeft <= 1 ? '#fef2f2' : daysLeft <= 7 ? '#fff7ed' : '#fefce8';

  const body = `
    <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">Olá, ${recipientName}!</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
      A licença <strong>${plan.toUpperCase()}</strong> da empresa <strong>${integratorName}</strong> está próxima do vencimento.
    </p>
    ${infoBox(`
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color:#6b7280;font-size:13px;padding:4px 0;">Plano</td>
          <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">${plan.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;font-size:13px;padding:4px 0;">Vencimento</td>
          <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">${validTo.toLocaleDateString('pt-BR')}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;font-size:13px;padding:4px 0;">Dias restantes</td>
          <td style="color:${borderColor};font-size:14px;font-weight:800;text-align:right;">${daysLeft} dia(s)</td>
        </tr>
      </table>
    `, borderColor, bg)}
    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 4px;">
      Após o vencimento, há um <strong>período de carência de 12 dias</strong> antes do bloqueio total.
      Durante esse período, os dispositivos continuam operando, mas novas escolas e equipamentos ficam bloqueados.
    </p>
    ${btn(`${process.env.APP_URL ?? 'https://app.iacloud.com.br'}/licenses`, 'Renovar Licença Agora')}
    <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">
      Em caso de dúvidas, entre em contato com o suporte: alerta@iacloud.com.br
    </p>`;

  await transporter.sendMail({
    from: FROM, to, subject,
    html: emailWrapper('Aviso de Vencimento de Licença', integratorName, body),
    text: `${recipientName}, sua licença ${plan} da empresa ${integratorName} vence em ${daysLeft} dia(s) (${validTo.toLocaleDateString('pt-BR')}). Renove em: ${process.env.APP_URL ?? ''}/licenses`,
  });
}

// ─── Grace period started ─────────────────────────────────────────────────────

export async function sendLicenseGraceStarted(
  to: string,
  opts: { recipientName: string; integratorName: string; plan: string; graceUntil: Date },
): Promise<void> {
  if (!transporter) return;

  const { recipientName, integratorName, plan, graceUntil } = opts;
  const body = `
    <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">Atenção, ${recipientName}!</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
      A licença <strong>${plan.toUpperCase()}</strong> de <strong>${integratorName}</strong> venceu e entrou em <strong>período de carência</strong>.
    </p>
    ${infoBox(`
      <p style="color:#92400e;font-size:13px;font-weight:700;margin:0 0 8px;">⚠️ O que acontece durante a carência:</p>
      <ul style="color:#78350f;font-size:13px;line-height:1.8;margin:0;padding-left:18px;">
        <li>Dispositivos e escolas existentes <strong>continuam funcionando</strong></li>
        <li>Novas escolas e dispositivos estão <strong>bloqueados</strong></li>
        <li>Acesso será <strong>totalmente suspenso em ${graceUntil.toLocaleDateString('pt-BR')}</strong></li>
      </ul>
    `, '#f59e0b', '#fffbeb')}
    ${btn(`${process.env.APP_URL ?? 'https://app.iacloud.com.br'}/licenses`, '🔄 Renovar Agora — Evite o Bloqueio', '#d97706')}
    <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">
      Suporte: alerta@iacloud.com.br
    </p>`;

  await transporter.sendMail({
    from: FROM, to,
    subject: `🟠 Licença ${plan} expirada — período de carência até ${graceUntil.toLocaleDateString('pt-BR')}`,
    html: emailWrapper('Período de Carência Ativado', integratorName, body),
    text: `${recipientName}, a licença ${plan} de ${integratorName} venceu. Período de carência ativo até ${graceUntil.toLocaleDateString('pt-BR')}. Renove em: ${process.env.APP_URL ?? ''}/licenses`,
  });
}

// ─── License hard blocked ─────────────────────────────────────────────────────

export async function sendLicenseBlocked(
  to: string,
  opts: { recipientName: string; integratorName: string; plan: string },
): Promise<void> {
  if (!transporter) return;

  const { recipientName, integratorName, plan } = opts;
  const body = `
    <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">Atenção, ${recipientName}!</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
      A licença <strong>${plan.toUpperCase()}</strong> de <strong>${integratorName}</strong> foi <strong>bloqueada</strong> após o encerramento do período de carência.
    </p>
    ${infoBox(`
      <p style="color:#991b1b;font-size:13px;font-weight:700;margin:0 0 8px;">🚫 Impacto imediato:</p>
      <ul style="color:#7f1d1d;font-size:13px;line-height:1.8;margin:0;padding-left:18px;">
        <li>Todos os dispositivos <strong>pararam de registrar acessos</strong></li>
        <li>Login na plataforma está <strong>bloqueado</strong></li>
        <li>Notificações WhatsApp e e-mail estão <strong>suspensas</strong></li>
      </ul>
    `, '#ef4444', '#fef2f2')}
    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 4px;">
      Entre em contato com o suporte IA Cloud para regularizar e restaurar o acesso.
    </p>
    ${btn('mailto:alerta@iacloud.com.br', '📧 Contatar Suporte Agora', '#dc2626')}`;

  await transporter.sendMail({
    from: FROM, to,
    subject: `🚫 Acesso bloqueado — licença ${plan} de ${integratorName} vencida`,
    html: emailWrapper('Licença Bloqueada', integratorName, body),
    text: `${recipientName}, a licença ${plan} de ${integratorName} foi bloqueada. Todos os dispositivos pararam. Entre em contato: alerta@iacloud.com.br`,
  });
}

// ─── Trial expiry warnings (D-2 / D-1) ───────────────────────────────────────

export async function sendTrialExpiryWarning(
  to: string,
  opts: { recipientName: string; companyName: string; daysLeft: number; validTo: Date },
): Promise<void> {
  if (!transporter) return;

  const { recipientName, companyName, daysLeft, validTo } = opts;
  const body = `
    <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">Olá, ${recipientName}!</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Seu período de avaliação gratuita da <strong>${companyName}</strong> encerra em <strong>${daysLeft} dia(s)</strong>.
    </p>
    ${infoBox(`
      <p style="color:#92400e;font-size:13px;font-weight:700;margin:0 0 8px;">⏱️ Trial encerra em: ${validTo.toLocaleDateString('pt-BR')}</p>
      <p style="color:#78350f;font-size:13px;margin:0;">
        Após o vencimento, o acesso é <strong>bloqueado imediatamente</strong>, sem período de carência.
        Todos os dados permanecem preservados.
      </p>
    `, '#f59e0b', '#fffbeb')}
    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 4px;">
      Gostou da plataforma? Entre em contato para conhecer nossos planos e continuar sem interrupção.
    </p>
    ${btn('mailto:alerta@iacloud.com.br', '💬 Falar com Consultor', '#d97706')}`;

  await transporter.sendMail({
    from: FROM, to,
    subject: `⏱️ Seu trial encerra em ${daysLeft} dia(s) — ${companyName}`,
    html: emailWrapper('Trial Expirando', companyName, body),
    text: `${recipientName}, seu trial de ${companyName} encerra em ${daysLeft} dia(s) (${validTo.toLocaleDateString('pt-BR')}). Entre em contato: alerta@iacloud.com.br`,
  });
}

// ─── Trial blocked ────────────────────────────────────────────────────────────

export async function sendTrialBlocked(
  to: string,
  opts: { recipientName: string; companyName: string },
): Promise<void> {
  if (!transporter) return;

  const { recipientName, companyName } = opts;
  const body = `
    <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">Olá, ${recipientName}!</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
      O período de avaliação gratuita de <strong>${companyName}</strong> encerrou e o acesso foi bloqueado.
    </p>
    ${infoBox(`
      <p style="color:#374151;font-size:13px;margin:0;">
        📦 Seus dados estão preservados. Para reativar o acesso, basta contratar um dos nossos planos.
      </p>
    `, '#6b7280', '#f9fafb')}
    ${btn('mailto:alerta@iacloud.com.br', '🚀 Quero Contratar um Plano')}`;

  await transporter.sendMail({
    from: FROM, to,
    subject: `Trial encerrado — ${companyName}`,
    html: emailWrapper('Período de Avaliação Encerrado', companyName, body),
    text: `${recipientName}, o trial de ${companyName} encerrou. Seus dados estão preservados. Entre em contato: alerta@iacloud.com.br`,
  });
}

// ─── School billing warning ───────────────────────────────────────────────────

export async function sendSchoolBillingWarning(
  to: string,
  opts: { recipientName: string; schoolName: string; blockAt: Date },
): Promise<void> {
  if (!transporter) return;

  const { recipientName, schoolName, blockAt } = opts;
  const body = `
    <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">Atenção, ${recipientName}!</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
      A escola <strong>${schoolName}</strong> possui pagamento pendente. Se não regularizado, o acesso será bloqueado automaticamente.
    </p>
    ${infoBox(`
      <p style="color:#92400e;font-size:13px;font-weight:700;margin:0 0 6px;">📅 Bloqueio automático previsto para: ${blockAt.toLocaleDateString('pt-BR')}</p>
      <p style="color:#78350f;font-size:13px;margin:0;">Após o bloqueio, os dispositivos da escola param de funcionar.</p>
    `, '#f59e0b', '#fffbeb')}`;

  await transporter.sendMail({
    from: FROM, to,
    subject: `⚠️ Pagamento pendente — ${schoolName} será bloqueada em ${blockAt.toLocaleDateString('pt-BR')}`,
    html: emailWrapper('Aviso de Inadimplência', schoolName, body),
    text: `${recipientName}, a escola ${schoolName} será bloqueada em ${blockAt.toLocaleDateString('pt-BR')} por inadimplência.`,
  });
}

// ─── School billing blocked ───────────────────────────────────────────────────

export async function sendSchoolBillingBlocked(
  to: string,
  opts: { recipientName: string; schoolName: string },
): Promise<void> {
  if (!transporter) return;

  const { recipientName, schoolName } = opts;
  const body = `
    <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">Atenção, ${recipientName}!</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
      A escola <strong>${schoolName}</strong> foi <strong>bloqueada por inadimplência</strong>. Os dispositivos pararam de funcionar.
    </p>
    ${infoBox(`
      <p style="color:#991b1b;font-size:13px;font-weight:700;margin:0 0 6px;">🚫 Acesso suspenso</p>
      <p style="color:#7f1d1d;font-size:13px;margin:0;">Para desbloquear, regularize o pagamento e atualize o status no painel.</p>
    `, '#ef4444', '#fef2f2')}`;

  await transporter.sendMail({
    from: FROM, to,
    subject: `🚫 Escola bloqueada — ${schoolName}`,
    html: emailWrapper('Escola Bloqueada por Inadimplência', schoolName, body),
    text: `${recipientName}, a escola ${schoolName} foi bloqueada por inadimplência. Regularize para desbloquear.`,
  });
}

// ─── Job failure alert (superadmin) ──────────────────────────────────────────

export async function sendJobFailureAlert(
  to: string,
  opts: { jobName: string; error: string; timestamp: Date },
): Promise<void> {
  if (!transporter) return;

  const { jobName, error, timestamp } = opts;
  const body = `
    <p style="color:#374151;font-size:15px;font-weight:600;margin:0 0 12px;">
      O job automatizado <strong>${jobName}</strong> falhou.
    </p>
    ${infoBox(`
      <p style="color:#991b1b;font-size:12px;font-weight:700;margin:0 0 6px;">Horário: ${timestamp.toLocaleString('pt-BR')}</p>
      <pre style="color:#7f1d1d;font-size:11px;margin:0;white-space:pre-wrap;word-break:break-all;">${error.slice(0, 1000)}</pre>
    `, '#ef4444', '#fef2f2')}
    <p style="color:#6b7280;font-size:12px;margin:8px 0 0;">
      Verifique os logs do servidor e execute o job manualmente se necessário.
    </p>`;

  await transporter.sendMail({
    from: FROM, to,
    subject: `🚨 [IA Cloud] Job falhou: ${jobName}`,
    html: emailWrapper('Alerta de Job Automático', 'Sistema', body),
    text: `Job ${jobName} falhou em ${timestamp.toISOString()}.\n\n${error}`,
  });
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(to: string, recipientName: string, resetUrl: string): Promise<void> {
  if (!transporter) {
    console.warn(`[Email] nodemailer not installed. Password reset email skipped for ${to}.`);
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1b4965,#0a1f30);padding:32px 40px;text-align:center;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;">🛡️ IA Cloud Access</span>
            <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:13px;">Recuperação de Senha</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 16px;">Olá, ${recipientName}!</p>
            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
              Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#1b4965,#0a1f30);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:700;">
                Redefinir Minha Senha
              </a>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin:0 0 8px;">⏱ Este link é válido por <strong>1 hora</strong>.</p>
            <p style="color:#9ca3af;font-size:12px;margin:0;">Se você não solicitou esta redefinição, ignore este e-mail com segurança. Sua senha permanecerá inalterada.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              IA Cloud Access · Suporte: <a href="mailto:alerta@iacloud.com.br" style="color:#1b4965;text-decoration:none;">alerta@iacloud.com.br</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from:    FROM,
    to,
    subject: 'Redefinição de senha — IA Cloud Access',
    html,
    text: `Olá, ${recipientName}! Acesse o link para redefinir sua senha: ${resetUrl}\n\nVálido por 1 hora. Se não solicitou, ignore este e-mail.`,
  });
}

