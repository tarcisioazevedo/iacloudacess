import { PrismaClient } from '@prisma/client';
import { getDatabaseUrl } from './lib/runtimeConfig';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// ─── Connection URL assembly ──────────────────────────────────────────────────
//
// Two modes:
//
//  1. Direct (migrator, dev): DATABASE_URL → postgres:5432
//     - Prisma manages a local pool of `connection_limit` connections.
//     - pool_timeout=10 keeps request latency bounded under load.
//
//  2. Via PgBouncer (api, worker replicas): DATABASE_URL → pgbouncer:5432
//     - PGBOUNCER_ENABLED=true is set in docker-stack.yml for these containers.
//     - pgbouncer=true   → disables Prisma's prepared-statement cache
//       (prepared statements are not supported in PgBouncer transaction mode).
//     - statement_cache_size=0 → prevents the underlying driver from caching
//       prepared statement handles that PgBouncer would reject.
//     - connection_limit=5 applies to client connections TO PgBouncer (cheap
//       sockets) — PgBouncer then multiplexes them into its DEFAULT_POOL_SIZE
//       (20) real Postgres connections. Total Postgres load:
//       3 API × 5 + 2 worker × 5 = 25 PgBouncer clients → ≤20 Postgres conns.
//
const isPgBouncer = process.env.PGBOUNCER_ENABLED === 'true';
const databaseUrl = getDatabaseUrl();

function buildConnectionUrl(base: string): string {
  const sep = base.includes('?') ? '&' : '?';
  let url = base;

  if (!url.includes('connection_limit')) {
    // Shorter pool_timeout (10 s) so requests fail fast rather than pile up
    url += `${sep}connection_limit=5&pool_timeout=10`;
  }

  if (isPgBouncer) {
    // Append PgBouncer-specific params only when routing through the pooler.
    // Safe to call multiple times — guard against accidental double-append.
    if (!url.includes('pgbouncer=true')) {
      url += '&pgbouncer=true';
    }
    if (!url.includes('statement_cache_size')) {
      url += '&statement_cache_size=0';
    }
  }

  return url;
}

const connectionUrl = buildConnectionUrl(databaseUrl);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: connectionUrl,
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
