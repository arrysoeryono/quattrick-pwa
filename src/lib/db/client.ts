/**
 * Server-only helper: resolves the Neon Postgres connection string.
 *
 * Prefers NEON_DATABASE_URL so the cloud DB can never be shadowed by a local
 * DATABASE_URL (e.g. a Prisma/SQLite default injected by the host environment).
 * Falls back to DATABASE_URL only when it actually looks like a Postgres URL.
 */
export function getNeonUrl(): string | null {
  const candidates = [process.env.NEON_DATABASE_URL, process.env.DATABASE_URL];
  for (const c of candidates) {
    if (c && /^postgres(ql)?:\/\//.test(c.trim())) return c.trim();
  }
  return null;
}
