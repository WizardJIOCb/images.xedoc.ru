import path from "node:path";
import { mkdir } from "node:fs/promises";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createDb, generatedImages, generationJobs, models, users, workers } from "@images/db";
import { generateJobSchema, workerJobResultSchema, workerJobStatusSchema, workerRegistrationSchema } from "@images/shared";
import { env } from "./env.js";
import { createQueue } from "./queue.js";
import { seedDatabase } from "./seed.js";
import { ensureUploadDirs, saveGeneratedImage } from "./storage.js";

async function buildServer() {
  await seedDatabase(env.DATABASE_URL);
  await ensureUploadDirs(env.UPLOAD_DIR);
  await mkdir(path.join(env.UPLOAD_DIR, "generated"), { recursive: true });

  const db = createDb(env.DATABASE_URL);
  const { queue } = createQueue(env.REDIS_URL);
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(multipart);
  await app.register(fastifyStatic, {
    root: path.resolve(env.UPLOAD_DIR),
    prefix: "/uploads/"
  });

  app.get("/api/health", async () => ({
    ok: true,
    appUrl: env.APP_URL
  }));

  app.get("/api/models", async () => {
    return db.select().from(models).where(eq(models.isActive, true)).orderBy(asc(models.name));
  });

  app.get("/api/gallery", async () => {
    return db.select({
      id: generatedImages.id,
      imageUrl: generatedImages.imageUrl,
      thumbnailUrl: generatedImages.thumbnailUrl,
      metadataJson: generatedImages.metadataJson,
      createdAt: generatedImages.createdAt,
      prompt: generationJobs.prompt,
      seed: generationJobs.seed,
      modelId: generationJobs.modelId
    })
      .from(generatedImages)
      .innerJoin(generationJobs, eq(generatedImages.jobId, generationJobs.id))
      .orderBy(desc(generatedImages.createdAt))
      .limit(50);
  });

  app.get("/api/jobs", async () => {
    return db.select().from(generationJobs).orderBy(desc(generationJobs.createdAt)).limit(50);
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const job = await db.select().from(generationJobs).where(eq(generationJobs.id, params.id)).limit(1);

    if (job.length === 0) {
      return reply.code(404).send({ message: "Job not found" });
    }

    const images = await db.select().from(generatedImages).where(eq(generatedImages.jobId, params.id));
    return { job: job[0], images };
  });

  app.post("/api/generate", async (request, reply) => {
    const input = generateJobSchema.parse(request.body);
    const adminUser = await db.select().from(users).where(eq(users.username, "admin")).limit(1);

    if (adminUser.length === 0) {
      return reply.code(500).send({ message: "Admin user not found" });
    }

    const selectedModel = await db.select().from(models).where(eq(models.id, input.modelId)).limit(1);
    if (selectedModel.length === 0) {
      return reply.code(404).send({ message: "Model not found" });
    }

    const [job] = await db.insert(generationJobs).values({
      userId: adminUser[0].id,
      modelId: input.modelId,
      type: input.type,
      status: "queued",
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      paramsJson: {
        width: input.width,
        height: input.height,
        steps: input.steps,
        cfg: input.cfg,
        sampler: input.sampler,
        scheduler: input.scheduler,
        batchSize: input.batchSize,
        workflowPath: selectedModel[0].workflowPath,
        modelConfig: selectedModel[0].configJson
      },
      seed: input.seed ?? Math.floor(Math.random() * 2147483647)
    }).returning();

    await queue.add("generate", { jobId: job.id }, { removeOnComplete: 100, removeOnFail: 100 });
    return reply.code(201).send(job);
  });

  app.post("/api/worker/register", async (request, reply) => {
    const secret = request.headers["x-worker-secret"];
    if (secret !== env.WORKER_SECRET) {
      return reply.code(401).send({ message: "Invalid worker secret" });
    }

    const input = workerRegistrationSchema.parse(request.body);
    const existing = await db.select().from(workers).where(eq(workers.machineId, input.machineId)).limit(1);

    if (existing.length === 0) {
      const [worker] = await db.insert(workers).values({
        name: input.name,
        machineId: input.machineId,
        status: "online",
        capabilitiesJson: input.capabilities,
        lastSeenAt: new Date()
      }).returning();

      return worker;
    }

    const [worker] = await db.update(workers).set({
      name: input.name,
      status: "online",
      capabilitiesJson: input.capabilities,
      lastSeenAt: new Date(),
      updatedAt: new Date()
    }).where(eq(workers.machineId, input.machineId)).returning();

    return worker;
  });

  app.post("/api/worker/heartbeat", async (request, reply) => {
    const secret = request.headers["x-worker-secret"];
    if (secret !== env.WORKER_SECRET) {
      return reply.code(401).send({ message: "Invalid worker secret" });
    }

    const body = request.body as { machineId: string };
    await db.update(workers).set({
      status: "online",
      lastSeenAt: new Date(),
      updatedAt: new Date()
    }).where(eq(workers.machineId, body.machineId));

    return { ok: true };
  });

  app.get("/api/worker/jobs/next", async (request, reply) => {
    const secret = request.headers["x-worker-secret"];
    if (secret !== env.WORKER_SECRET) {
      return reply.code(401).send({ message: "Invalid worker secret" });
    }

    const queuedJob = await db.select({
      id: generationJobs.id,
      prompt: generationJobs.prompt,
      negativePrompt: generationJobs.negativePrompt,
      paramsJson: generationJobs.paramsJson,
      seed: generationJobs.seed,
      modelId: generationJobs.modelId,
      modelConfig: models.configJson,
      workflowPath: models.workflowPath
    })
      .from(generationJobs)
      .innerJoin(models, eq(generationJobs.modelId, models.id))
      .where(eq(generationJobs.status, "queued"))
      .orderBy(asc(generationJobs.createdAt))
      .limit(1);

    if (queuedJob.length === 0) {
      return { job: null };
    }

    await db.update(generationJobs).set({
      status: "assigned"
    }).where(and(eq(generationJobs.id, queuedJob[0].id), eq(generationJobs.status, "queued")));

    return { job: queuedJob[0] };
  });

  app.post("/api/worker/jobs/:id/status", async (request, reply) => {
    const secret = request.headers["x-worker-secret"];
    if (secret !== env.WORKER_SECRET) {
      return reply.code(401).send({ message: "Invalid worker secret" });
    }

    const params = request.params as { id: string };
    const input = workerJobStatusSchema.parse(request.body);

    await db.update(generationJobs).set({
      status: input.status,
      progress: input.progress ?? sql`${generationJobs.progress}`,
      startedAt: input.status === "running" ? new Date() : sql`${generationJobs.startedAt}`
    }).where(eq(generationJobs.id, params.id));

    return { ok: true };
  });

  app.post("/api/worker/jobs/:id/result", async (request, reply) => {
    const secret = request.headers["x-worker-secret"];
    if (secret !== env.WORKER_SECRET) {
      return reply.code(401).send({ message: "Invalid worker secret" });
    }

    const params = request.params as { id: string };
    const input = workerJobResultSchema.parse(request.body);
    const job = await db.select().from(generationJobs).where(eq(generationJobs.id, params.id)).limit(1);

    if (job.length === 0) {
      return reply.code(404).send({ message: "Job not found" });
    }

    for (const image of input.images) {
      const stored = await saveGeneratedImage(env.UPLOAD_DIR, image.dataBase64, image.fileName);
      await db.insert(generatedImages).values({
        jobId: params.id,
        userId: job[0].userId,
        imageUrl: stored.imageUrl,
        thumbnailUrl: stored.thumbnailUrl,
        metadataJson: {
          ...input.metadata,
          width: image.width,
          height: image.height
        }
      });
    }

    await db.update(generationJobs).set({
      status: "completed",
      progress: 100,
      completedAt: new Date()
    }).where(eq(generationJobs.id, params.id));

    return { ok: true };
  });

  app.post("/api/worker/jobs/:id/error", async (request, reply) => {
    const secret = request.headers["x-worker-secret"];
    if (secret !== env.WORKER_SECRET) {
      return reply.code(401).send({ message: "Invalid worker secret" });
    }

    const params = request.params as { id: string };
    const body = request.body as { message: string };

    await db.update(generationJobs).set({
      status: "failed",
      errorMessage: body.message,
      completedAt: new Date()
    }).where(eq(generationJobs.id, params.id));

    return { ok: true };
  });

  return app;
}

async function main() {
  const app = await buildServer();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
