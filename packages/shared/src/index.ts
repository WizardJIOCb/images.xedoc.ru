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
  referenceImageUrl: z.string().min(1).optional(),
  maskImageUrl: z.string().min(1).optional(),
  denoise: z.number().min(0.05).max(1).optional(),
  width: z.number().int().min(256).max(2048).optional(),
  height: z.number().int().min(256).max(2048).optional(),
  steps: z.number().int().min(1).max(100).optional(),
  cfg: z.number().min(0).max(20).optional(),
  seed: z.number().int().nonnegative().optional(),
  sampler: z.string().optional(),
  scheduler: z.string().optional(),
  batchSize: z.number().int().min(1).max(4).optional()
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
      sizeGb: 6.46,
      supportsReference: true,
      supportsInpaint: true,
      editingTier: "standard",
      defaultReferenceDenoise: 0.32,
      defaultMaskGrow: 14,
      objectInsertionMinDenoise: 0.42,
      objectInsertionMinSteps: 34,
      objectInsertionBatchSize: 2,
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
      sizeGb: 4.76,
      supportsReference: true,
      supportsInpaint: true,
      editingTier: "standard",
      defaultReferenceDenoise: 0.28,
      defaultMaskGrow: 12,
      objectInsertionMinDenoise: 0.36,
      objectInsertionMinSteps: 4,
      objectInsertionBatchSize: 2,
      promptLanguage: "en",
      defaultParams: {
        width: 512,
        height: 512,
        steps: 4,
        cfg: 0,
        sampler: "euler_ancestral",
        scheduler: "normal",
        batchSize: 1
      }
    }
  },
  {
    name: "SDXL Lightning 4step",
    type: "sdxl-lightning",
    provider: "comfyui",
    workflowPath: "workflows/sdxl-lightning-4step.json",
    isActive: true,
    config: {
      checkpoint: "sdxl_lightning_4step.safetensors",
      sizeGb: 6.46,
      supportsReference: true,
      supportsInpaint: true,
      editingTier: "standard",
      defaultReferenceDenoise: 0.3,
      defaultMaskGrow: 14,
      objectInsertionMinDenoise: 0.42,
      objectInsertionMinSteps: 6,
      objectInsertionBatchSize: 2,
      promptLanguage: "en",
      defaultParams: {
        width: 1024,
        height: 1024,
        steps: 4,
        cfg: 1,
        sampler: "euler",
        scheduler: "sgm_uniform",
        batchSize: 1
      }
    }
  },
  {
    name: "SDXL Lightning 4step UNet",
    type: "sdxl-lightning-unet",
    provider: "comfyui",
    workflowPath: "workflows/sdxl-lightning-4step-unet.json",
    isActive: true,
    config: {
      checkpoint: "sdxl_lightning_4step_unet.safetensors",
      baseCheckpoint: "sd_xl_base_1.0.safetensors",
      sizeGb: 6.46,
      baseCheckpointSizeGb: 6.46,
      supportsReference: true,
      supportsInpaint: true,
      editingTier: "standard",
      defaultReferenceDenoise: 0.3,
      defaultMaskGrow: 14,
      objectInsertionMinDenoise: 0.42,
      objectInsertionMinSteps: 6,
      objectInsertionBatchSize: 2,
      promptLanguage: "en",
      defaultParams: {
        width: 1024,
        height: 1024,
        steps: 4,
        cfg: 1,
        sampler: "euler",
        scheduler: "sgm_uniform",
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
      sizeGb: 5.78,
      supportsReference: false,
      supportsInpaint: false,
      editingTier: "standard",
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
    name: "HunyuanDiT 1.2",
    type: "hunyuan-dit",
    provider: "comfyui",
    workflowPath: "workflows/hunyuan-dit-1.2.json",
    isActive: true,
    config: {
      checkpoint: "hunyuan_dit_1.2.safetensors",
      sizeGb: 10.61,
      supportsReference: false,
      supportsInpaint: false,
      editingTier: "standard",
      promptLanguage: "zh",
      defaultParams: {
        width: 1024,
        height: 1024,
        steps: 30,
        cfg: 5,
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
      sizeGb: 23.8,
      supportsReference: false,
      supportsInpaint: false,
      editingTier: "strong",
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
  },
  {
    name: "SDXL Inpaint 0.1",
    type: "sdxl-inpaint-diffusers",
    provider: "comfyui",
    workflowPath: "workflows/sdxl-diffusers-inpaint.json",
    isActive: true,
    config: {
      modelPath: "stable-diffusion-xl-1.0-inpainting-0.1",
      sizeGb: 6.03,
      supportsReference: true,
      supportsInpaint: true,
      requiresMask: true,
      editOnly: true,
      editingTier: "strong",
      defaultReferenceDenoise: 0.2,
      defaultMaskGrow: 18,
      objectInsertionMinDenoise: 0.5,
      objectInsertionMinSteps: 40,
      objectInsertionBatchSize: 3,
      promptLanguage: "en",
      defaultParams: {
        width: 1024,
        height: 1024,
        steps: 30,
        cfg: 6,
        sampler: "euler",
        scheduler: "normal",
        batchSize: 1
      }
    }
  },
  {
    name: "SDXL Base Inpaint+",
    type: "sdxl-inpaint-plus",
    provider: "comfyui",
    workflowPath: "workflows/sdxl-inpaint.json",
    isActive: true,
    config: {
      checkpoint: "sd_xl_base_1.0.safetensors",
      sizeGb: 6.46,
      supportsReference: true,
      supportsInpaint: true,
      requiresMask: true,
      editOnly: true,
      editingTier: "strong",
      defaultReferenceDenoise: 0.44,
      defaultMaskGrow: 28,
      objectInsertionMinDenoise: 0.58,
      objectInsertionMinSteps: 40,
      objectInsertionBatchSize: 3,
      promptLanguage: "en",
      defaultParams: {
        width: 1024,
        height: 1024,
        steps: 40,
        cfg: 7,
        sampler: "euler",
        scheduler: "normal",
        batchSize: 1
      }
    }
  }
] as const;
