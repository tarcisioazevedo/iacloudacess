import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// ─── SCHOOL COCKPIT ──────────────────────────

// GET /api/analytics/school/today — Real-time school metrics for cockpit
router.get('/school/today', async (req: Request, res: Response) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId && !['superadmin', 'integrator_admin'].includes(req.user?.role || '')) {
      return res.status(403).json({ message: 'Sem acesso' });
    }

    const targetSchoolId = (req.query.schoolId as string) || schoolId;
    if (!targetSchoolId) return res.status(400).json({ message: 'schoolId obrigatório' });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // KPI: Events today
    const [totalEvents, entries, denied, unlinked] = await Promise.all([
      prisma.accessEvent.count({ where: { schoolId: targetSchoolId, occurredAt: { gte: todayStart } } }),
      prisma.accessEvent.count({ where: { schoolId: targetSchoolId, occurredAt: { gte: todayStart }, direction: 'entry', status: 'granted' } }),
      prisma.accessEvent.count({ where: { schoolId: targetSchoolId, occurredAt: { gte: todayStart }, status: 'denied' } }),
      prisma.accessEvent.count({ where: { schoolId: targetSchoolId, occurredAt: { gte: todayStart }, status: 'pending_link' } }),
    ]);

    // KPI: Students present today — any access event (entry OR exit, any status)
    // counts the student as "present". A denied or unlinked scan still means
    // the student physically showed up, so we count them.
    const [totalStudents, studentsPresent] = await Promise.all([
      prisma.student.count({ where: { schoolId: targetSchoolId, status: 'active' } }),
      prisma.accessEvent.findMany({
        where: { schoolId: targetSchoolId, occurredAt: { gte: todayStart }, studentId: { not: null } },
        distinct: ['studentId'],
        select: { studentId: true },
      }),
    ]);

    const attendanceRate = totalStudents > 0
      ? Math.round((studentsPresent.length / totalStudents) * 10000) / 100
      : 0;

    // KPI: Notifications today
    const notifStats = await prisma.notificationJob.groupBy({
      by: ['status'],
      where: { event: { schoolId: targetSchoolId }, createdAt: { gte: todayStart } },
      _count: true,
    });
    const notifSent = notifStats.find(n => n.status === 'sent')?._count || 0;
    const notifFailed = notifStats.filter(n => ['failed', 'dead'].includes(n.status)).reduce((a, n) => a + n._count, 0);

    // KPI: Devices
    const deviceStats = await prisma.device.groupBy({
      by: ['status'],
      where: { schoolUnit: { schoolId: targetSchoolId } },
      _count: true,
    });
    const devicesOnline = deviceStats.find(d => d.status === 'online')?._count || 0;
    const devicesOffline = deviceStats.filter(d => d.status !== 'online').reduce((a, d) => a + d._count, 0);

    // Hourly distribution (today) for heatmap
    const hourlyRaw = await prisma.$queryRawUnsafe<{ hour: number; count: bigint }[]>(`
      SELECT EXTRACT(HOUR FROM occurred_at)::int as hour, COUNT(*)::bigint as count
      FROM access_events
      WHERE school_id = $1 AND occurred_at >= $2 AND direction = 'entry'
      GROUP BY hour ORDER BY hour
    `, targetSchoolId, todayStart);

    const hourlyDistribution = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: Number(hourlyRaw.find(r => r.hour === h)?.count || 0),
    }));

    // Attendance by class group
    const classGroups = await prisma.$queryRawUnsafe<{ class_group: string; total: bigint; present: bigint }[]>(`
      SELECT
        s.class_group,
        COUNT(DISTINCT s.id)::bigint as total,
        COUNT(DISTINCT CASE WHEN ae.id IS NOT NULL THEN s.id END)::bigint as present
      FROM students s
      LEFT JOIN access_events ae ON ae.student_id = s.id AND ae.direction = 'entry' AND ae.status = 'granted' AND ae.occurred_at >= $2
      WHERE s.school_id = $1 AND s.status = 'active' AND s.class_group IS NOT NULL
      GROUP BY s.class_group
      ORDER BY s.class_group
    `, targetSchoolId, todayStart);

    const attendanceByClass = classGroups.map(c => ({
      classGroup: c.class_group,
      total: Number(c.total),
      present: Number(c.present),
      rate: Number(c.total) > 0 ? Math.round((Number(c.present) / Number(c.total)) * 100) : 0,
    }));

    // Last 7 days trend from analytics_daily
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86_400_000);
    const weeklyTrendRows = await prisma.analyticsDaily.findMany({
      where: { schoolId: targetSchoolId, reportDate: { gte: sevenDaysAgo } },
      select: { reportDate: true, attendanceRate: true },
      orderBy: { reportDate: 'asc' },
    });
    const weeklyTrend = weeklyTrendRows.map(r => ({
      report_date: r.reportDate.toISOString().split('T')[0],
      attendance_rate: r.attendanceRate ? Number(r.attendanceRate) : null,
    }));

    return res.json({
      kpis: {
        totalEvents,
        entries,
        denied,
        unlinked,
        totalStudents,
        studentsPresent: studentsPresent.length,
        attendanceRate,
        notifSent,
        notifFailed,
        devicesOnline,
        devicesOffline,
      },
      hourlyDistribution,
      attendanceByClass,
      weeklyTrend,
    });
  } catch (err: any) {
    console.error('[Analytics] School today error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/school/absent — Absent students today
router.get('/school/absent', async (req: Request, res: Response) => {
  try {
    const targetSchoolId = (req.query.schoolId as string) || req.user?.schoolId;
    if (!targetSchoolId) return res.status(400).json({ message: 'schoolId obrigatório' });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get all active students
    const allStudents = await prisma.student.findMany({
      where: { schoolId: targetSchoolId, status: 'active' },
      select: { id: true, name: true, enrollment: true, classGroup: true, shift: true, grade: true },
      orderBy: { name: 'asc' },
    });

    // Get students who have arrived today
    const presentStudentIds = await prisma.accessEvent.findMany({
      where: { schoolId: targetSchoolId, occurredAt: { gte: todayStart }, direction: 'entry', status: 'granted', studentId: { not: null } },
      distinct: ['studentId'],
      select: { studentId: true },
    });
    const presentSet = new Set(presentStudentIds.map(p => p.studentId));

    const absentStudents = allStudents.filter(s => !presentSet.has(s.id));

    return res.json({ absent: absentStudents, totalActive: allStudents.length, totalAbsent: absentStudents.length });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── INTEGRATOR COCKPIT ──────────────────────

// GET /api/analytics/integrator/today — Cross-school metrics for integrator
router.get('/integrator/today', requireRole('integrator_admin', 'integrator_support', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const integratorId = (req.query.integratorId as string) || req.user?.integratorId;
    if (!integratorId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ message: 'integratorId obrigatório' });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const schoolFilter = integratorId ? { integratorId } : {};

    // Schools summary
    const schools = await prisma.school.findMany({
      where: { ...schoolFilter, status: 'active' },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { students: { where: { status: 'active' } } } },
      },
    });

    // Events per school today
    const schoolMetrics = await Promise.all(schools.map(async (school) => {
      const [eventsToday, devicesTotal, devicesOnline] = await Promise.all([
        prisma.accessEvent.count({ where: { schoolId: school.id, occurredAt: { gte: todayStart } } }),
        prisma.device.count({ where: { schoolUnit: { schoolId: school.id } } }),
        prisma.device.count({ where: { schoolUnit: { schoolId: school.id }, status: 'online' } }),
      ]);

      return {
        id: school.id,
        name: school.name,
        slug: school.slug,
        totalStudents: school._count.students,
        eventsToday,
        devicesTotal,
        devicesOnline,
        healthStatus: devicesOnline === devicesTotal ? 'healthy' : devicesOnline > 0 ? 'degraded' : 'critical',
      };
    }));

    // Fleet device totals
    const fleetStats = await prisma.device.groupBy({
      by: ['status'],
      where: { schoolUnit: { school: schoolFilter } },
      _count: true,
    });

    // Notification pipeline
    const notifPipeline = await prisma.notificationJob.groupBy({
      by: ['status'],
      where: { event: { school: schoolFilter }, createdAt: { gte: todayStart } },
      _count: true,
    });

    // Total events today across all schools
    const totalEventsToday = await prisma.accessEvent.count({
      where: { school: schoolFilter, occurredAt: { gte: todayStart } },
    });

    return res.json({
      kpis: {
        totalSchools: schools.length,
        totalDevices: fleetStats.reduce((a, f) => a + f._count, 0),
        totalEventsToday,
        fleetUptime: (() => {
          const total = fleetStats.reduce((a, f) => a + f._count, 0);
          const online = fleetStats.find(f => f.status === 'online')?._count || 0;
          return total > 0 ? Math.round((online / total) * 1000) / 10 : 100;
        })(),
        alertsCount: schoolMetrics.filter(s => s.healthStatus !== 'healthy').length,
      },
      schools: schoolMetrics.sort((a, b) => b.eventsToday - a.eventsToday),
      fleetStatus: {
        online: fleetStats.find(f => f.status === 'online')?._count || 0,
        unstable: fleetStats.find(f => f.status === 'unstable')?._count || 0,
        offline: fleetStats.find(f => f.status === 'offline')?._count || 0,
      },
      notificationPipeline: {
        sent: notifPipeline.find(n => n.status === 'sent')?._count || 0,
        pending: notifPipeline.find(n => n.status === 'pending')?._count || 0,
        failed: notifPipeline.filter(n => ['failed', 'dead'].includes(n.status)).reduce((a, n) => a + n._count, 0),
      },
    });
  } catch (err: any) {
    console.error('[Analytics] Integrator today error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// ─── SUPERADMIN COCKPIT (CROSS-TENANT) ───────

// GET /api/analytics/platform — Platform-wide cross-tenant analytics
router.get('/platform', requireRole('superadmin'), async (req: Request, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Platform-wide KPIs
    const [
      totalIntegrators,
      totalSchools,
      totalDevices,
      totalEventsToday,
      totalStudents,
    ] = await Promise.all([
      prisma.integrator.count({ where: { status: 'active' } }),
      prisma.school.count({ where: { status: 'active' } }),
      prisma.device.count(),
      prisma.accessEvent.count({ where: { occurredAt: { gte: todayStart } } }),
      prisma.student.count({ where: { status: 'active' } }),
    ]);

    // Fleet uptime
    const fleetStats = await prisma.device.groupBy({ by: ['status'], _count: true });
    const devicesOnline = fleetStats.find(f => f.status === 'online')?._count || 0;
    const platformUptime = totalDevices > 0 ? Math.round((devicesOnline / totalDevices) * 1000) / 10 : 100;

    // Integrator ranking
    const integrators = await prisma.integrator.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { schools: { where: { status: 'active' } } } },
      },
    });

    const integratorRanking = await Promise.all(integrators.map(async (intg) => {
      const [eventsToday, devices, devicesOnline] = await Promise.all([
        prisma.accessEvent.count({ where: { school: { integratorId: intg.id }, occurredAt: { gte: todayStart } } }),
        prisma.device.count({ where: { schoolUnit: { school: { integratorId: intg.id } } } }),
        prisma.device.count({ where: { schoolUnit: { school: { integratorId: intg.id } }, status: 'online' } }),
      ]);

      return {
        id: intg.id,
        name: intg.name,
        slug: intg.slug,
        schools: intg._count.schools,
        eventsToday,
        devices,
        devicesOnline,
        healthStatus: devicesOnline === devices ? 'healthy' : devicesOnline > 0 ? 'degraded' : 'critical',
      };
    }));

    // Licensing overview
    const licenses = await prisma.license.findMany({
      select: { id: true, plan: true, status: true, validTo: true, integratorId: true },
    });
    const activeLicenses = licenses.filter(l => l.status === 'active').length;
    const trialLicenses = licenses.filter(l => l.plan === 'trial').length;
    const expiringLicenses = licenses.filter(l => {
      if (!l.validTo) return false;
      const daysLeft = Math.ceil((l.validTo.getTime() - Date.now()) / 86400_000);
      return daysLeft > 0 && daysLeft <= 30;
    }).length;

    // Growth (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
    const newSchools = await prisma.school.count({ where: { createdAt: { gte: thirtyDaysAgo } } });
    // Device model has no createdAt — fallback to total count (field not tracked)
    const newDevices = await prisma.device.count();

    // Weekly trend from analytics_daily
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const weeklyTrendRows = await prisma.analyticsDaily.groupBy({
      by: ['reportDate'],
      where: { reportDate: { gte: sevenDaysAgo } },
      _sum: { totalEvents: true },
      orderBy: { reportDate: 'asc' },
    });
    const weeklyTrend = weeklyTrendRows.map(r => ({
      report_date: r.reportDate.toISOString().split('T')[0],
      total_events: r._sum.totalEvents ?? 0,
    }));

    return res.json({
      kpis: {
        totalIntegrators,
        totalSchools,
        totalDevices,
        totalEventsToday,
        totalStudents,
        platformUptime,
      },
      integratorRanking: integratorRanking.sort((a, b) => b.eventsToday - a.eventsToday),
      licensing: {
        active: activeLicenses,
        trial: trialLicenses,
        expiring: expiringLicenses,
        suspended: licenses.filter(l => l.status === 'suspended').length,
      },
      growth: {
        newSchools,
        newDevices,
      },
      fleetStatus: {
        online: devicesOnline,
        unstable: fleetStats.find(f => f.status === 'unstable')?._count || 0,
        offline: fleetStats.find(f => f.status === 'offline')?._count || 0,
      },
      weeklyTrend,
    });
  } catch (err: any) {
    console.error('[Analytics] Platform error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// ─── ATTENDANCE REPORT ───────────────────────
// GET /api/analytics/attendance-report — Detailed attendance report for a date range (school-scoped)
// Returns per-student attendance and class-group summaries.
router.get('/attendance-report', async (req: Request, res: Response) => {
  try {
    const targetSchoolId = (req.query.schoolId as string) || req.user?.schoolId;
    if (!targetSchoolId) return res.status(400).json({ message: 'schoolId obrigatório' });

    // Date range (defaults to today)
    const from = req.query.from ? new Date(req.query.from as string) : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
    const to   = req.query.to   ? new Date(req.query.to   as string) : new Date();

    // Optional filters
    const filterShift      = req.query.shift as string | undefined;
    const filterClassGroup = req.query.classGroup as string | undefined;
    const filterGrade      = req.query.grade as string | undefined;

    // All active students for this school (with optional filters)
    const studentWhere: any = { schoolId: targetSchoolId, status: 'active' };
    if (filterShift)      studentWhere.shift = filterShift;
    if (filterClassGroup) studentWhere.classGroup = filterClassGroup;
    if (filterGrade)      studentWhere.grade = filterGrade;

    const students = await prisma.student.findMany({
      where: studentWhere,
      select: { id: true, name: true, enrollment: true, classGroup: true, shift: true, grade: true },
      orderBy: { name: 'asc' },
    });

    if (students.length === 0) {
      return res.json({
        students: [], summary: { totalStudents: 0, totalPresent: 0, totalAbsent: 0, attendanceRate: 0 },
        classGroups: [], from: from.toISOString(), to: to.toISOString(),
      });
    }

    const studentIds = students.map(s => s.id);

    // Get all entry events for these students in the date range
    const entryEvents = await prisma.accessEvent.findMany({
      where: {
        schoolId: targetSchoolId,
        studentId: { in: studentIds },
        direction: 'entry',
        status: 'granted',
        occurredAt: { gte: from, lte: to },
      },
      select: { studentId: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });

    // Build per-student report
    const studentEventMap = new Map<string, Date[]>();
    for (const e of entryEvents) {
      if (!e.studentId) continue;
      if (!studentEventMap.has(e.studentId)) studentEventMap.set(e.studentId, []);
      studentEventMap.get(e.studentId)!.push(e.occurredAt);
    }

    // Calculate number of school days in range (weekdays only — Mon-Fri)
    const schoolDays = (() => {
      let count = 0;
      const d = new Date(from);
      while (d <= to) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) count++;
        d.setDate(d.getDate() + 1);
      }
      return Math.max(count, 1);
    })();

    const studentReport = students.map(s => {
      const events = studentEventMap.get(s.id) || [];
      // Count distinct days where student had an entry event
      const daysPresent = new Set(events.map(e => e.toISOString().split('T')[0])).size;
      const daysAbsent = schoolDays - daysPresent;
      const rate = Math.round((daysPresent / schoolDays) * 10000) / 100;

      return {
        id: s.id,
        name: s.name,
        enrollment: s.enrollment,
        classGroup: s.classGroup,
        shift: s.shift,
        grade: s.grade,
        daysPresent,
        daysAbsent,
        attendanceRate: rate,
        firstEntry: events[0] || null,
        lastEntry: events.length > 0 ? events[events.length - 1] : null,
      };
    });

    // Summary by class group
    const classGroupMap = new Map<string, { total: number; present: number }>();
    for (const s of studentReport) {
      const key = s.classGroup || 'Sem turma';
      if (!classGroupMap.has(key)) classGroupMap.set(key, { total: 0, present: 0 });
      const g = classGroupMap.get(key)!;
      g.total++;
      if (s.daysPresent > 0) g.present++;
    }

    const classGroups = Array.from(classGroupMap.entries()).map(([classGroup, data]) => ({
      classGroup,
      total: data.total,
      present: data.present,
      absent: data.total - data.present,
      attendanceRate: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
    })).sort((a, b) => a.classGroup.localeCompare(b.classGroup));

    const totalPresent = studentReport.filter(s => s.daysPresent > 0).length;

    return res.json({
      students: studentReport,
      summary: {
        totalStudents: students.length,
        totalPresent,
        totalAbsent: students.length - totalPresent,
        attendanceRate: students.length > 0 ? Math.round((totalPresent / students.length) * 10000) / 100 : 0,
        schoolDays,
      },
      classGroups,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  } catch (err: any) {
    console.error('[Analytics] Attendance report error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/analytics/attendance-report/export — Export attendance as CSV
router.get('/attendance-report/export', async (req: Request, res: Response) => {
  try {
    const targetSchoolId = (req.query.schoolId as string) || req.user?.schoolId;
    if (!targetSchoolId) return res.status(400).json({ message: 'schoolId obrigatório' });

    const from = req.query.from ? new Date(req.query.from as string) : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
    const to   = req.query.to   ? new Date(req.query.to   as string) : new Date();

    const students = await prisma.student.findMany({
      where: { schoolId: targetSchoolId, status: 'active' },
      select: { id: true, name: true, enrollment: true, classGroup: true, shift: true, grade: true },
      orderBy: { name: 'asc' },
    });

    const studentIds = students.map(s => s.id);

    const entryEvents = await prisma.accessEvent.findMany({
      where: {
        schoolId: targetSchoolId,
        studentId: { in: studentIds },
        direction: 'entry',
        status: 'granted',
        occurredAt: { gte: from, lte: to },
      },
      select: { studentId: true, occurredAt: true },
    });

    const studentEventMap = new Map<string, Set<string>>();
    for (const e of entryEvents) {
      if (!e.studentId) continue;
      if (!studentEventMap.has(e.studentId)) studentEventMap.set(e.studentId, new Set());
      studentEventMap.get(e.studentId)!.add(e.occurredAt.toISOString().split('T')[0]);
    }

    // Count school days
    let schoolDays = 0;
    const d = new Date(from);
    while (d <= to) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) schoolDays++;
      d.setDate(d.getDate() + 1);
    }
    schoolDays = Math.max(schoolDays, 1);

    const header = 'Nome,Matrícula,Série,Turma,Turno,Dias Presente,Dias Ausente,Taxa Presença (%)\n';
    const rows = students.map(s => {
      const daysPresent = studentEventMap.get(s.id)?.size || 0;
      const daysAbsent = schoolDays - daysPresent;
      const rate = Math.round((daysPresent / schoolDays) * 10000) / 100;
      return [s.name, s.enrollment, s.grade || '', s.classGroup || '', s.shift || '', daysPresent, daysAbsent, rate]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    }).join('\n');

    const dateStr = from.toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="presenca_${dateStr}.csv"`);
    return res.send('\uFEFF' + header + rows);
  } catch (err: any) {
    console.error('[Analytics] Attendance export error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

export default router;

