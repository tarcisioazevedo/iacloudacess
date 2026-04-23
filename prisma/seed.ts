import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { hashSecret } from '../api/services/edgeSecurity';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // 1. Create Integrator
  const integrator = await prisma.integrator.create({
    data: {
      name: 'TechSeg Soluções',
      slug: 'techseg',
      status: 'active',
    },
  });
  console.log(`✅ Integrador: ${integrator.name}`);

  // 2. Create License
  await prisma.license.create({
    data: {
      integratorId: integrator.id,
      plan: 'professional',
      maxSchools: 25,
      maxDevices: 250,
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2027-12-31'),
    },
  });

  // 3. Create School
  const school = await prisma.school.create({
    data: {
      integratorId: integrator.id,
      name: 'Colégio Exemplo',
      slug: 'colegio-exemplo',
      timezone: 'America/Sao_Paulo',
    },
  });
  console.log(`✅ Escola: ${school.name}`);

  // 4. Create School Unit
  const unit = await prisma.schoolUnit.create({
    data: {
      schoolId: school.id,
      name: 'Sede Principal',
      address: 'Rua da Educação, 100 - Centro',
    },
  });

  // 4.1 Create Edge Connector for the site
  const edge = await prisma.edgeConnector.create({
    data: {
      schoolUnitId: unit.id,
      name: 'edge-sede-principal',
      hostname: 'edge-colegio-exemplo',
      version: '1.0.0',
      status: 'online',
      cloudMode: 'outbound_only',
      apiKeyHash: hashSecret('seed-edge-key'),
      claimedAt: new Date(),
      lastSeenAt: new Date(),
      lastIp: '100.64.0.10',
      localSubnets: ['192.168.0.0/24'],
      capabilities: {
        eventPush: true,
        syncPull: true,
      },
    },
  });
  console.log(`✅ Edge local: ${edge.name}`);

  // 5. Create Device
  const device = await prisma.device.create({
    data: {
      schoolUnitId: unit.id,
      edgeConnectorId: edge.id,
      name: 'Facial Portão Principal',
      model: 'SS 5530 MF FACE',
      ipAddress: '192.168.0.201',
      port: 80,
      username: 'admin',
      passwordEnc: null,
      location: 'Portão Principal',
      connectionPolicy: 'edge_only',
      connectivityMode: 'edge',
      status: 'online',
      lastHeartbeat: new Date(),
    },
  });
  console.log(`✅ Dispositivo: ${device.name} (${device.ipAddress})`);

  // 6. Create Profiles (users)
  const passwordHash = await bcrypt.hash('admin123', 12);

  const profiles = [
    { email: 'admin@plataforma.com', name: 'Administrador Global', role: 'superadmin' as const, integratorId: null, schoolId: null },
    { email: 'integrador@techseg.com', name: 'Carlos (Integrador)', role: 'integrator_admin' as const, integratorId: integrator.id, schoolId: null },
    { email: 'diretor@colegio.com', name: 'Maria Silva (Diretora)', role: 'school_admin' as const, integratorId: integrator.id, schoolId: school.id },
    { email: 'coord@colegio.com', name: 'Ana Costa (Coordenadora)', role: 'coordinator' as const, integratorId: integrator.id, schoolId: school.id },
    { email: 'portaria@colegio.com', name: 'João Porteiro', role: 'operator' as const, integratorId: integrator.id, schoolId: school.id },
  ];

  for (const p of profiles) {
    await prisma.profile.create({
      data: { ...p, passwordHash },
    });
    console.log(`✅ Perfil: ${p.email} (${p.role})`);
  }

  // 7. Create Students
  const studentsData = [
    { name: 'Ana Julia Oliveira', enrollment: '2026001', grade: '8ª série', classGroup: '8A', shift: 'manhã' },
    { name: 'Pedro Henrique Santos', enrollment: '2026002', grade: '7ª série', classGroup: '7B', shift: 'manhã' },
    { name: 'Mariana Costa Lima', enrollment: '2026003', grade: '9ª série', classGroup: '9A', shift: 'manhã' },
    { name: 'Lucas Gabriel Silva', enrollment: '2026004', grade: '6ª série', classGroup: '6C', shift: 'tarde' },
    { name: 'Isabela Fernandes', enrollment: '2026005', grade: '8ª série', classGroup: '8A', shift: 'manhã' },
  ];

  const students = [];
  for (const s of studentsData) {
    const student = await prisma.student.create({
      data: { ...s, schoolId: school.id, accessId: crypto.randomInt(10000000, 99999999).toString() },
    });
    students.push(student);

    // Link student to device
    await prisma.deviceStudentLink.create({
      data: {
        studentId: student.id,
        deviceId: device.id,
        userId: s.enrollment,
        syncStatus: 'synced',
      },
    });
  }
  console.log(`✅ ${students.length} alunos criados e vinculados ao dispositivo`);

  // 8. Create Guardians
  const guardiansData = [
    { name: 'Fernanda Oliveira', phone: '+5511999990001', email: 'fernanda@email.com' },
    { name: 'Roberto Santos', phone: '+5511999990002', email: 'roberto@email.com' },
    { name: 'Carla Lima', phone: '+5511999990003', email: 'carla@email.com' },
  ];

  const guardians = [];
  for (const g of guardiansData) {
    const guardian = await prisma.guardian.create({ data: g });
    guardians.push(guardian);
  }

  // Link guardians to students
  await prisma.studentGuardian.create({ data: { studentId: students[0].id, guardianId: guardians[0].id, relation: 'mae', priority: 1 } });
  await prisma.studentGuardian.create({ data: { studentId: students[1].id, guardianId: guardians[1].id, relation: 'pai', priority: 1 } });
  await prisma.studentGuardian.create({ data: { studentId: students[2].id, guardianId: guardians[2].id, relation: 'mae', priority: 1 } });
  console.log(`✅ ${guardians.length} responsáveis criados e vinculados`);

  // 9. Create sample events
  const now = new Date();
  for (let i = 0; i < 20; i++) {
    const student = students[i % students.length];
    const minutesAgo = i * 3;
    const occurredAt = new Date(now.getTime() - minutesAgo * 60000);

    await prisma.accessEvent.create({
      data: {
        schoolId: school.id,
        deviceId: device.id,
        studentId: student.id,
        eventCode: 'AccessControl',
        method: 'Face',
        door: 0,
        direction: i % 2 === 0 ? 'entry' : 'exit',
        status: 'granted',
        userIdRaw: student.enrollment,
        idempotencyKey: `${device.id}_${Math.floor(occurredAt.getTime() / 1000)}_${student.enrollment}_0`,
        occurredAt,
      },
    });
  }
  console.log(`✅ 20 eventos de acesso criados`);

  console.log('\n🎉 Seed completo! Dados de demonstração prontos.');
  console.log('\n📋 Logins disponíveis (senha: admin123):');
  for (const p of profiles) {
    console.log(`   ${p.role.padEnd(20)} → ${p.email}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
