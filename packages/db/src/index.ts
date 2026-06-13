import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export * from "./schema";

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool);
}
