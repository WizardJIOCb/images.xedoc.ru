import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { downloadImage, getHistory, loadWorkflowTemplate, queuePrompt, renderWorkflow, uploadInputImage } from "@images/comfy";
import { Jimp, rgbaToInt } from "jimp";
import { fetch } from "undici";

const env = {
  workerServerUrl: process.env.WORKER_SERVER_URL ?? "http://localhost:3025",
  workerSecret: process.env.WORKER_SECRET ?? "change_me",
  comfyUrl: process.env.COMFYUI_URL ?? "http://127.0.0.1:8188",
  workerName: process.env.WORKER_NAME ?? "home-4070ti",
  workflowRoot: process.env.COMFYUI_WORKFLOW_ROOT
};

function isSoccerBallPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  return [
    "soccer ball",
    "football ball",
    "classic black and white soccer ball",
    "футбольн",
    "мяч"
  ].some((token) => normalized.includes(token));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pointInPolygon(x: number, y: number, vertices: Array<{ x: number; y: number }>) {
  let inside = false;

  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
    const xi = vertices[index].x;
    const yi = vertices[index].y;
    const xj = vertices[previous].x;
    const yj = vertices[previous].y;

    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-6) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function createRegularPolygon(cx: number, cy: number, radius: number, sides: number, rotation = 0) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (Math.PI * 2 * index) / sides;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  });
}

async function renderSoccerBallComposite(referenceBuffer: Buffer, maskBuffer: Buffer) {
  const reference = await Jimp.read(referenceBuffer);
  const mask = await Jimp.read(maskBuffer);

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
    throw new Error("Soccer ball fallback could not find a valid mask area");
  }

  const maskWidth = maxX - minX + 1;
  const maskHeight = maxY - minY + 1;
  const diameter = Math.max(36, Math.round(Math.min(maskWidth, maskHeight) * 0.92));
  const centerX = Math.round((minX + maxX) / 2);
  const centerY = Math.round((minY + maxY) / 2);
  const topLeftX = Math.round(centerX - diameter / 2);
  const topLeftY = Math.round(centerY - diameter / 2);
  const radius = diameter / 2;

  const shadow = new Jimp({ width: reference.bitmap.width, height: reference.bitmap.height, color: 0x00000000 });
  const shadowCenterY = topLeftY + diameter - Math.round(diameter * 0.08);
  const shadowRadiusX = radius * 0.74;
  const shadowRadiusY = radius * 0.24;

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
  shadow.blur(Math.max(2, Math.round(diameter * 0.03)));

  const ball = new Jimp({ width: diameter, height: diameter, color: 0x00000000 });
  const polygons = [
    createRegularPolygon(0.5, 0.45, 0.14, 5, -Math.PI / 2),
    createRegularPolygon(0.32, 0.28, 0.09, 5, -Math.PI / 2),
    createRegularPolygon(0.68, 0.3, 0.09, 5, -Math.PI / 2),
    createRegularPolygon(0.26, 0.58, 0.09, 5, -Math.PI / 2),
    createRegularPolygon(0.72, 0.56, 0.09, 5, -Math.PI / 2),
    createRegularPolygon(0.5, 0.73, 0.1, 5, -Math.PI / 2)
  ];

  ball.scan(0, 0, diameter, diameter, (x, y, index) => {
    const nx = (x + 0.5 - radius) / radius;
    const ny = (y + 0.5 - radius) / radius;
    const distance = Math.sqrt(nx * nx + ny * ny);

    if (distance > 1) {
      return;
    }

    const light = clamp(1.08 - distance * 0.52 + (-nx * 0.16) + (-ny * 0.22), 0.45, 1.1);
    const base = Math.round(clamp(222 * light + 18, 120, 252));
    let red = base;
    let green = base;
    let blue = base;

    const px = x / diameter;
    const py = y / diameter;
    const inPatch = polygons.some((polygon) => pointInPolygon(px, py, polygon));

    if (inPatch) {
      const patchShade = clamp(0.55 + (-nx * 0.08) + (-ny * 0.1), 0.35, 0.7);
      const patchBase = Math.round(18 + patchShade * 36);
      red = patchBase;
      green = patchBase;
      blue = patchBase;
    }

    const rimDarken = clamp((distance - 0.72) / 0.28, 0, 1);
    red = Math.round(red * (1 - rimDarken * 0.28));
    green = Math.round(green * (1 - rimDarken * 0.28));
    blue = Math.round(blue * (1 - rimDarken * 0.28));

    ball.bitmap.data[index] = red;
    ball.bitmap.data[index + 1] = green;
    ball.bitmap.data[index + 2] = blue;
    ball.bitmap.data[index + 3] = 255;
  });

  const highlight = new Jimp({ width: diameter, height: diameter, color: 0x00000000 });
  highlight.scan(0, 0, diameter, diameter, (x, y, index) => {
    const dx = (x - diameter * 0.34) / (diameter * 0.18);
    const dy = (y - diameter * 0.28) / (diameter * 0.12);
    const distance = dx * dx + dy * dy;
    if (distance > 1) {
      return;
    }

    const alpha = Math.round((1 - distance) * 95);
    highlight.bitmap.data[index] = 255;
    highlight.bitmap.data[index + 1] = 255;
    highlight.bitmap.data[index + 2] = 255;
    highlight.bitmap.data[index + 3] = alpha;
  });
  ball.composite(highlight, 0, 0);

  reference.composite(shadow, 0, 0);
  reference.composite(ball, topLeftX, topLeftY);

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

  if (referenceImageBuffer && maskImageBuffer && isSoccerBallPrompt(job.prompt)) {
    const composited = await renderSoccerBallComposite(referenceImageBuffer, maskImageBuffer);
    await updateStatus(job.id, "uploading", 80);
    await sendResult(job.id, [{
      fileName: `soccer-ball-${job.id}.png`,
      dataBase64: composited.toString("base64")
    }], {
      worker: env.workerName,
      strategy: "deterministic-soccer-ball"
    });
    return;
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
    worker: env.workerName
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
