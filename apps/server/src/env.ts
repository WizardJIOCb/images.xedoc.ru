import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3025),
  APP_URL: z.string().default("http://localhost:3025"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  UPLOAD_DIR: z.string().default("./uploads"),
  WORKER_SECRET: z.string().default("change_me")
});

export const env = envSchema.parse(process.env);
