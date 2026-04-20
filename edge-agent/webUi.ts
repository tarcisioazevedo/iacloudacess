export function renderEdgeUi() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Edge Local</title>
  <style>
    :root {
      --bg: #f4f7f8;
      --surface: #ffffff;
      --surface-alt: #f8fbfc;
      --border: #d8e3e7;
      --text: #18303a;
      --muted: #6e8088;
      --primary: #1f5a7a;
      --success: #15803d;
      --warning: #b45309;
      --danger: #b91c1c;
      --shadow: 0 10px 28px rgba(24, 48, 58, 0.08);
      --radius: 16px;
      --radius-sm: 10px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background:
        radial-gradient(circle at top right, rgba(31, 90, 122, 0.08), transparent 28%),
        linear-gradient(180deg, #eef5f7, var(--bg));
      color: var(--text);
    }
    .page {
      max-width: 1160px;
      margin: 0 auto;
      padding: 24px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .card {
      background: rgba(255,255,255,0.96);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .card-body { padding: 18px 20px; }
    .title {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .subtitle {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      background: var(--surface-alt);
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .badge.success { color: var(--success); border-color: rgba(21,128,61,0.22); background: #effaf3; }
    .badge.warning { color: var(--warning); border-color: rgba(180,83,9,0.2); background: #fff7ed; }
    .badge.danger { color: var(--danger); border-color: rgba(185,28,28,0.18); background: #fef2f2; }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
    .span-4 { grid-column: span 4; }
    .span-5 { grid-column: span 5; }
    .span-6 { grid-column: span 6; }
    .span-7 { grid-column: span 7; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .kpi {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px;
      background: var(--surface-alt);
    }
    .kpi-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      font-weight: 700;
      margin-bottom: 6px;
    }
    .kpi-value {
      font-size: 28px;
      font-weight: 800;
      line-height: 1.1;
    }
    .section-title {
      margin: 0 0 14px;
      font-size: 15px;
      font-weight: 800;
    }
    .detail-list {
      display: grid;
      gap: 12px;
    }
    .detail-row {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 10px;
      align-items: start;
      font-size: 14px;
    }
    .detail-label {
      color: var(--muted);
      font-weight: 700;
    }
    .mono {
      font-family: "Consolas", "JetBrains Mono", monospace;
      font-size: 13px;
      word-break: break-word;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 14px;
    }
    button {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(135deg, #276e96, var(--primary));
      color: #fff;
    }
    button.secondary {
      background: #fff;
      color: var(--primary);
      border: 1px solid rgba(31, 90, 122, 0.18);
    }
    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    input {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      background: #fff;
    }
    .input-group { display: grid; gap: 8px; }
    .helper {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
    }
    .status-note {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 12px;
      font-size: 13px;
      background: #f7fafb;
      border: 1px dashed var(--border);
      color: var(--muted);
      white-space: pre-wrap;
    }
    .devices {
      display: grid;
      gap: 12px;
    }
    .device {
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface-alt);
    }
    .device h4 {
      margin: 0 0 6px;
      font-size: 15px;
    }
    .device-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 12px;
    }
    .footer-note {
      margin-top: 16px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
    }
    @media (max-width: 900px) {
      .hero, .kpis, .grid { grid-template-columns: 1fr; }
      .span-4, .span-5, .span-6, .span-7, .span-8, .span-12 { grid-column: span 1; }
      .detail-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <article class="card">
        <div class="card-body">
          <h1 class="title">Modulo de Comunicacao Edge</h1>
          <p class="subtitle">
            Interface leve local para onboarding, sincronizacao com a nuvem, status operacional
            e licenciamento integrado da solucao.
          </p>
          <div class="badges" id="heroBadges"></div>
        </div>
      </article>
      <article class="card">
        <div class="card-body">
          <h2 class="section-title">Acoes rapidas</h2>
          <div class="toolbar">
            <button id="refreshBtn" class="secondary">Atualizar painel</button>
            <button id="heartbeatBtn">Heartbeat</button>
            <button id="syncBtn" class="secondary">Buscar sync jobs</button>
            <button id="flushBtn" class="secondary">Enviar eventos</button>
          </div>
          <div class="input-group" style="margin-top:14px;">
            <label for="eventDeviceRef">Evento de teste</label>
            <input id="eventDeviceRef" placeholder="Device ref local ou cloudDeviceId (opcional)" />
            <input id="eventUserId" placeholder="UserID para homologacao (opcional)" />
            <div class="toolbar" style="margin-top:0;">
              <button id="simulateEventBtn" class="secondary">Gerar evento de teste</button>
            </div>
            <div class="helper">
              Use este recurso para validar fila local, envio para a nuvem e leitura de eventos sem depender do hardware final.
            </div>
          </div>
          <div class="status-note" id="actionResult">Painel aguardando leitura do status local...</div>
        </div>
      </article>
    </section>

    <section class="card" style="margin-bottom:16px;">
      <div class="card-body">
        <div class="kpis">
          <div class="kpi">
            <div class="kpi-label">Devices gerenciados</div>
            <div class="kpi-value" id="kpiDevices">0</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Eventos em spool</div>
            <div class="kpi-value" id="kpiSpool">0</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Licenca</div>
            <div class="kpi-value" id="kpiLicense">-</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Cloud</div>
            <div class="kpi-value" id="kpiCloud">-</div>
          </div>
        </div>
      </div>
    </section>

    <section class="grid">
      <article class="card span-7">
        <div class="card-body">
          <h2 class="section-title">Conexao com a nuvem</h2>
          <div class="detail-list" id="cloudDetails"></div>
        </div>
      </article>

      <article class="card span-5">
        <div class="card-body">
          <h2 class="section-title">Onboarding e claim</h2>
          <div class="input-group">
            <label for="enrollmentToken">Token de enrollment</label>
            <input id="enrollmentToken" placeholder="Cole o token gerado na plataforma" />
            <div class="helper">
              Se o edge ainda nao foi registrado, cole o token aqui e clique em <strong>Registrar edge</strong>.
              Isso permite homologar em notebook ou VM antes da Raspberry ficar disponivel.
            </div>
          </div>
          <div class="toolbar">
            <button id="claimBtn">Registrar edge</button>
            <button id="licenseBtn" class="secondary">Atualizar licenca</button>
          </div>
        </div>
      </article>

      <article class="card span-6">
        <div class="card-body">
          <h2 class="section-title">Licenciamento integrado</h2>
          <div class="detail-list" id="licenseDetails"></div>
        </div>
      </article>

      <article class="card span-6">
        <div class="card-body">
          <h2 class="section-title">Plano de instalacao provisoria</h2>
          <div class="detail-list">
            <div class="detail-row"><div class="detail-label">Ambiente</div><div>Notebook Windows/Linux, mini PC ou VM local no site.</div></div>
            <div class="detail-row"><div class="detail-label">Rede</div><div>Mesmo segmento ou rota ate a VLAN dos dispositivos, com saida HTTPS 443 para a nuvem.</div></div>
            <div class="detail-row"><div class="detail-label">Objetivo</div><div>Homologar conectividade, claim, heartbeat, licenca e fluxo de eventos antes de mover para Raspberry.</div></div>
            <div class="detail-row"><div class="detail-label">Migracao futura</div><div>Copiar configuracao do modulo, reprovisionar se necessario e subir como servico na Raspberry Pi 5.</div></div>
          </div>
        </div>
      </article>

      <article class="card span-6">
        <div class="card-body">
          <h2 class="section-title">AutoRegister CGI Intelbras</h2>
          <div class="detail-list" id="autoRegisterSummary"></div>
          <div class="footer-note">
            Configure o device Intelbras para apontar para
            <span class="mono"> http://IP_DO_EDGE:PORTA/cgi-bin/api/autoRegist/connect</span>.
          </div>
        </div>
      </article>

      <article class="card span-6">
        <div class="card-body">
          <h2 class="section-title">Sessoes AutoRegister</h2>
          <div class="devices" id="autoRegisterSessions"></div>
        </div>
      </article>

      <article class="card span-12">
        <div class="card-body">
          <h2 class="section-title">Inventario local de devices</h2>
          <div class="devices" id="devicesList"></div>
          <div class="footer-note">
            Recomendacao operacional: exponha esta UI apenas na VLAN de gestao ou em porta de manutencao local.
          </div>
        </div>
      </article>
    </section>
  </div>

  <script>
    const actionResult = document.getElementById('actionResult');

    function safeText(value, fallback = '-') {
      return value === null || value === undefined || value === '' ? fallback : String(value);
    }

    function formatDate(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return safeText(value);
      return date.toLocaleString('pt-BR');
    }

    function setActionResult(message) {
      actionResult.textContent = message;
    }

    async function fetchJson(url, options) {
      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Falha na comunicacao local');
      }
      return data;
    }

    function renderBadges(status) {
      const badges = [];
      badges.push('<span class="badge ' + (status.claimed ? 'success' : 'warning') + '">' + (status.claimed ? 'Edge registrado' : 'Edge nao registrado') + '</span>');
      badges.push('<span class="badge">' + safeText(status.connectorName) + '</span>');
      badges.push('<span class="badge">' + safeText(status.cloudBaseUrl) + '</span>');
      if ((status.autoRegister?.enabledDevices || 0) > 0) {
        badges.push('<span class="badge">AutoRegister ' + safeText(status.autoRegister.enabledDevices, '0') + ' devices</span>');
      }
      if (status.cloudReachable === true) {
        badges.push('<span class="badge success">Nuvem alcancavel</span>');
      } else if (status.cloudReachable === false) {
        badges.push('<span class="badge danger">Nuvem indisponivel</span>');
      }
      document.getElementById('heroBadges').innerHTML = badges.join('');
    }

    function renderStatus(status) {
      renderBadges(status);

      document.getElementById('kpiDevices').textContent = safeText(status.managedDevices, '0');
      document.getElementById('kpiSpool').textContent = safeText(status.spooledEvents, '0');
      document.getElementById('kpiCloud').textContent = status.cloudReachable ? 'OK' : 'OFF';
      document.getElementById('kpiLicense').textContent = status.license?.license?.plan ? status.license.license.plan.toUpperCase() : '-';

      const cloudLines = [
        ['Base URL', safeText(status.cloudBaseUrl)],
        ['Edge ID', safeText(status.credentials?.edgeId)],
        ['Conector', safeText(status.credentials?.connectorName || status.connectorName)],
        ['Ultimo heartbeat', formatDate(status.runtime?.lastHeartbeatAt)],
        ['Ultimo sync', formatDate(status.runtime?.lastSyncAt)],
        ['Ultimo envio de eventos', formatDate(status.runtime?.lastFlushAt)],
        ['Ultimo erro', safeText(status.runtime?.lastError, 'Nenhum')]
      ];
      document.getElementById('cloudDetails').innerHTML = cloudLines.map(([label, value]) => '<div class="detail-row"><div class="detail-label">' + label + '</div><div>' + value + '</div></div>').join('');

      const lic = status.license || {};
      const licenseLines = [
        ['Integrador', safeText(lic.integrator?.name)],
        ['Escola', safeText(lic.school?.name)],
        ['Site', safeText(lic.schoolUnit?.name)],
        ['Plano', safeText(lic.license?.plan)],
        ['Status da licenca', safeText(lic.license?.status)],
        ['Validade', formatDate(lic.license?.validTo)],
        ['Uso de escolas', lic.license ? lic.license.usedSchools + ' / ' + lic.license.maxSchools : '-'],
        ['Uso de devices', lic.license ? lic.license.usedDevices + ' / ' + lic.license.maxDevices : '-'],
        ['Liberacao do edge', lic.enforcement ? (lic.enforcement.edgeAllowed ? 'Permitido' : 'Bloqueado') : '-'],
        ['Motivos de bloqueio', lic.enforcement?.reasons?.length ? lic.enforcement.reasons.join(', ') : 'Nenhum']
      ];
      document.getElementById('licenseDetails').innerHTML = licenseLines.map(([label, value]) => '<div class="detail-row"><div class="detail-label">' + label + '</div><div>' + value + '</div></div>').join('');

      const autoRegister = status.autoRegister || {};
      const autoRegisterLines = [
        ['Endpoint', safeText(autoRegister.listeningPath, '/cgi-bin/api/autoRegist/connect')],
        ['Devices habilitados', safeText(autoRegister.enabledDevices, '0')],
        ['Sessoes ativas', safeText(autoRegister.activeSessions, '0')],
        ['Keep-alive recomendado', '20 segundos'],
        ['Uso ideal', 'Devices Intelbras compativeis no mesmo site do edge']
      ];
      document.getElementById('autoRegisterSummary').innerHTML = autoRegisterLines.map(([label, value]) => '<div class="detail-row"><div class="detail-label">' + label + '</div><div class="' + (label === 'Endpoint' ? 'mono' : '') + '">' + value + '</div></div>').join('');

      document.getElementById('autoRegisterSessions').innerHTML = (autoRegister.sessions || []).map((session) => {
        const badgeClass = session.status === 'authenticated'
          ? 'success'
          : session.status === 'degraded'
            ? 'warning'
            : session.status === 'offline'
              ? 'danger'
              : '';
        return '<div class="device">' +
          '<h4>' + safeText(session.deviceName) + '</h4>' +
          '<div class="badges" style="margin-top:8px;margin-bottom:8px;">' +
          '<span class="badge ' + badgeClass + '">' + safeText(session.status).toUpperCase() + '</span>' +
          '<span class="badge">' + (session.tokenActive ? 'Token ativo' : 'Sem token') + '</span>' +
          '<span class="badge">ID ' + safeText(session.deviceId) + '</span>' +
          '</div>' +
          '<div class="detail-list">' +
            '<div class="detail-row"><div class="detail-label">Device ref</div><div class="mono">' + safeText(session.deviceRef) + '</div></div>' +
            '<div class="detail-row"><div class="detail-label">Modelo reportado</div><div>' + safeText(session.devClass) + '</div></div>' +
            '<div class="detail-row"><div class="detail-label">IP remoto</div><div>' + safeText(session.remoteAddress) + '</div></div>' +
            '<div class="detail-row"><div class="detail-label">Ultimo connect</div><div>' + formatDate(session.lastConnectAt) + '</div></div>' +
            '<div class="detail-row"><div class="detail-label">Ultimo login</div><div>' + formatDate(session.lastLoginAt) + '</div></div>' +
            '<div class="detail-row"><div class="detail-label">Ultimo keep-alive OK</div><div>' + formatDate(session.lastKeepAliveOkAt) + '</div></div>' +
            '<div class="detail-row"><div class="detail-label">Falhas consecutivas</div><div>' + safeText(session.consecutiveKeepAliveFailures, '0') + '</div></div>' +
            '<div class="detail-row"><div class="detail-label">Ultimo erro</div><div>' + safeText(session.lastError, 'Nenhum') + '</div></div>' +
          '</div>' +
        '</div>';
      }).join('') || '<div class="helper">Nenhuma sessao AutoRegister recebida ainda.</div>';

      document.getElementById('devicesList').innerHTML = (status.devices || []).map((device) => {
        return '<div class="device">' +
          '<h4>' + safeText(device.name || device.localIdentifier || device.ipAddress) + '</h4>' +
          '<div class="device-meta">' +
          '<span>' + safeText(device.ipAddress) + ':' + safeText(device.port, '80') + '</span>' +
          '<span>' + safeText(device.serialNumber, 'Sem serial') + '</span>' +
          '<span>' + safeText(device.cloudDeviceId, 'Sem cloudDeviceId') + '</span>' +
          '<span>' + safeText(device.transport, 'direct') + '</span>' +
          '<span>' + safeText(device.autoRegisterDeviceId, 'Sem DeviceID AutoRegister') + '</span>' +
          '</div>' +
        '</div>';
      }).join('') || '<div class="helper">Nenhum device local configurado.</div>';

      const eventDeviceRef = document.getElementById('eventDeviceRef');
      if (eventDeviceRef && !eventDeviceRef.value && status.devices && status.devices.length > 0) {
        const firstDevice = status.devices[0];
        eventDeviceRef.value = firstDevice.cloudDeviceId || firstDevice.localIdentifier || firstDevice.serialNumber || firstDevice.ipAddress || '';
      }
    }

    async function loadDashboard() {
      try {
        const data = await fetchJson('/api/local/status');
        renderStatus(data);
        setActionResult('Painel atualizado com sucesso em ' + new Date().toLocaleTimeString('pt-BR'));
      } catch (error) {
        setActionResult(error.message);
      }
    }

    async function runAction(url, options, successMessage) {
      try {
        const result = await fetchJson(url, options);
        setActionResult(successMessage + '\\n' + JSON.stringify(result, null, 2));
        await loadDashboard();
      } catch (error) {
        setActionResult(error.message);
      }
    }

    document.getElementById('refreshBtn').addEventListener('click', loadDashboard);
    document.getElementById('heartbeatBtn').addEventListener('click', () => runAction('/api/local/actions/heartbeat', { method: 'POST' }, 'Heartbeat executado'));
    document.getElementById('syncBtn').addEventListener('click', () => runAction('/api/local/actions/sync-poll', { method: 'POST' }, 'Polling de sync executado'));
    document.getElementById('flushBtn').addEventListener('click', () => runAction('/api/local/actions/flush-events', { method: 'POST' }, 'Envio de eventos executado'));
    document.getElementById('simulateEventBtn').addEventListener('click', async () => {
      const deviceRef = document.getElementById('eventDeviceRef').value.trim();
      const userId = document.getElementById('eventUserId').value.trim();
      await runAction('/api/local/actions/simulate-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceRef, userId })
      }, 'Evento de teste gerado');
    });
    document.getElementById('licenseBtn').addEventListener('click', () => runAction('/api/local/license/refresh', { method: 'POST' }, 'Licenca atualizada'));
    document.getElementById('claimBtn').addEventListener('click', async () => {
      const enrollmentToken = document.getElementById('enrollmentToken').value.trim();
      await runAction('/api/local/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentToken })
      }, 'Claim executado');
    });

    loadDashboard();
  </script>
</body>
</html>`;
}
