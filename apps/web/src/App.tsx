import { FormEvent, useEffect, useState } from "react";

type Model = {
  id: string;
  name: string;
  type: string;
  configJson: {
    checkpoint?: string;
    sizeGb?: number;
    baseCheckpointSizeGb?: number;
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

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const pageSizeOptions = [3, 5, 10];

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

export function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [selectedModelMeta, setSelectedModelMeta] = useState<Model | null>(null);
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsPageSize, setJobsPageSize] = useState(5);
  const [jobsPagination, setJobsPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 5,
    totalItems: 0,
    totalPages: 1
  });
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryPageSize, setGalleryPageSize] = useState(5);
  const [galleryPagination, setGalleryPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 5,
    totalItems: 0,
    totalPages: 1
  });
  const [form, setForm] = useState({
    prompt: "",
    negativePrompt: "",
    modelId: "",
    width: 1024,
    height: 1024,
    steps: 30,
    cfg: 7,
    batchSize: 1
  });
  const [submitting, setSubmitting] = useState(false);

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

    if (!form.modelId && nextModels[0]) {
      setSelectedModelMeta(nextModels[0]);
      setForm((current) => ({
        ...current,
        modelId: nextModels[0].id,
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
      await fetch(`${apiUrl}/api/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(form)
      });
      setForm((current) => ({ ...current, prompt: "", negativePrompt: "" }));
      await loadData();
    } finally {
      setSubmitting(false);
    }
  }

  function handleModelChange(modelId: string) {
    const nextModel = models.find((model) => model.id === modelId) ?? null;
    setSelectedModelMeta(nextModel);
    setForm((current) => ({
      ...current,
      modelId,
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
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Width</span>
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" type="number" value={form.width} onChange={(event) => setForm({ ...form, width: Number(event.target.value) })} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Height</span>
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" type="number" value={form.height} onChange={(event) => setForm({ ...form, height: Number(event.target.value) })} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">CFG</span>
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" type="number" value={form.cfg} onChange={(event) => setForm({ ...form, cfg: Number(event.target.value) })} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Batch</span>
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3" type="number" value={form.batchSize} onChange={(event) => setForm({ ...form, batchSize: Number(event.target.value) })} />
                </label>
              </div>

              <button
                type="submit"
                className="w-full rounded-full bg-accent px-6 py-4 text-lg font-semibold text-white transition hover:translate-y-[-1px] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting || !form.modelId}
              >
                {submitting ? "Отправляем задачу..." : "Generate"}
              </button>

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
