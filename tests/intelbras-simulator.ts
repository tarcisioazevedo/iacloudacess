/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Intelbras Facial Controller Simulator — Automated Test Battery
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Pure HTTP E2E test — no direct DB access needed.
 *  Seeds data via docker exec psql, tests via HTTPS webhook, verifies via psql.
 */

import { execSync, spawnSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_BASE = 'https://localhost';
const CONTAINER = (() => {
  // Find the postgres container name dynamically
  try {
    const out = execSync('docker ps --filter "name=school_postgres" --format "{{.Names}}"', { encoding: 'utf8', timeout: 5000 }).trim();
    return out.split('\n')[0];
  } catch { return 'school_postgres.1'; }
})();

interface TestResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  httpStatus: number | null;
  latencyMs: number;
  details: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
}

const results: TestResult[] = [];
let testDeviceId = '';
let testSchoolId = '';
let testStudentEnrollments: string[] = [];

/** Run SQL via piping to docker exec's stdin — avoids all shell escaping issues */
function psql(sql: string): string {
  try {
    const result = spawnSync('docker', [
      'exec', '-i', CONTAINER,
      'psql', '-U', 'schooladmin', '-d', 'school_access', '-t', '-A',
    ], {
      input: sql,
      encoding: 'utf8',
      timeout: 15000,
    });
    if (result.stderr && result.stderr.includes('ERROR')) {
      console.error(`  ⚠️ psql error: ${result.stderr.slice(0, 200)}`);
    }
    return (result.stdout || '').trim();
  } catch (e: any) {
    console.error(`  ⚠️ psql spawn error: ${e.message}`);
    return '';
  }
}

function utcNow() { return Math.floor(Date.now() / 1000); }

async function sendWebhook(
  tenantKey: string,
  body: string | Buffer | object,
  contentType: string,
): Promise<{ status: number; body: string; latencyMs: number }> {
  const url = `${API_BASE}/api/intelbras/events/${encodeURIComponent(tenantKey)}`;
  const rawBody = typeof body === 'string' ? body : Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const start = Date.now();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-Request-ID': `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
      body: rawBody as any,
    });
    return { status: r.status, body: await r.text(), latencyMs: Date.now() - start };
  } catch (e: any) {
    return { status: -1, body: e.message, latencyMs: Date.now() - start };
  }
}

function addResult(id: string, cat: string, name: string, passed: boolean, status: number | null, ms: number, details: string, sev: TestResult['severity'] = 'major') {
  results.push({ id, category: cat, name, passed, httpStatus: status, latencyMs: ms, details, severity: sev });
  console.log(`  ${passed ? '✅' : '❌'} [${cat}] ${name} (${ms}ms)${passed ? '' : ' ← ' + details}`);
}

// ═══════════════════ PHASE 1: SEED ═══════════════════
function seedTestData() {
  console.log('\n📦 Phase 1: Seeding test data via psql...\n');

  // Single SQL script that does everything and returns IDs as JSON
  const seedSql = `
-- Clean old simulator data
DELETE FROM access_events WHERE device_id IN (SELECT id FROM devices WHERE name LIKE 'SIM_%');
DELETE FROM device_student_links WHERE device_id IN (SELECT id FROM devices WHERE name LIKE 'SIM_%');
DELETE FROM device_sync_jobs WHERE device_id IN (SELECT id FROM devices WHERE name LIKE 'SIM_%');
DELETE FROM devices WHERE name LIKE 'SIM_%';
DELETE FROM students WHERE enrollment LIKE 'SIM%';
DELETE FROM school_units WHERE name = 'SIM_Unit';
DELETE FROM schools WHERE slug = 'sim-escola-teste';
DELETE FROM integrators WHERE slug = 'sim-integrador-teste';

-- Create hierarchy in transaction
DO $$
DECLARE
  v_int_id TEXT;
  v_school_id TEXT;
  v_unit_id TEXT;
  v_device_id TEXT;
  v_stu_id TEXT;
  v_enrollments TEXT[] := ARRAY['SIM2026001','SIM2026002','SIM2026003','SIM2026004','SIM2026005'];
  v_names TEXT[] := ARRAY['Ana Julia','Pedro Henrique','Mariana Costa','Lucas Gabriel','Isabela Fernandes'];
BEGIN
  INSERT INTO integrators (id, name, slug, status) VALUES (gen_random_uuid(), 'SIM Integrador', 'sim-integrador-teste', 'active') RETURNING id INTO v_int_id;
  INSERT INTO schools (id, integrator_id, name, slug, timezone) VALUES (gen_random_uuid(), v_int_id, 'SIM Escola', 'sim-escola-teste', 'America/Sao_Paulo') RETURNING id INTO v_school_id;
  INSERT INTO school_units (id, school_id, name, address) VALUES (gen_random_uuid(), v_school_id, 'SIM_Unit', 'Rua Sim 42') RETURNING id INTO v_unit_id;
  INSERT INTO devices (id, school_unit_id, name, model, ip_address, port, username, location, connection_policy, connectivity_mode, serial_number, local_identifier, status, last_heartbeat, is_virtual)
    VALUES (gen_random_uuid(), v_unit_id, 'SIM_Facial_Portao', 'SS 3540 MF FACE', '192.168.100.201', 80, 'admin', 'Portao Principal', 'direct_only', 'direct', 'SIM00000001', 'sim-controller-001', 'online', now(), false) RETURNING id INTO v_device_id;

  FOR i IN 1..5 LOOP
    INSERT INTO students (id, school_id, name, enrollment, grade, class_group, shift, status)
      VALUES (gen_random_uuid(), v_school_id, v_names[i], v_enrollments[i], '8 serie', '8A', 'manha', 'active') RETURNING id INTO v_stu_id;
    INSERT INTO device_student_links (id, device_id, student_id, user_id, sync_status)
      VALUES (gen_random_uuid(), v_device_id, v_stu_id, v_enrollments[i], 'synced');
  END LOOP;

  -- Output the key IDs as a parseable line
  RAISE NOTICE 'SEED_IDS|%|%|%|%', v_int_id, v_school_id, v_unit_id, v_device_id;
END $$;

-- Now query the created IDs for the test
SELECT json_build_object(
  'deviceId', (SELECT id FROM devices WHERE name = 'SIM_Facial_Portao'),
  'schoolId', (SELECT id FROM schools WHERE slug = 'sim-escola-teste')
);
`;

  const result = psql(seedSql);
  // Parse JSON from output
  const jsonLine = result.split('\n').find(l => l.startsWith('{'));
  if (jsonLine) {
    try {
      const ids = JSON.parse(jsonLine);
      testDeviceId = ids.deviceId;
      testSchoolId = ids.schoolId;
      console.log(`  ✅ Device ID: ${testDeviceId}`);
      console.log(`  ✅ School ID: ${testSchoolId}`);
    } catch (e) {
      console.error(`  ⚠️ Failed to parse seed IDs: ${jsonLine}`);
    }
  } else {
    console.error(`  ⚠️ No JSON output from seed script. Raw output:\n${result.slice(0, 500)}`);
  }

  testStudentEnrollments = ['SIM2026001', 'SIM2026002', 'SIM2026003', 'SIM2026004', 'SIM2026005'];
  console.log(`  ✅ ${testStudentEnrollments.length} students created and linked`);
}

// ═══════════════════ PHASE 2: TESTS ═══════════════════

// ── JSON 2.0 Tests ──
async function testJ001() {
  const r = await sendWebhook(testDeviceId, {
    Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0,
      Data: { UserID: testStudentEnrollments[0], CardNo: '', Door: 0, ErrorCode: 0, Method: 15, ReaderID: '1', Similarity: 85, Status: 1, Type: 'Entry', UTC: utcNow(), RealUTC: utcNow(), UserType: 0 },
      PhysicalAddress: '54:6c:ac:21:40:17' }],
    Time: new Date().toISOString(),
  }, 'application/json');
  addResult('J001', 'JSON 2.0', 'Face Granted Entry (full fields)', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'critical');
}

async function testJ002() {
  const r = await sendWebhook(testDeviceId, {
    Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0,
      Data: { UserID: testStudentEnrollments[1], CardNo: '12EA3004', CardType: 0, Door: 0, ErrorCode: 0, Method: 1, ReaderID: '1', Status: 1, Type: 'Entry', UTC: utcNow(), UserType: 0 } }],
  }, 'application/json');
  addResult('J002', 'JSON 2.0', 'Card Granted Entry', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'critical');
}

async function testJ003() {
  const r = await sendWebhook(testDeviceId, {
    Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0,
      Data: { UserID: '', CardNo: '', Door: 0, ErrorCode: 16, Method: 15, ReaderID: '1', Similarity: 0, Status: 0, Type: 'Entry', UTC: utcNow(), UserType: 0 } }],
  }, 'application/json');
  addResult('J003', 'JSON 2.0', 'Face Denied (ErrorCode=16, unknown)', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'critical');
}

async function testJ004() {
  const r = await sendWebhook(testDeviceId, {
    Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0,
      Data: { UserID: testStudentEnrollments[2], CardNo: '', Door: 0, ErrorCode: 0, Method: 14, ReaderID: '1', QRCodeStr: '4225090077657|2|1|1|eec05', Status: 1, Type: 'Entry', UTC: utcNow(), UserType: 0 } }],
  }, 'application/json');
  addResult('J004', 'JSON 2.0', 'QRCode Granted Entry', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');
}

async function testJ005() {
  const r = await sendWebhook(testDeviceId, {
    Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0,
      Data: { UserID: testStudentEnrollments[3], Door: 0, ErrorCode: 0, Method: 15, Similarity: 90, Status: 1, Type: 'Exit', UTC: utcNow(), UserType: 0 } }],
  }, 'application/json');
  addResult('J005', 'JSON 2.0', 'Face Granted Exit', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');
}

async function testJ006() {
  const utc = utcNow();
  const r = await sendWebhook(testDeviceId, {
    Events: [
      { Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: { UserID: testStudentEnrollments[0], Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: utc - 60 } },
      { Code: 'AccessControl', Action: 'Pulse', Index: 1, Data: { UserID: testStudentEnrollments[1], Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: utc - 30 } },
      { Code: 'AccessControl', Action: 'Pulse', Index: 2, Data: { UserID: testStudentEnrollments[2], Door: 0, ErrorCode: 0, Method: 1, CardNo: 'AABBCCDD', Status: 1, Type: 'Exit', UTC: utc } },
    ],
    Time: new Date().toISOString(),
  }, 'application/json');
  addResult('J006', 'JSON 2.0', 'Batch: 3 events in single payload', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');
}

async function testJ007() {
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const r = await sendWebhook(testDeviceId, {
    Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0,
      Data: { UserID: testStudentEnrollments[4], Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: utcNow(), Similarity: 92,
        ImageEncode: tinyPng, ImageInfo: [{ Height: 1, Width: 1, Length: 67, Offset: 0, Type: 1 }] } }],
  }, 'application/json');
  addResult('J007', 'JSON 2.0', 'AccessControl with ImageEncode (base64)', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');
}

async function testJ008() {
  const r = await sendWebhook(testDeviceId, {
    Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0,
      Data: { UserID: testStudentEnrollments[0], Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: utcNow(), SnapPath: '/var/tmp/partsnap3.jpg' } }],
    FilePath: '/SnapShotFilePath/2026-04-18/22/35/20260418223531778.jpg', Time: '18-04-2026 22:35:31',
  }, 'application/json');
  addResult('J008', 'JSON 2.0', 'With FilePath and SnapPath', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'minor');
}

// ── Non-AccessControl Event Codes ──
async function testEventCodes() {
  const codes = ['Reboot','BreakIn','DoorStatus','DoorNotClosed','Button','ButtonExit','Duress','ChassisIntruded','AlarmLocal','NetworkChange','KeepLightOn','TimeChange','Upgrade'];
  for (const code of codes) {
    const r = await sendWebhook(testDeviceId, {
      Events: [{ Code: code, Action: 'Pulse', Index: 0, Data: { Name: 'Door', UTC: utcNow() } }],
    }, 'application/json');
    addResult(`EVT-${code.slice(0, 8)}`, 'Event Codes', `${code} event`, r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'ACK (ignored)' : `HTTP ${r.status}`, 'info');
  }
}

// ── Legacy text/plain ──
async function testTXT001() {
  const utc = utcNow();
  const body = `Code=AccessControl;action=Pulse;index=0;data={\n"CardNo":"AABB1122","Door":0,"ErrorCode":0,"Method":1,"ReaderID":"1","Status":1,"Type":"Entry","UTC":${utc},"UserID":"${testStudentEnrollments[0]}","UserType":0\n}`;
  const r = await sendWebhook(testDeviceId, body, 'text/plain');
  addResult('TXT001', 'text/plain', 'Legacy AccessControl card', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'critical');
}

async function testTXT002() {
  const body = `Code=BreakIn;action=Pulse;index=0;data={\n"Name":"SS-1","UTC":${utcNow()}\n}`;
  const r = await sendWebhook(testDeviceId, body, 'text/plain');
  addResult('TXT002', 'text/plain', 'Legacy BreakIn alarm', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'minor');
}

async function testTXT003() {
  const body = `Code=Duress;action=Pulse;index=0;data={\n"Name":"Door","UTC":${utcNow()},"UserID":"1"\n}`;
  const r = await sendWebhook(testDeviceId, body, 'text/plain');
  addResult('TXT003', 'text/plain', 'Legacy Duress alarm', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'minor');
}

async function testTXT004() {
  const body = `Code=DoorNotClosed;action=Start;index=0;data={\n"Name":"SS-1","UTC":${utcNow()}\n}`;
  const r = await sendWebhook(testDeviceId, body, 'text/plain');
  addResult('TXT004', 'text/plain', 'Legacy DoorNotClosed', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'minor');
}

// ── Multipart Mixed ──
async function testMULTI001() {
  const utc = utcNow();
  const boundary = 'myboundary';
  const fakeJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9]);
  const textPart = `Events[0].EventBaseInfo.Code=AccessControl\nEvents[0].EventBaseInfo.Action=Pulse\nEvents[0].EventBaseInfo.Index=0\nEvents[0].Door=0\nEvents[0].ErrorCode=0\nEvents[0].Method=15\nEvents[0].Status=0\nEvents[0].Type=Entry\nEvents[0].UTC=${utc}\nEvents[0].UserID=${testStudentEnrollments[0]}\nEvents[0].Similarity=88\nEvents[0].ImageInfo[0].Height=360\nEvents[0].ImageInfo[0].Length=${fakeJpeg.length}\nEvents[0].ImageInfo[0].Offset=0\nEvents[0].ImageInfo[0].Type=1\nEvents[0].ImageInfo[0].Width=640`;
  const bodyBuf = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(textPart)}\r\n\r\n${textPart}`),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${fakeJpeg.length}\r\n\r\n`),
    fakeJpeg,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await sendWebhook(testDeviceId, bodyBuf, `multipart/mixed; boundary=${boundary}`);
  addResult('MULTI001', 'Multipart', 'AccessControl with inline JPEG', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'critical');
}

async function testMULTI002() {
  const utc = utcNow();
  const boundary = 'myboundary';
  const fakeJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0xFF, 0xD9]);
  const textPart = `Events[0].EventBaseInfo.Code=AccessControl\nEvents[0].EventBaseInfo.Action=Pulse\nEvents[0].EventBaseInfo.Index=0\nEvents[0].Door=0\nEvents[0].ErrorCode=0\nEvents[0].Method=15\nEvents[0].Status=0\nEvents[0].Type=Entry\nEvents[0].UTC=${utc}\nEvents[0].UserID=${testStudentEnrollments[1]}\nEvents[0].ImageInfo[0].Length=${fakeJpeg.length}\nEvents[0].ImageInfo[0].Offset=0\nEvents[0].ImageInfo[0].Type=1\nEvents[0].ImageInfo[1].Length=${fakeJpeg.length}\nEvents[0].ImageInfo[1].Offset=${fakeJpeg.length}\nEvents[0].ImageInfo[1].Type=2`;
  const bodyBuf = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(textPart)}\r\n\r\n${textPart}`),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${fakeJpeg.length}\r\n\r\n`), fakeJpeg,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${fakeJpeg.length}\r\n\r\n`), fakeJpeg,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await sendWebhook(testDeviceId, bodyBuf, `multipart/mixed; boundary=${boundary}`);
  addResult('MULTI002', 'Multipart', 'AccessControl with 2 images (Type 1+2)', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');
}

// ── Edge Cases ──
async function testEdgeCases() {
  // Unknown device
  let r = await sendWebhook('nonexistent-xyz-999', { Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: { UserID: '999', Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: utcNow() } }] }, 'application/json');
  addResult('E001', 'Edge Cases', 'Unknown device → ACK 200', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK (no retry loop)' : `HTTP ${r.status}`, 'critical');

  // Empty JSON
  r = await sendWebhook(testDeviceId, {}, 'application/json');
  addResult('E002', 'Edge Cases', 'Empty JSON {}', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');

  // null Events
  r = await sendWebhook(testDeviceId, { Events: null }, 'application/json');
  addResult('E003', 'Edge Cases', 'Events: null', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');

  // Empty Events
  r = await sendWebhook(testDeviceId, { Events: [] }, 'application/json');
  addResult('E004', 'Edge Cases', 'Events: [] (empty)', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'minor');

  // Malformed JSON
  r = await sendWebhook(testDeviceId, '{"Events":[{"Code":"Access', 'application/json');
  addResult('E005', 'Edge Cases', 'Malformed/truncated JSON', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK (graceful)' : `HTTP ${r.status}: body parser may reject`, 'major');

  // Empty Data
  r = await sendWebhook(testDeviceId, { Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: {} }] }, 'application/json');
  addResult('E006', 'Edge Cases', 'AccessControl with empty Data{}', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');

  // Duplicate idempotency
  const dupUtc = utcNow() - 5000;
  const dupPayload = { Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: { UserID: testStudentEnrollments[4], Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: dupUtc } }] };
  const r1 = await sendWebhook(testDeviceId, dupPayload, 'application/json');
  await new Promise(res => setTimeout(res, 800));
  const r2 = await sendWebhook(testDeviceId, dupPayload, 'application/json');
  addResult('E007', 'Edge Cases', 'Duplicate event idempotency', r1.status === 200 && r2.status === 200, r2.status, r1.latencyMs + r2.latencyMs, 'Both ACKed; DB should dedup', 'critical');

  // Unknown UserID
  r = await sendWebhook(testDeviceId, { Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: { UserID: 'UNKNOWN_999', Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: utcNow() } }] }, 'application/json');
  addResult('E008', 'Edge Cases', 'Unknown UserID (no student link)', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK → pending_link' : `HTTP ${r.status}`, 'major');

  // Large batch 50 events
  const bigEvents = [];
  for (let i = 0; i < 50; i++) bigEvents.push({ Code: 'AccessControl', Action: 'Pulse', Index: i, Data: { UserID: testStudentEnrollments[i % 5], Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: i % 2 === 0 ? 'Entry' : 'Exit', UTC: utcNow() - (50 - i) } });
  r = await sendWebhook(testDeviceId, { Events: bigEvents }, 'application/json');
  addResult('E009', 'Edge Cases', 'Large batch: 50 events in 1 payload', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');

  // localIdentifier routing
  r = await sendWebhook('sim-controller-001', { Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: { UserID: testStudentEnrollments[0], Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: utcNow() } }] }, 'application/json');
  addResult('E010', 'Edge Cases', 'Route via localIdentifier', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'critical');

  // serialNumber routing
  r = await sendWebhook('SIM00000001', { Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: { UserID: testStudentEnrollments[1], Door: 0, ErrorCode: 0, Method: 1, CardNo: 'FFCCDDEE', Status: 1, Type: 'Entry', UTC: utcNow() } }] }, 'application/json');
  addResult('E011', 'Edge Cases', 'Route via serialNumber', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'major');

  // Empty text/plain
  r = await sendWebhook(testDeviceId, '', 'text/plain');
  addResult('E012', 'Edge Cases', 'Empty text/plain body', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'minor');

  // Door 1 secondary
  r = await sendWebhook(testDeviceId, { Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: { UserID: testStudentEnrollments[2], Door: 1, ErrorCode: 0, Method: 15, ReaderID: '2', Status: 1, Type: 'Entry', UTC: utcNow() } }] }, 'application/json');
  addResult('E013', 'Edge Cases', 'Door 1 (secondary) entry', r.status === 200, r.status, r.latencyMs, r.status === 200 ? 'OK' : `HTTP ${r.status}`, 'minor');
}

// ── Concurrency ──
async function testConcurrency() {
  // 10 simultaneous
  const p10 = [];
  for (let i = 0; i < 10; i++) p10.push(sendWebhook(testDeviceId, { Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: { UserID: testStudentEnrollments[i % 5], Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: utcNow() + i * 100 } }] }, 'application/json'));
  const r10 = await Promise.all(p10);
  const ok10 = r10.filter(r => r.status === 200).length;
  const avg10 = Math.round(r10.reduce((s, r) => s + r.latencyMs, 0) / r10.length);
  const max10 = Math.max(...r10.map(r => r.latencyMs));
  addResult('C001', 'Concurrency', `10 simultaneous (avg ${avg10}ms, max ${max10}ms)`, ok10 === 10, 200, avg10, `${ok10}/10 OK`, 'critical');

  // 30 rapid fire
  const p30 = [];
  for (let i = 0; i < 30; i++) p30.push(sendWebhook(testDeviceId, { Events: [{ Code: 'AccessControl', Action: 'Pulse', Index: 0, Data: { UserID: testStudentEnrollments[i % 5], Door: 0, ErrorCode: 0, Method: 15, Status: 1, Type: 'Entry', UTC: utcNow() + 10000 + i } }] }, 'application/json'));
  const r30 = await Promise.all(p30);
  const ok30 = r30.filter(r => r.status === 200).length;
  const limited30 = r30.filter(r => r.status === 429).length;
  addResult('C002', 'Concurrency', `30 rapid-fire (${ok30} ok, ${limited30} rate-limited)`, ok30 > 0, 200, 0, `${ok30}/30 accepted`, 'major');
}

// ═══════════════════ PHASE 3: VERIFY DB ═══════════════════
async function verifyDatabaseState() {
  console.log('\n🔍 Phase 3: Verifying database state...\n');
  await new Promise(res => setTimeout(res, 3000));

  const totalEvents = psql(`SELECT count(*) FROM access_events WHERE device_id = '${testDeviceId}';`);
  addResult('DB001', 'Database', `Total events persisted: ${totalEvents}`, parseInt(totalEvents) > 0, null, 0, `${totalEvents} rows`, 'critical');

  const dupes = psql(`SELECT count(*) - count(DISTINCT idempotency_key) FROM access_events WHERE device_id = '${testDeviceId}';`);
  addResult('DB002', 'Database', `Duplicate idempotency keys: ${dupes}`, dupes === '0', null, 0, dupes === '0' ? 'No dupes ✓' : `${dupes} dupes found!`, 'critical');

  const linked = psql(`SELECT count(*) FROM access_events WHERE device_id = '${testDeviceId}' AND student_id IS NOT NULL;`);
  addResult('DB003', 'Database', `Events linked to students: ${linked}/${totalEvents}`, parseInt(linked) > 0, null, 0, `${linked} linked`, 'major');

  const methods = psql(`SELECT DISTINCT method FROM access_events WHERE device_id = '${testDeviceId}' AND method IS NOT NULL ORDER BY method;`);
  addResult('DB004', 'Database', `Methods found: [${methods.replace(/\n/g, ', ')}]`, methods.length > 0, null, 0, 'Method normalization', 'info');

  const directions = psql(`SELECT DISTINCT direction FROM access_events WHERE device_id = '${testDeviceId}' AND direction IS NOT NULL ORDER BY direction;`);
  const hasEntryExit = directions.includes('entry') && directions.includes('exit');
  addResult('DB005', 'Database', `Directions: [${directions.replace(/\n/g, ', ')}]`, hasEntryExit, null, 0, hasEntryExit ? 'Both found ✓' : 'Missing entry or exit', 'major');

  const statuses = psql(`SELECT DISTINCT status FROM access_events WHERE device_id = '${testDeviceId}' ORDER BY status;`);
  addResult('DB006', 'Database', `Statuses: [${statuses.replace(/\n/g, ', ')}]`, statuses.includes('granted'), null, 0, 'Status normalization', 'major');

  const devStatus = psql(`SELECT status FROM devices WHERE id = '${testDeviceId}';`);
  addResult('DB007', 'Database', `Device status: ${devStatus}`, devStatus === 'online', null, 0, devStatus, 'minor');

  const lastEvt = psql(`SELECT last_event_at IS NOT NULL FROM devices WHERE id = '${testDeviceId}';`);
  addResult('DB008', 'Database', `Device lastEventAt updated: ${lastEvt}`, lastEvt === 't', null, 0, lastEvt === 't' ? 'Updated ✓' : 'Still null', 'minor');

  const rawSaved = psql(`SELECT count(*) FROM access_events WHERE device_id = '${testDeviceId}' AND raw_payload IS NOT NULL;`);
  addResult('DB009', 'Database', `Events with rawPayload: ${rawSaved}/${totalEvents}`, parseInt(rawSaved) > 0, null, 0, 'Audit trail', 'minor');

  const pendingLink = psql(`SELECT count(*) FROM access_events WHERE device_id = '${testDeviceId}' AND status = 'pending_link';`);
  addResult('DB010', 'Database', `Events with pending_link status: ${pendingLink}`, true, null, 0, 'Unknown UserID handling', 'info');
}

// ═══════════════════ PHASE 4: REPORT ═══════════════════
function generateReport() {
  console.log('\n' + '═'.repeat(70));
  console.log('  INTELBRAS CONTROLLER SIMULATOR — TEST REPORT');
  console.log('═'.repeat(70));

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const crit = results.filter(r => !r.passed && r.severity === 'critical').length;
  const maj = results.filter(r => !r.passed && r.severity === 'major').length;

  console.log(`\n  Total:     ${total}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  🔴 Crit:   ${crit}`);
  console.log(`  🟠 Major:  ${maj}`);
  console.log(`  Rate:      ${((passed / total) * 100).toFixed(1)}%\n`);

  const cats = [...new Set(results.map(r => r.category))];
  for (const c of cats) {
    const cr = results.filter(r => r.category === c);
    console.log(`  [${c}] ${cr.filter(r => r.passed).length}/${cr.length}`);
  }

  if (failed > 0) {
    console.log('\n  ──── FAILURES ────');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ❌ ${r.id} [${r.severity.toUpperCase()}] ${r.name}`);
      console.log(`     → ${r.details}`);
    }
  }

  console.log('\n' + '═'.repeat(70));

  // JSON output
  const summary = {
    timestamp: new Date().toISOString(), target: API_BASE, deviceId: testDeviceId,
    total, passed, failed, criticalFails: crit, majorFails: maj,
    passRate: ((passed / total) * 100).toFixed(1) + '%',
    failures: results.filter(r => !r.passed).map(r => ({ id: r.id, severity: r.severity, name: r.name, details: r.details, httpStatus: r.httpStatus })),
  };
  console.log('\n📄 JSON Summary:');
  console.log(JSON.stringify(summary, null, 2));
}

// ═══════════════════ MAIN ═══════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Intelbras Facial Controller Simulator v1.0                 ║');
  console.log('║  Automated Reliability Test Battery                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Target: ${API_BASE.padEnd(49)}║`);
  console.log(`║  Time:   ${new Date().toISOString().padEnd(49)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  seedTestData();

  console.log('\n🎯 Phase 2: Running test battery...\n');

  await testJ001(); await testJ002(); await testJ003(); await testJ004();
  await testJ005(); await testJ006(); await testJ007(); await testJ008();
  await testEventCodes();
  await testTXT001(); await testTXT002(); await testTXT003(); await testTXT004();
  await testMULTI001(); await testMULTI002();
  await testEdgeCases();
  await testConcurrency();
  await verifyDatabaseState();
  generateReport();
}

main().catch(e => { console.error('\n💥 Fatal:', e); process.exit(1); });
