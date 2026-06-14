import { z } from "zod";

export const jobStatusSchema = z.enum([
  "queued",
  "assigned",
  "running",
  "uploading",
  "completed",
  "failed",
  "cancelled"
]);

export const generationTypeSchema = z.enum([
  "text-to-image",
  "character",
  "image-to-image"
]);

export const generateJobSchema = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().default(""),
  modelId: z.string().uuid(),
  type: generationTypeSchema.default("text-to-image"),
  width: z.number().int().min(256).max(2048).default(1024),
  height: z.number().int().min(256).max(2048).default(1024),
  steps: z.number().int().min(1).max(100).default(30),
  cfg: z.number().min(1).max(20).default(7),
  seed: z.number().int().nonnegative().optional(),
  sampler: z.string().default("euler"),
  scheduler: z.string().default("normal"),
  batchSize: z.number().int().min(1).max(4).default(1)
});

export const workerRegistrationSchema = z.object({
  name: z.string().min(1),
  machineId: z.string().min(1),
  capabilities: z.record(z.any()).default({})
});

export const workerJobStatusSchema = z.object({
  status: jobStatusSchema,
  progress: z.number().min(0).max(100).optional(),
  message: z.string().optional()
});

export const workerJobResultSchema = z.object({
  images: z.array(
    z.object({
      fileName: z.string().min(1),
      mimeType: z.string().default("image/png"),
      dataBase64: z.string().min(1),
      width: z.number().int().optional(),
      height: z.number().int().optional()
    })
  ).min(1),
  metadata: z.record(z.any()).default({})
});

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type GenerationType = z.infer<typeof generationTypeSchema>;
export type GenerateJobInput = z.infer<typeof generateJobSchema>;
export type WorkerRegistrationInput = z.infer<typeof workerRegistrationSchema>;
export type WorkerJobStatusInput = z.infer<typeof workerJobStatusSchema>;
export type WorkerJobResultInput = z.infer<typeof workerJobResultSchema>;

export const defaultModels = [
  {
    name: "SDXL Base",
    type: "sdxl",
    provider: "comfyui",
    workflowPath: "workflows/sdxl.json",
    isActive: true,
    config: {
      checkpoint: "sd_xl_base_1.0.safetensors",
      promptLanguage: "en",
      defaultParams: {
        width: 1024,
        height: 1024,
        steps: 30,
        cfg: 7,
        sampler: "euler",
        scheduler: "normal",
        batchSize: 1
      }
    }
  },
  {
    name: "SDXL Turbo",
    type: "sdxl-turbo",
    provider: "comfyui",
    workflowPath: "workflows/sdxl-turbo.json",
    isActive: true,
    config: {
      checkpoint: "sd_xl_turbo_1.0_fp16.safetensors",
      promptLanguage: "en",
      defaultParams: {
        width: 1024,
        height: 1024,
        steps: 4,
        cfg: 2,
        sampler: "euler_ancestral",
        scheduler: "normal",
        batchSize: 1
      }
    }
  },
  {
    name: "SDXL Refiner",
    type: "sdxl-refiner",
    provider: "comfyui",
    workflowPath: "workflows/sdxl-refiner.json",
    isActive: false,
    config: {
      checkpoint: "sd_xl_refiner_1.0.safetensors",
      promptLanguage: "en",
      defaultParams: {
        width: 1024,
        height: 1024,
        steps: 20,
        cfg: 6,
        sampler: "euler",
        scheduler: "normal",
        batchSize: 1
      }
    }
  },
  {
    name: "FLUX.1 schnell",
    type: "flux",
    provider: "comfyui",
    workflowPath: "workflows/flux-schnell.json",
    isActive: false,
    config: {
      checkpoint: "flux1-schnell.safetensors",
      promptLanguage: "en",
      defaultParams: {
        width: 1024,
        height: 1024,
        steps: 4,
        cfg: 1,
        sampler: "euler",
        scheduler: "normal",
        batchSize: 1
      }
    }
  }
] as const;
