import { readFile } from "node:fs/promises";

type WorkflowTemplateValue = string | number;

export async function loadWorkflowTemplate(workflowPath: string) {
  return readFile(workflowPath, "utf8");
}

export function renderWorkflow(template: string, values: Record<string, WorkflowTemplateValue>) {
  return Object.entries(values).reduce((output, [key, value]) => {
    return output.replaceAll(`{{${key}}}`, String(value));
  }, template);
}

export async function queuePrompt(comfyUrl: string, workflowJson: string) {
  const response = await fetch(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      prompt: JSON.parse(workflowJson)
    })
  });

  if (!response.ok) {
    throw new Error(`ComfyUI queue failed with status ${response.status}`);
  }

  return response.json() as Promise<{ prompt_id: string }>;
}

export async function getHistory(comfyUrl: string, promptId: string) {
  const response = await fetch(`${comfyUrl}/history/${promptId}`);
  if (!response.ok) {
    throw new Error(`ComfyUI history failed with status ${response.status}`);
  }
  return response.json() as Promise<Record<string, any>>;
}

export async function downloadImage(comfyUrl: string, fileName: string, subfolder = "", type = "output") {
  const url = new URL(`${comfyUrl}/view`);
  url.searchParams.set("filename", fileName);
  url.searchParams.set("subfolder", subfolder);
  url.searchParams.set("type", type);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ComfyUI image download failed with status ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function uploadInputImage(comfyUrl: string, fileName: string, buffer: Buffer, mimeType = "image/png") {
  const formData = new FormData();
  formData.set("overwrite", "true");
  formData.set("type", "input");
  formData.set("image", new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);

  const response = await fetch(`${comfyUrl}/upload/image`, {
    method: "POST",
    body: formData as any
  });

  if (!response.ok) {
    throw new Error(`ComfyUI image upload failed with status ${response.status}`);
  }

  return response.json() as Promise<{ name: string }>;
}
