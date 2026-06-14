import { FormEvent, useEffect, useRef, useState } from "react";

type Model = {
  id: string;
  name: string;
  type: string;
  configJson: {
    checkpoint?: string;
    modelPath?: string;
    sizeGb?: number;
    baseCheckpointSizeGb?: number;
    supportsReference?: boolean;
    supportsInpaint?: boolean;
    requiresMask?: boolean;
    editOnly?: boolean;
    editingTier?: "standard" | "strong";
    defaultReferenceDenoise?: number;
    promptLanguage?: string;
    defaultParams?: {
      width?: number;
      height?: number;
      steps?: number;
      cfg?: number;
      sampler?: string;
      scheduler?: string;
      batchSize?: number;
    };
  };
};

type Job = {
  id: string;
  status: string;
  prompt: string;
  progress: number;
  seed: number | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  generationDurationMs?: number | null;
  previewImageUrl?: string | null;
  modelName?: string;
};

type GalleryItem = {
  id: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  prompt: string;
  seed: number | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  generationDurationMs?: number | null;
  modelName?: string;
};

type PaginationMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type PaginatedResponse<T> = {
  items: T[];
  pagination: PaginationMeta;
};

type GenerationPreset = {
  id: string;
  label: string;
  description: string;
  values: {
    width: number;
    height: number;
    steps: number;
    cfg: number;
    batchSize: number;
  };
};

type EditPreset = {
  id: string;
  label: string;
  description: string;
  denoise: number;
};

type PromptTemplate = {
  id: string;
  label: string;
  text: string;
};

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const pageSizeOptions = [4, 6, 10];

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

function formatDuration(durationMs?: number | null) {
  if (durationMs == null) {
    return "—";
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatModelSize(model: Model) {
  const sizeGb = model.configJson?.sizeGb;
  const baseCheckpointSizeGb = model.configJson?.baseCheckpointSizeGb;

  if (sizeGb == null) {
    return "";
  }

  if (baseCheckpointSizeGb != null) {
    return ` (${sizeGb.toFixed(2)} GB + base ${baseCheckpointSizeGb.toFixed(2)} GB)`;
  }

  return ` (${sizeGb.toFixed(2)} GB)`;
}

function getModelPresets(model: Model | null): GenerationPreset[] {
  const defaults = model?.configJson?.defaultParams;
  const defaultWidth = defaults?.width ?? 1024;
  const defaultHeight = defaults?.height ?? 1024;
  const defaultSteps = defaults?.steps ?? 30;
  const defaultCfg = defaults?.cfg ?? 7;
  const defaultBatchSize = defaults?.batchSize ?? 1;

  const balanced: GenerationPreset = {
    id: "balanced",
    label: "Balanced",
    description: "Оптимальный пресет для этой модели.",
    values: {
      width: defaultWidth,
      height: defaultHeight,
      steps: defaultSteps,
      cfg: defaultCfg,
      batchSize: defaultBatchSize
    }
  };

  switch (model?.type) {
    case "sdxl-turbo":
      return [
        {
          id: "fast",
          label: "Fast",
          description: "Максимально быстро для черновиков и идей.",
          values: {
            width: 512,
            height: 512,
            steps: 2,
            cfg: 0,
            batchSize: 1
          }
        },
        balanced,
        {
          id: "variants",
          label: "Variants",
          description: "Сразу несколько быстрых вариантов.",
          values: {
            width: 512,
            height: 512,
            steps: 4,
            cfg: 0,
            batchSize: 2
          }
        }
      ];
    case "sdxl-lightning":
    case "sdxl-lightning-unet":
      return [
        {
          id: "fast",
          label: "Fast",
          description: "Очень быстрый прогон в духе Lightning.",
          values: {
            width: 768,
            height: 768,
            steps: 4,
            cfg: 1,
            batchSize: 1
          }
        },
        balanced,
        {
          id: "landscape",
          label: "Landscape",
          description: "Широкий кадр для сцен и окружения.",
          values: {
            width: 1216,
            height: 832,
            steps: 4,
            cfg: 1,
            batchSize: 1
          }
        }
      ];
    case "hunyuan-dit":
      return [
        {
          id: "fast",
          label: "Fast",
          description: "Чуть быстрее, сохраняя приличное качество.",
          values: {
            width: 1024,
            height: 1024,
            steps: 20,
            cfg: 5,
            batchSize: 1
          }
        },
        balanced,
        {
          id: "quality",
          label: "Quality",
          description: "Больше шагов для более чистой картинки.",
          values: {
            width: 1024,
            height: 1024,
            steps: 40,
            cfg: 6,
            batchSize: 1
          }
        }
      ];
    case "sdxl":
    default:
      return [
        {
          id: "fast",
          label: "Fast",
          description: "Быстрее и легче для GPU, хорошо для тестов.",
          values: {
            width: 768,
            height: 768,
            steps: 20,
            cfg: 6,
            batchSize: 1
          }
        },
        balanced,
        {
          id: "quality",
          label: "Quality",
          description: "Больше шагов для аккуратной детализации.",
          values: {
            width: 1024,
            height: 1024,
            steps: 40,
            cfg: 7,
            batchSize: 1
          }
        },
        {
          id: "portrait",
          label: "Portrait",
          description: "Вертикальный формат для персонажей и портретов.",
          values: {
            width: 832,
            height: 1216,
            steps: 30,
            cfg: 7,
            batchSize: 1
          }
        }
      ];
  }
}

function getEditPresets(model: Model | null): EditPreset[] {
  const strong = model?.configJson?.editingTier === "strong";

  return [
    {
      id: "precise",
      label: "Precise Fix",
      description: "Минимальные изменения для мелких правок и ретуши.",
      denoise: strong ? 0.16 : 0.18
    },
    {
      id: "object",
      label: "Add Object",
      description: "Добавить новый объект в подготовленную область.",
      denoise: strong ? 0.2 : 0.24
    },
    {
      id: "replace",
      label: "Replace Area",
      description: "Заменить заметный участок, сохранив остальную сцену.",
      denoise: strong ? 0.28 : 0.34
    },
    {
      id: "redraw",
      label: "Big Redraw",
      description: "Сильнее перерисовать выбранную область.",
      denoise: strong ? 0.42 : 0.5
    }
  ];
}

function getPromptTemplates(): PromptTemplate[] {
  return [
    {
      id: "add-object",
      label: "Add Object",
      text: "Сохрани исходную сцену без изменений. В закрашенной области добавь [объект], реалистично, правильная перспектива, тот же свет, без изменения человека и фона."
    },
    {
      id: "replace-object",
      label: "Replace Area",
      text: "Сохрани исходную сцену и композицию. В закрашенной области замени текущий объект на [новый объект], аккуратно впиши в сцену, тот же ракурс и освещение."
    },
    {
      id: "background-fix",
      label: "Repair Background",
      text: "Сохрани исходную сцену. В закрашенной области аккуратно дорисуй фон в том же стиле, с тем же светом и перспективой, без новых лишних объектов."
    }
  ];
}

function getEditModeLabel(model: Model | null, hasMask: boolean) {
  if (!model) {
    return "Text-to-image";
  }

  if (hasMask && model.configJson?.supportsInpaint) {
    return model.configJson?.editingTier === "strong" ? "Strong Inpaint" : "Inpaint";
  }

  if (model.configJson?.supportsReference) {
    return "Reference Img2Img";
  }

  return "Text-to-image";
}

export function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [selectedModelMeta, setSelectedModelMeta] = useState<Model | null>(null);
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsPageSize, setJobsPageSize] = useState(6);
  const [jobsPagination, setJobsPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 6,
    totalItems: 0,
    totalPages: 1
  });
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryPageSize, setGalleryPageSize] = useState(6);
  const [galleryPagination, setGalleryPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 6,
    totalItems: 0,
    totalPages: 1
  });
  const [form, setForm] = useState({
    prompt: "",
    negativePrompt: "",
    modelId: "",
    denoise: 0.35,
    width: 1024,
    height: 1024,
    steps: 30,
    cfg: 7,
    batchSize: 1
  });
  const [submitting, setSubmitting] = useState(false);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceImageSize, setReferenceImageSize] = useState<{ width: number; height: number } | null>(null);
  const [maskDirty, setMaskDirty] = useState(false);
  const [brushSize, setBrushSize] = useState(48);
  const [toolMode, setToolMode] = useState<"brush" | "eraser">("brush");
  const formRef = useRef(form);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingMaskRef = useRef(false);
  const lastMaskPointRef = useRef<{ x: number; y: number } | null>(null);
  const presets = getModelPresets(selectedModelMeta);
  const editPresets = getEditPresets(selectedModelMeta);
  const promptTemplates = getPromptTemplates();

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
    };
  }, [referencePreviewUrl]);

  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !referenceImageSize) {
      return;
    }

    canvas.width = referenceImageSize.width;
    canvas.height = referenceImageSize.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    setMaskDirty(false);
  }, [referenceImageSize, referencePreviewUrl]);

  async function loadData() {
    const [modelsResponse, jobsResponse, galleryResponse] = await Promise.all([
      fetch(`${apiUrl}/api/models`),
      fetch(`${apiUrl}/api/jobs?page=${jobsPage}&pageSize=${jobsPageSize}`),
      fetch(`${apiUrl}/api/gallery?page=${galleryPage}&pageSize=${galleryPageSize}`)
    ]);

    const nextModels = await modelsResponse.json();
    const nextJobs = await jobsResponse.json() as PaginatedResponse<Job>;
    const nextGallery = await galleryResponse.json() as PaginatedResponse<GalleryItem>;

    setModels(nextModels);
    setJobs(nextJobs.items);
    setJobsPagination(nextJobs.pagination);
    setGallery(nextGallery.items);
    setGalleryPagination(nextGallery.pagination);

    if (formRef.current.modelId) {
      const activeModel = nextModels.find((model: Model) => model.id === formRef.current.modelId) ?? null;
      setSelectedModelMeta(activeModel);
    }

    if (!formRef.current.modelId && nextModels[0]) {
      setSelectedModelMeta(nextModels[0]);
      setForm((current) => ({
        ...current,
        modelId: nextModels[0].id,
        denoise: nextModels[0].configJson?.defaultReferenceDenoise ?? current.denoise,
        width: nextModels[0].configJson?.defaultParams?.width ?? current.width,
        height: nextModels[0].configJson?.defaultParams?.height ?? current.height,
        steps: nextModels[0].configJson?.defaultParams?.steps ?? current.steps,
        cfg: nextModels[0].configJson?.defaultParams?.cfg ?? current.cfg,
        batchSize: nextModels[0].configJson?.defaultParams?.batchSize ?? current.batchSize
      }));
    }
  }

  useEffect(() => {
    loadData().catch(console.error);
    const interval = setInterval(() => {
      loadData().catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, [jobsPage, jobsPageSize, galleryPage, galleryPageSize]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    try {
      let referenceImageUrl: string | undefined;
      let maskImageUrl: string | undefined;

      if (referenceFile) {
        if (!selectedModelMeta?.configJson?.supportsReference) {
          throw new Error("This model does not support reference images yet");
        }

        const uploadBody = new FormData();
        uploadBody.append("file", referenceFile);

        const uploadResponse = await fetch(`${apiUrl}/api/reference-images`, {
          method: "POST",
          body: uploadBody
        });

        if (!uploadResponse.ok) {
          throw new Error("Reference image upload failed");
        }

        const uploadResult = await uploadResponse.json() as { imageUrl: string };
        referenceImageUrl = uploadResult.imageUrl;
      }

      if (referenceFile && maskDirty && maskCanvasRef.current) {
        const maskBlob = await new Promise<Blob | null>((resolve) => {
          const sourceCanvas = maskCanvasRef.current;
          if (!sourceCanvas) {
            resolve(null);
            return;
          }

          const exportCanvas = document.createElement("canvas");
          exportCanvas.width = sourceCanvas.width;
          exportCanvas.height = sourceCanvas.height;
          const exportContext = exportCanvas.getContext("2d");
          if (!exportContext) {
            resolve(null);
            return;
          }

          exportContext.fillStyle = "black";
          exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
          const sourceContext = sourceCanvas.getContext("2d");
          if (!sourceContext) {
            resolve(null);
            return;
          }

          const sourceImage = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
          const exportImage = exportContext.createImageData(sourceCanvas.width, sourceCanvas.height);

          for (let index = 0; index < sourceImage.data.length; index += 4) {
            const alpha = sourceImage.data[index + 3];
            exportImage.data[index] = alpha;
            exportImage.data[index + 1] = alpha;
            exportImage.data[index + 2] = alpha;
            exportImage.data[index + 3] = 255;
          }

          exportContext.putImageData(exportImage, 0, 0);
          exportCanvas.toBlob((blob) => resolve(blob), "image/png");
        });

        if (maskBlob) {
          const uploadBody = new FormData();
          uploadBody.append("file", new File([maskBlob], "mask.png", { type: "image/png" }));

          const uploadResponse = await fetch(`${apiUrl}/api/reference-images`, {
            method: "POST",
            body: uploadBody
          });

          if (!uploadResponse.ok) {
            throw new Error("Mask image upload failed");
          }

          const uploadResult = await uploadResponse.json() as { imageUrl: string };
          maskImageUrl = uploadResult.imageUrl;
        }
      }

      await fetch(`${apiUrl}/api/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...form,
          type: referenceImageUrl ? "image-to-image" : "text-to-image",
          referenceImageUrl,
          maskImageUrl
        })
      });
      setForm((current) => ({ ...current, prompt: "", negativePrompt: "" }));
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
      setReferenceFile(null);
      setReferencePreviewUrl(null);
      setReferenceImageSize(null);
      setMaskDirty(false);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  }

  function drawMask(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = maskCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const brushRadius = (brushSize * (scaleX + scaleY)) / 4;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushRadius * 2;

    if (toolMode === "eraser") {
      context.globalCompositeOperation = "destination-out";
      context.strokeStyle = "rgba(0, 0, 0, 1)";
      context.fillStyle = "rgba(0, 0, 0, 1)";
    } else {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = "rgba(232, 93, 4, 0.55)";
      context.fillStyle = "rgba(232, 93, 4, 0.55)";
    }

    const lastPoint = lastMaskPointRef.current;
    if (lastPoint) {
      context.beginPath();
      context.moveTo(lastPoint.x, lastPoint.y);
      context.lineTo(x, y);
      context.stroke();
    }

    context.beginPath();
    context.arc(x, y, brushRadius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    lastMaskPointRef.current = { x, y };
    setMaskDirty(true);
  }

  function handleModelChange(modelId: string) {
    const nextModel = models.find((model) => model.id === modelId) ?? null;
    setSelectedModelMeta(nextModel);
    setForm((current) => ({
      ...current,
      modelId,
      denoise: nextModel?.configJson?.defaultReferenceDenoise ?? current.denoise,
      width: nextModel?.configJson?.defaultParams?.width ?? current.width,
      height: nextModel?.configJson?.defaultParams?.height ?? current.height,
      steps: nextModel?.configJson?.defaultParams?.steps ?? current.steps,
      cfg: nextModel?.configJson?.defaultParams?.cfg ?? current.cfg,
      batchSize: nextModel?.configJson?.defaultParams?.batchSize ?? current.batchSize
    }));
  }

  function renderPaginationControls(
    pagination: PaginationMeta,
    onPageChange: (page: number) => void,
    onPageSizeChange: (pageSize: number) => void
  ) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
        <div className="flex items-center gap-2 text-sm text-ink/65">
          <span>Show</span>
          <div className="flex items-center gap-2">
            {pageSizeOptions.map((size) => (
              <button
                key={size}
                type="button"
                className={`rounded-full px-3 py-1 transition ${
                  pagination.pageSize === size ? "bg-ink text-soft" : "bg-canvas text-ink/70"
                }`}
                onClick={() => {
                  onPageSizeChange(size);
                  onPageChange(1);
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className="rounded-full bg-canvas px-3 py-1 text-ink/70 transition disabled:cursor-not-allowed disabled:opacity-40"
            disabled={pagination.page <= 1}
            onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
          >
            Prev
          </button>
          <span className="text-ink/65">
            Page {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            className="rounded-full bg-canvas px-3 py-1 text-ink/70 transition disabled:cursor-not-allowed disabled:opacity-40"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  const isEditOnlyModel = selectedModelMeta?.configJson?.editOnly === true;
  const requiresMask = selectedModelMeta?.configJson?.requiresMask === true;
  const activeModeLabel = getEditModeLabel(selectedModelMeta, maskDirty);
  const canSubmit = Boolean(
    form.modelId
    && (!isEditOnlyModel || (referenceFile && maskDirty))
  );

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
        <header className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-black/10 bg-[radial-gradient(circle_at_top_left,_rgba(232,93,4,0.15),_transparent_40%),linear-gradient(135deg,#fffaf0,#f0e6d2)] p-8 shadow-[0_20px_80px_rgba(29,29,27,0.08)]">
            <p className="mb-3 text-sm uppercase tracking-[0.3em] text-accent2">images.xedoc.ru</p>
            <h1 className="font-display text-4xl leading-tight md:text-6xl">Панель генерации изображений с вашим домашним GPU worker</h1>
            <p className="mt-4 max-w-2xl text-lg text-ink/70">
              Сервер хранит очередь, историю и галерею, а домашний RTX 4070 Ti выполняет генерацию через ComfyUI.
            </p>
          </div>

          <div className="rounded-[2rem] bg-ink p-8 text-soft shadow-[0_20px_80px_rgba(29,29,27,0.18)]">
            <p className="text-sm uppercase tracking-[0.3em] text-accent">MVP scope</p>
            <div className="mt-6 space-y-3 text-sm text-soft/80">
              <div>Text-to-image через очередь задач</div>
              <div>Поддержка нескольких моделей и workflow</div>
              <div>Polling worker для Windows + ComfyUI</div>
              <div>Галерея с историей промптов и seed</div>
            </div>
          </div>
        </header>

        <main className="mt-10 grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[2rem] bg-soft p-6 shadow-[0_10px_50px_rgba(29,29,27,0.08)]">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-accent2">Create</p>
                <h2 className="font-display text-3xl">Новая генерация</h2>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Prompt</span>
                <textarea
                  className="min-h-32 w-full rounded-3xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-accent"
                  value={form.prompt}
                  onChange={(event) => setForm({ ...form, prompt: event.target.value })}
                  placeholder="cinematic portrait of a cyber druid, volumetric light, detailed face"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Negative prompt</span>
                <textarea
                  className="min-h-24 w-full rounded-3xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-accent"
                  value={form.negativePrompt}
                  onChange={(event) => setForm({ ...form, negativePrompt: event.target.value })}
                  placeholder="blurry, malformed hands, low quality"
                />
              </label>

              <div className="rounded-[1.5rem] border border-black/10 bg-white/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Reference Image</p>
                    <p className="mt-2 text-xs text-ink/60">
                      {isEditOnlyModel
                        ? "У выбранной модели обязательны и референс, и маска."
                        : "Если есть маска, сервис использует inpaint вместо обычного reference img2img."}
                    </p>
                    <p className="mt-1 text-xs text-ink/60">
                      Можно прикрепить картинку и сделать генерацию на её основе через img2img.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-ink px-3 py-1 text-xs uppercase tracking-[0.2em] text-soft">
                      {activeModeLabel}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                      selectedModelMeta?.configJson?.supportsReference
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}>
                      {selectedModelMeta?.configJson?.supportsReference ? "Supported" : "Text only"}
                    </span>
                    {selectedModelMeta?.configJson?.editingTier === "strong" ? (
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sky-800">
                        Strong Edit
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                  <input
                    className="block w-full text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-soft"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;

                      if (referencePreviewUrl) {
                        URL.revokeObjectURL(referencePreviewUrl);
                      }

                      setReferenceFile(nextFile);
                      setMaskDirty(false);
                      setToolMode("brush");
                      lastMaskPointRef.current = null;
                      if (nextFile) {
                        const nextPreviewUrl = URL.createObjectURL(nextFile);
                        setReferencePreviewUrl(nextPreviewUrl);
                        const image = new Image();
                        image.onload = () => {
                          setReferenceImageSize({
                            width: image.naturalWidth,
                            height: image.naturalHeight
                          });
                        };
                        image.src = nextPreviewUrl;
                      } else {
                        setReferencePreviewUrl(null);
                        setReferenceImageSize(null);
                      }
                    }}
                  />

                  {referenceFile ? (
                    <button
                      type="button"
                      className="rounded-full bg-canvas px-4 py-2 text-sm text-ink/75 transition hover:bg-canvas/80"
                      onClick={() => {
                        if (referencePreviewUrl) {
                          URL.revokeObjectURL(referencePreviewUrl);
                        }

                        setReferenceFile(null);
                        setReferencePreviewUrl(null);
                        setReferenceImageSize(null);
                        setMaskDirty(false);
                        setToolMode("brush");
                        lastMaskPointRef.current = null;
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                {referencePreviewUrl ? (
                  <div className="mt-4 flex items-start gap-4">
                    <img
                      className="h-24 w-24 rounded-2xl object-cover"
                      src={referencePreviewUrl}
                      alt="Reference preview"
                    />
                    <div className="text-xs text-ink/65">
                      <p>{referenceFile?.name}</p>
                      <p className="mt-1">
                        `SDXL Base`, `SDXL Turbo`, `SDXL Lightning 4step`, `SDXL Lightning 4step UNet` и edit-only модели используют это изображение как основу.
                      </p>
                      <p className="mt-1">
                        Сейчас референс поддерживают `SDXL Base`, `SDXL Turbo`, `SDXL Lightning 4step` и `SDXL Lightning 4step UNet`.
                      </p>
                    </div>

                    <div className="mt-4 rounded-2xl border border-black/10 bg-white/70 p-3">
                      <p className="text-sm font-semibold">Prompt Templates</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {promptTemplates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            className="rounded-full bg-canvas px-3 py-1 text-xs uppercase tracking-[0.2em] text-ink/75 transition hover:bg-canvas/80"
                            onClick={() => setForm((current) => ({ ...current, prompt: template.text }))}
                          >
                            {template.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {referencePreviewUrl && selectedModelMeta?.configJson?.supportsInpaint ? (
                  <div className="rounded-[1.25rem] border border-black/10 bg-canvas/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Mask Editor</p>
                        <p className="mt-1 text-xs text-ink/60">
                          Закрась область, которую можно менять. Всё остальное модель постарается сохранить.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-full bg-canvas px-4 py-2 text-sm text-ink/75 transition hover:bg-canvas/80"
                        onClick={() => {
                          const canvas = maskCanvasRef.current;
                          if (!canvas) {
                            return;
                          }
                          const context = canvas.getContext("2d");
                          if (!context) {
                            return;
                          }
                          context.clearRect(0, 0, canvas.width, canvas.height);
                          setMaskDirty(false);
                          lastMaskPointRef.current = null;
                        }}
                      >
                        Clear mask
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] transition ${
                          toolMode === "brush" ? "bg-accent text-white" : "bg-canvas text-ink/75"
                        }`}
                        onClick={() => setToolMode("brush")}
                      >
                        Brush
                      </button>
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] transition ${
                          toolMode === "eraser" ? "bg-ink text-soft" : "bg-canvas text-ink/75"
                        }`}
                        onClick={() => setToolMode("eraser")}
                      >
                        Eraser
                      </button>
                    </div>

                    <label className="mt-4 block">
                      <span className="mb-2 block text-sm font-semibold">Brush</span>
                      <input
                        className="w-full accent-accent"
                        type="range"
                        min="12"
                        max="96"
                        step="2"
                        value={brushSize}
                        onChange={(event) => setBrushSize(Number(event.target.value))}
                      />
                    </label>

                    <div className="mt-3 rounded-2xl border border-black/10 bg-white/70 p-3">
                      <p className="text-sm font-semibold">Edit Presets</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {editPresets.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className="rounded-full bg-ink px-3 py-1 text-xs uppercase tracking-[0.2em] text-soft transition hover:opacity-90"
                            onClick={() => setForm((current) => ({ ...current, denoise: preset.denoise }))}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 space-y-2 text-xs text-ink/65">
                        {editPresets.map((preset) => (
                          <div key={`${preset.id}-hint`} className="rounded-2xl bg-canvas/80 px-3 py-2">
                            <strong className="mr-2 text-ink">{preset.label}:</strong>
                            {preset.description} `Strength {preset.denoise.toFixed(2)}`
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-black/10 bg-black/5">
                      <div className="relative">
                        <img
                          className="block w-full"
                          src={referencePreviewUrl}
                          alt="Reference editing preview"
                        />
                        <canvas
                          ref={maskCanvasRef}
                          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                          onPointerDown={(event) => {
                            isDrawingMaskRef.current = true;
                            lastMaskPointRef.current = null;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            drawMask(event);
                          }}
                          onPointerMove={(event) => {
                            if (isDrawingMaskRef.current) {
                              drawMask(event);
                            }
                          }}
                          onPointerUp={(event) => {
                            isDrawingMaskRef.current = false;
                            lastMaskPointRef.current = null;
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          }}
                          onPointerLeave={() => {
                            isDrawingMaskRef.current = false;
                            lastMaskPointRef.current = null;
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink/60">
                      <span>{maskDirty ? "Mask ready" : "No mask yet"}</span>
                      <span>Brush добавляет зону редактирования, Eraser убирает её обратно.</span>
                      {requiresMask ? <span>Для этой модели маска обязательна.</span> : null}
                      <span>Белым рисуешь область, которую можно менять</span>
                    </div>
                  </div>
                ) : null}

                {referenceFile ? (
                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm font-semibold">Strength</span>
                    <input
                      className="w-full accent-accent"
                      type="range"
                      min="0.1"
                      max="0.8"
                      step="0.05"
                      value={form.denoise}
                      onChange={(event) => setForm({ ...form, denoise: Number(event.target.value) })}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-ink/60">
                      <span>Closer to original</span>
                      <span>{form.denoise.toFixed(2)}</span>
                      <span>Stronger redraw</span>
                    </div>
                    <span className="mt-2 block text-xs text-ink/60">
                      Для задач вроде “добавь объект рядом” обычно лучше держать `0.20-0.35`.
                    </span>
                    <span className="mt-2 block text-xs text-ink/60">
                      Для точечной вставки объекта чаще всего лучше стартовать с `0.15-0.25`, а не с высоких значений.
                    </span>
                  </label>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Model</span>
                  <select
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
                    value={form.modelId}
                    onChange={(event) => handleModelChange(event.target.value)}
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}{formatModelSize(model)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Steps</span>
                  <input
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
                    type="number"
                    value={form.steps}
                    onChange={(event) => setForm({ ...form, steps: Number(event.target.value) })}
                  />
                  <span className="mt-2 block text-xs text-ink/60">
                    Сколько шагов делает модель. Больше шагов = медленнее, но обычно детальнее.
                  </span>
                </label>
              </div>

              <div className="rounded-[1.5rem] border border-black/10 bg-white/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Presets</span>
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="rounded-full bg-ink px-3 py-1 text-xs uppercase tracking-[0.2em] text-soft transition hover:opacity-90"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          ...preset.values
                        }))
                      }
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 text-xs text-ink/65 md:grid-cols-2">
                  {presets.map((preset) => (
                    <div key={`${preset.id}-hint`} className="rounded-2xl bg-canvas/80 px-3 py-2">
                      <strong className="mr-2 text-ink">{preset.label}:</strong>
                      {preset.description}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Width</span>
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" type="number" value={form.width} onChange={(event) => setForm({ ...form, width: Number(event.target.value) })} />
                  <span className="mt-2 block text-xs text-ink/60">
                    Ширина картинки. Больше размер = больше VRAM и времени.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Height</span>
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" type="number" value={form.height} onChange={(event) => setForm({ ...form, height: Number(event.target.value) })} />
                  <span className="mt-2 block text-xs text-ink/60">
                    Высота картинки. Для портретов обычно удобнее вертикальный формат.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">CFG</span>
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" type="number" value={form.cfg} onChange={(event) => setForm({ ...form, cfg: Number(event.target.value) })} />
                  <span className="mt-2 block text-xs text-ink/60">
                    Насколько строго модель слушается промпта. Слишком высокое значение может портить картинку.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Batch</span>
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" type="number" value={form.batchSize} onChange={(event) => setForm({ ...form, batchSize: Number(event.target.value) })} />
                  <span className="mt-2 block text-xs text-ink/60">
                    Сколько вариантов генерить за один запуск. Больше batch сильнее грузит видеокарту.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full rounded-full bg-accent px-6 py-4 text-lg font-semibold text-white transition hover:translate-y-[-1px] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting || !canSubmit}
              >
                {submitting ? "Отправляем задачу..." : "Generate"}
              </button>

              {isEditOnlyModel && (!referenceFile || !maskDirty) ? (
                <p className="text-sm text-ink/65">
                  Для `edit-only` модели сначала загрузи референс и нарисуй маску.
                </p>
              ) : null}

              {selectedModelMeta?.configJson?.promptLanguage === "en" ? (
                <p className="text-sm text-ink/65">
                  Russian prompts are translated to English automatically for this model.
                </p>
              ) : null}
            </form>
          </section>

          <section className="space-y-8">
            <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_50px_rgba(29,29,27,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-accent2">Queue</p>
                  <h2 className="font-display text-3xl">Последние задачи</h2>
                </div>
              </div>

              <div className="space-y-3">
                {jobs.map((job) => (
                  <div key={job.id} className="rounded-3xl border border-black/10 bg-canvas/70 p-4">
                    <div className="flex items-start gap-4">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white/70">
                        {job.previewImageUrl ? (
                          <button
                            type="button"
                            className="block h-full w-full"
                            onClick={() =>
                              setSelectedImage({
                                id: job.id,
                                imageUrl: job.previewImageUrl ?? "",
                                thumbnailUrl: job.previewImageUrl ?? null,
                                prompt: job.prompt,
                                seed: job.seed,
                                createdAt: job.createdAt,
                                startedAt: job.startedAt,
                                completedAt: job.completedAt,
                                generationDurationMs: job.generationDurationMs,
                                modelName: job.modelName
                              })
                            }
                          >
                            <img
                              className="h-full w-full object-cover"
                              src={`${apiUrl}${job.previewImageUrl}`}
                              alt={job.prompt}
                            />
                          </button>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-ink/35">
                            No image
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-4">
                          <strong className="line-clamp-2">{job.prompt}</strong>
                          <span className="shrink-0 rounded-full bg-ink px-3 py-1 text-xs uppercase tracking-[0.2em] text-soft">{job.status}</span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-ink/65">
                          <span>Model: {job.modelName ?? "Unknown"}</span>
                          <span>Progress: {job.progress}%</span>
                          <span>Seed: {job.seed ?? "auto"}</span>
                          <span>Queued: {formatDateTime(job.createdAt)}</span>
                          <span>Start: {formatDateTime(job.startedAt)}</span>
                          <span>Finish: {formatDateTime(job.completedAt)}</span>
                          <span>Duration: {formatDuration(job.generationDurationMs)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {renderPaginationControls(jobsPagination, setJobsPage, setJobsPageSize)}
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_50px_rgba(29,29,27,0.08)]">
              <div className="mb-4">
                <p className="text-sm uppercase tracking-[0.25em] text-accent2">Gallery</p>
                <h2 className="font-display text-3xl">Результаты</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {gallery.map((item) => (
                  <article
                    key={item.id}
                    className="cursor-pointer overflow-hidden rounded-[1.5rem] border border-black/10 bg-soft transition hover:translate-y-[-2px] hover:shadow-lg"
                    onClick={() => setSelectedImage(item)}
                  >
                    <img className="aspect-square w-full object-cover" src={`${apiUrl}${item.imageUrl}`} alt={item.prompt} />
                    <div className="space-y-2 p-4">
                      <p className="line-clamp-2 text-sm">{item.prompt}</p>
                      <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-ink/60">
                        <span>{item.modelName ?? "Unknown"}</span>
                        <span>Seed {item.seed ?? "auto"}</span>
                        <span>Queued {formatDateTime(item.createdAt)}</span>
                        <span>Start {formatDateTime(item.startedAt)}</span>
                        <span>Finish {formatDateTime(item.completedAt)}</span>
                        <span>Duration {formatDuration(item.generationDurationMs)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {renderPaginationControls(galleryPagination, setGalleryPage, setGalleryPageSize)}
            </div>
          </section>
        </main>
      </div>

      {selectedImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-4 py-8 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-h-full w-full max-w-6xl overflow-hidden rounded-[2rem] bg-black shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
              onClick={() => setSelectedImage(null)}
            >
              Close
            </button>

            <img
              className="max-h-[85vh] w-full object-contain bg-black"
              src={`${apiUrl}${selectedImage.imageUrl}`}
              alt={selectedImage.prompt}
            />

            <div className="space-y-2 bg-soft p-4">
              <p className="text-sm text-ink/80">{selectedImage.prompt}</p>
              <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-ink/60">
                <span>{selectedImage.modelName ?? "Unknown"}</span>
                <span>Seed {selectedImage.seed ?? "auto"}</span>
                <span>Queued {formatDateTime(selectedImage.createdAt)}</span>
                <span>Start {formatDateTime(selectedImage.startedAt)}</span>
                <span>Finish {formatDateTime(selectedImage.completedAt)}</span>
                <span>Duration {formatDuration(selectedImage.generationDurationMs)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
