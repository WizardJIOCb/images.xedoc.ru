import { eq } from "drizzle-orm";
import { createDb, models, users } from "@images/db";
import { defaultModels } from "@images/shared";

export async function seedDatabase(databaseUrl: string) {
  const db = createDb(databaseUrl);

  const existingUser = await db.select().from(users).limit(1);
  if (existingUser.length === 0) {
    await db.insert(users).values({
      email: "admin@images.xedoc.ru",
      username: "admin",
      passwordHash: "change-me",
      role: "admin"
    });
  }

  for (const model of defaultModels) {
    const existing = await db.select().from(models).where(eq(models.name, model.name)).limit(1);
    if (existing.length === 0) {
      await db.insert(models).values({
        name: model.name,
        type: model.type,
        provider: model.provider,
        workflowPath: model.workflowPath,
        configJson: model.config
      });
    }
  }
}
