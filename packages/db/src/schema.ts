import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 80 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 32 }).notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const models = pgTable("models", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  type: varchar("type", { length: 60 }).notNull(),
  provider: varchar("provider", { length: 60 }).notNull(),
  workflowPath: text("workflow_path").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  configJson: jsonb("config_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const characters = pgTable("characters", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  profileJson: jsonb("profile_json").notNull().default({}),
  referenceImageUrl: text("reference_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const generationJobs = pgTable("generation_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  characterId: uuid("character_id").references(() => characters.id),
  modelId: uuid("model_id").references(() => models.id).notNull(),
  type: varchar("type", { length: 40 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("queued"),
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt").notNull().default(""),
  paramsJson: jsonb("params_json").notNull().default({}),
  seed: integer("seed"),
  progress: integer("progress").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const generatedImages = pgTable("generated_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").references(() => generationJobs.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  imageUrl: text("image_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const workers = pgTable("workers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  machineId: varchar("machine_id", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 40 }).notNull().default("offline"),
  capabilitiesJson: jsonb("capabilities_json").notNull().default({}),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
