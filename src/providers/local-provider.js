const DEFAULT_LOCAL = {
  endpoint: "http://localhost:8000",
  submitPath: "/generate",
  taskPath: "/tasks/{taskId}",
  authHeaderName: "",
  authToken: "",
  authScheme: "Bearer",
  pollIntervalMs: 3000,
  timeoutMs: 30 * 60 * 1000
};

const finished = new Map();

export function getLocalProviderConfig() {
  const config = { ...(window.TD_STUDIO_CONFIG || {}), ...readLocalBrowserConfig() };
  return { ...DEFAULT_LOCAL, ...(config.localProvider || {}) };
}

export function hasLocalProvider() {
  return Boolean(getLocalProviderConfig().endpoint);
}

export async function submitLocalGeneration({ imageDataUrl, imageName, options }) {
  const cfg = getLocalProviderConfig();
  const form = new FormData();
  form.append("image", dataUrlToBlob(imageDataUrl), imageName || "reference.png");
  form.append("options", JSON.stringify({
    source: "td-studio",
    targetFormats: ["glb", "stl"],
    model: options.model,
    generateType: options.generateType,
    faceCount: Number(options.faceCount) || 100000
  }));

  const response = await fetch(joinUrl(cfg.endpoint, cfg.submitPath), {
    method: "POST",
    headers: authHeaders(cfg),
    body: form
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data.message || data.error || `本地服务提交失败：HTTP ${response.status}`);

  const taskId = data.taskId || data.task_id || data.id || data.jobId || data.job_id;
  if (!taskId) throw new Error("本地服务没有返回 taskId。");
  const normalized = normalizeLocalTask(data);
  if (normalized.status === "DONE") finished.set(taskId, normalized);
  return { taskId, raw: data };
}

export async function queryLocalGeneration(taskId) {
  const cfg = getLocalProviderConfig();
  if (finished.has(taskId)) return finished.get(taskId);
  const path = cfg.taskPath.replace("{taskId}", encodeURIComponent(taskId));
  const response = await fetch(joinUrl(cfg.endpoint, path), {
    headers: authHeaders(cfg)
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data.message || data.error || `本地服务查询失败：HTTP ${response.status}`);
  return normalizeLocalTask(data);
}

export async function pollLocalGeneration(taskId, onProgress) {
  const cfg = getLocalProviderConfig();
  const started = Date.now();
  while (Date.now() - started < cfg.timeoutMs) {
    const result = await queryLocalGeneration(taskId);
    onProgress?.(result);
    if (result.status === "DONE" || result.status === "FAIL") return result;
    await sleepLocal(cfg.pollIntervalMs);
  }
  throw new Error("本地开源生成等待超时，请检查 localhost 服务是否仍在运行。");
}

function normalizeLocalTask(data) {
  const body = data.data || data.task || data;
  const statusText = String(body.status || body.state || data.status || "").toLowerCase();
  const output = body.output || body.result || data.output || {};
  const glbUrl = body.glbUrl || body.glb_url || body.modelUrl || body.model_url || output.glbUrl || output.glb_url || output.modelUrl || output.model_url || output.model_url_glb || "";
  const stlUrl = body.stlUrl || body.stl_url || output.stlUrl || output.stl_url || output.model_url_stl || "";
  const error = body.error || body.message || data.error || data.message || "";

  let status = "RUN";
  if (["queued", "pending", "wait", "waiting"].includes(statusText)) status = "WAIT";
  if (["success", "succeeded", "done", "completed", "complete", "finished"].includes(statusText) || glbUrl || stlUrl) status = "DONE";
  if (["fail", "failed", "error", "cancelled", "canceled"].includes(statusText)) status = "FAIL";

  return {
    Status: status,
    status,
    progress: Number(body.progress ?? data.progress ?? 0),
    glbUrl: absolutize(glbUrl),
    stlUrl: absolutize(stlUrl),
    error,
    raw: data
  };
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(meta)?.[1] || "image/png";
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function joinUrl(base, path) {
  return `${String(base).replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

function authHeaders(cfg) {
  if (!cfg.authHeaderName || !cfg.authToken) return {};
  const scheme = String(cfg.authScheme || "").trim();
  const token = String(cfg.authToken).trim();
  return {
    [cfg.authHeaderName.trim()]: scheme ? `${scheme} ${token}` : token
  };
}

function absolutize(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("blob:")) return url;
  const cfg = getLocalProviderConfig();
  return joinUrl(cfg.endpoint, url);
}

function sleepLocal(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLocalBrowserConfig() {
  try {
    return JSON.parse(localStorage.getItem("td-studio:runtimeConfig") || "{}");
  } catch {
    return {};
  }
}
