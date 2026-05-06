export default async function handler(req, res) {
  let databaseConnected = false;
  let databaseError = null;
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

  if (dbUrl) {
    try {
      const mod = await import("@neondatabase/serverless");
      const sql = mod.neon(dbUrl);
      await sql`SELECT 1 AS ok`;
      databaseConnected = true;
    } catch (error) {
      databaseError = error.message;
    }
  }

  res.status(200).json({
    success: true,
    message: "API DEV SWG online",
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    hasDatabaseUrl: Boolean(dbUrl),
    databaseConnected,
    databaseError
  });
}
