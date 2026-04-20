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

