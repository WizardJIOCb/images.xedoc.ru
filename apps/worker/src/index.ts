import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { downloadImage, getHistory, loadWorkflowTemplate, queuePrompt, renderWorkflow, uploadInputImage } from "@images/comfy";
import { Jimp } from "jimp";
import { fetch } from "undici";

const env = {
  workerServerUrl: process.env.WORKER_SERVER_URL ?? "http://localhost:3025",
  workerSecret: process.env.WORKER_SECRET ?? "change_me",
  comfyUrl: process.env.COMFYUI_URL ?? "http://127.0.0.1:8188",
  workerName: process.env.WORKER_NAME ?? "home-4070ti",
  workflowRoot: process.env.COMFYUI_WORKFLOW_ROOT
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function renderObjectReferenceComposite(referenceBuffer: Buffer, maskBuffer: Buffer, objectBuffer: Buffer) {
  const reference = await Jimp.read(referenceBuffer);
  const mask = await Jimp.read(maskBuffer);
  const objectImage = await Jimp.read(objectBuffer);

  let minX = mask.bitmap.width;
  let minY = mask.bitmap.height;
  let maxX = -1;
  let maxY = -1;

  mask.scan(0, 0, mask.bitmap.width, mask.bitmap.height, (x, y, index) => {
    const value = mask.bitmap.data[index];
    if (value > 240) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  });

  if (maxX < 0 || maxY < 0) {
    throw new Error("Object reference composite could not find a valid mask area");
  }

  const maskWidth = maxX - minX + 1;
  const maskHeight = maxY - minY + 1;
  const targetWidth = Math.max(24, Math.round(maskWidth * 0.92));
  const targetHeight = Math.max(24, Math.round(maskHeight * 0.92));
  const centerX = Math.round((minX + maxX) / 2);
  const centerY = Math.round((minY + maxY) / 2);
  const objectAspect = objectImage.bitmap.width / Math.max(objectImage.bitmap.height, 1);

  let drawWidth = targetWidth;
  let drawHeight = Math.round(drawWidth / Math.max(objectAspect, 0.01));

  if (drawHeight > targetHeight) {
    drawHeight = targetHeight;
    drawWidth = Math.round(drawHeight * objectAspect);
  }

  drawWidth = Math.max(12, drawWidth);
  drawHeight = Math.max(12, drawHeight);

  const topLeftX = Math.round(centerX - drawWidth / 2);
  const topLeftY = Math.round(centerY - drawHeight / 2);

  const shadow = new Jimp({ width: reference.bitmap.width, height: reference.bitmap.height, color: 0x00000000 });
  const shadowCenterY = topLeftY + drawHeight - Math.round(drawHeight * 0.06);
  const shadowRadiusX = drawWidth * 0.42;
  const shadowRadiusY = drawHeight * 0.16;

  shadow.scan(
    clamp(Math.floor(topLeftX - shadowRadiusX * 0.4), 0, shadow.bitmap.width - 1),
    clamp(Math.floor(shadowCenterY - shadowRadiusY * 1.4), 0, shadow.bitmap.height - 1),
    clamp(Math.ceil(shadowRadiusX * 2.2), 1, shadow.bitmap.width),
    clamp(Math.ceil(shadowRadiusY * 2.8), 1, shadow.bitmap.height),
    (x, y, index) => {
      const dx = (x - centerX) / shadowRadiusX;
      const dy = (y - shadowCenterY) / shadowRadiusY;
      const distance = dx * dx + dy * dy;
      if (distance > 1) {
        return;
      }

      const alpha = Math.round((1 - distance) * 90);
      shadow.bitmap.data[index] = 0;
      shadow.bitmap.data[index + 1] = 0;
      shadow.bitmap.data[index + 2] = 0;
      shadow.bitmap.data[index + 3] = alpha;
    }
  );
  shadow.blur(Math.max(2, Math.round(Math.max(drawWidth, drawHeight) * 0.03)));

  objectImage.contain({ w: drawWidth, h: drawHeight });

  reference.composite(shadow, 0, 0);
  reference.composite(objectImage, topLeftX, topLeftY);

  return reference.getBuffer("image/png");
}

async function isComfyAvailable() {
  try {
    const response = await fetch(env.comfyUrl, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForComfyAvailable() {
  while (!(await isComfyAvailable())) {
    console.error(`ComfyUI is unavailable at ${env.comfyUrl}, waiting before taking new jobs`);
    await delay(5_000);
  }
}

async function api<T>(pathname: string, init?: RequestInit) {
  const response = await fetch(`${env.workerServerUrl}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-worker-secret": env.workerSecret,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Worker API ${pathname} failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function registerWorker() {
  return api("/api/worker/register", {
    method: "POST",
    body: JSON.stringify({
      name: env.workerName,
      machineId: os.hostname(),
      capabilities: {
        platform: os.platform(),
        cpus: os.cpus().length,
        comfyUrl: env.comfyUrl
      }
    })
  });
}

async function heartbeat() {
  return api("/api/worker/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      machineId: os.hostname()
    })
  });
}

async function fetchNextJob() {
  return api<{ job: null | any }>("/api/worker/jobs/next");
}

async function updateStatus(jobId: string, status: string, progress?: number) {
  return api(`/api/worker/jobs/${jobId}/status`, {
    method: "POST",
    body: JSON.stringify({ status, progress })
  });
}

async function sendError(jobId: string, message: string) {
  return api(`/api/worker/jobs/${jobId}/error`, {
    method: "POST",
    body: JSON.stringify({ message })
  });
}

async function sendResult(jobId: string, images: Array<{ fileName: string; dataBase64: string }>, metadata: Record<string, unknown>) {
  return api(`/api/worker/jobs/${jobId}/result`, {
    method: "POST",
    body: JSON.stringify({ images, metadata })
  });
}

async function executeJob(job: any) {
  await updateStatus(job.id, "running", 5);

  const workflowPath = path.isAbsolute(job.workflowPath)
    ? job.workflowPath
    : path.resolve(env.workflowRoot ?? process.cwd(), job.workflowPath);
  const workflowTemplate = await loadWorkflowTemplate(workflowPath);
  const params = job.paramsJson as Record<string, any>;
  const modelConfig = (job.modelConfig ?? {}) as Record<string, any>;
  let referenceImageName = "";
  let maskImageName = "";
  let referenceImageBuffer: Buffer | null = null;
  let maskImageBuffer: Buffer | null = null;
  let objectReferenceImageBuffer: Buffer | null = null;

  if (params.referenceImageUrl) {
    const referenceImageUrl = String(params.referenceImageUrl).startsWith("http")
      ? String(params.referenceImageUrl)
      : `${env.workerServerUrl}${params.referenceImageUrl}`;
    const response = await fetch(referenceImageUrl);

    if (!response.ok) {
      throw new Error(`Reference image download failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    referenceImageBuffer = buffer;
    const sourceUrl = new URL(referenceImageUrl);
    const originalFileName = path.basename(sourceUrl.pathname) || `reference-${job.id}.png`;
    const uploadedReference = await uploadInputImage(env.comfyUrl, originalFileName, buffer, response.headers.get("content-type") ?? "image/png");
    referenceImageName = uploadedReference.name;
  }

  if (params.maskImageUrl) {
    const maskImageUrl = String(params.maskImageUrl).startsWith("http")
      ? String(params.maskImageUrl)
      : `${env.workerServerUrl}${params.maskImageUrl}`;
    const response = await fetch(maskImageUrl);

    if (!response.ok) {
      throw new Error(`Mask image download failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    maskImageBuffer = buffer;
    const sourceUrl = new URL(maskImageUrl);
    const originalFileName = path.basename(sourceUrl.pathname) || `mask-${job.id}.png`;
    const uploadedMask = await uploadInputImage(env.comfyUrl, originalFileName, buffer, response.headers.get("content-type") ?? "image/png");
    maskImageName = uploadedMask.name;
  }

  if (params.objectReferenceImageUrl) {
    const objectReferenceImageUrl = String(params.objectReferenceImageUrl).startsWith("http")
      ? String(params.objectReferenceImageUrl)
      : `${env.workerServerUrl}${params.objectReferenceImageUrl}`;
    const response = await fetch(objectReferenceImageUrl);

    if (!response.ok) {
      throw new Error(`Object reference image download failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    objectReferenceImageBuffer = Buffer.from(arrayBuffer);
  }

  if (referenceImageBuffer && maskImageBuffer && objectReferenceImageBuffer) {
    const compositedBuffer = await renderObjectReferenceComposite(referenceImageBuffer, maskImageBuffer, objectReferenceImageBuffer);
    const uploadedReference = await uploadInputImage(
      env.comfyUrl,
      `object-reference-composite-${job.id}.png`,
      compositedBuffer,
      "image/png"
    );
    referenceImageName = uploadedReference.name;
  }

  const workflow = renderWorkflow(workflowTemplate, {
    ...Object.fromEntries(
      Object.entries(modelConfig).filter(([, value]) =>
        ["string", "number", "boolean"].includes(typeof value)
      )
    ),
    prompt: job.prompt,
    negative_prompt: job.negativePrompt,
    seed: job.seed ?? 1,
    steps: params.steps ?? 30,
    cfg: params.cfg ?? 7,
    denoise: params.denoise ?? 1,
    mask_grow: params.maskGrow ?? 0,
    sampler: params.sampler ?? "euler",
    scheduler: params.scheduler ?? "normal",
    width: params.width ?? 1024,
    height: params.height ?? 1024,
    batch_size: params.batchSize ?? 1,
    reference_image: referenceImageName,
    mask_image: maskImageName,
    model: modelConfig.checkpoint ?? "sd_xl_base_1.0.safetensors"
  });

  const queued = await queuePrompt(env.comfyUrl, workflow);
  await updateStatus(job.id, "running", 35);

  let history: Record<string, any> | null = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    history = await getHistory(env.comfyUrl, queued.prompt_id);
    if (history?.[queued.prompt_id]?.outputs) {
      break;
    }
    await delay(2000);
  }

  if (!history?.[queued.prompt_id]?.outputs) {
    throw new Error("ComfyUI did not return outputs in time");
  }

  const outputGroups = Object.values(history[queued.prompt_id].outputs) as Array<any>;
  const fileDescriptors = outputGroups.flatMap((outputGroup) => outputGroup.images ?? []);

  if (fileDescriptors.length === 0) {
    throw new Error("ComfyUI returned no images");
  }

  await updateStatus(job.id, "uploading", 80);

  const images = [];
  for (const descriptor of fileDescriptors) {
    const buffer = await downloadImage(env.comfyUrl, descriptor.filename, descriptor.subfolder, descriptor.type);
    images.push({
      fileName: descriptor.filename,
      dataBase64: buffer.toString("base64")
    });
  }

  await sendResult(job.id, images, {
    promptId: queued.prompt_id,
    worker: env.workerName,
    strategy: objectReferenceImageBuffer ? "object-reference-composite" : "model-only"
  });
}

async function main() {
  await waitForComfyAvailable();
  await registerWorker();
  setInterval(() => {
    heartbeat().catch((error) => {
      console.error("Heartbeat failed", error);
    });
  }, 15_000);

  while (true) {
    try {
      await waitForComfyAvailable();
      const { job } = await fetchNextJob();
      if (!job) {
        await delay(3000);
        continue;
      }

      try {
        await executeJob(job);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown worker error";
        console.error(message);
        await sendError(job.id, message).catch(() => undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker error";
      console.error(message);
      await delay(5000);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
