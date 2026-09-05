const DEFAULT_CONFIG = {
  region: "ap-guangzhou",
  service: "ai3d",
  host: "ai3d.tencentcloudapi.com",
  version: "2025-05-13"
};

const COSTS = {
  Normal: 25,
  Geometry: 15,
  LowPoly: 30,
  Sketch: 25
};

export function getHunyuanConfig() {
  return { ...DEFAULT_CONFIG, ...(window.TD_STUDIO_CONFIG || {}), ...readBrowserConfig() };
}

export function getGenerationCost(generateType) {
  return COSTS[generateType] || COSTS.Geometry;
}

export function hasApiKeys() {
  const cfg = getHunyuanConfig();
  return Boolean(cfg.tencentSecretId && cfg.tencentSecretKey);
}

export async function submitHunyuanJob({ imageBase64, model, generateType, faceCount }) {
  const cfg = getHunyuanConfig();
  if (!hasApiKeys()) {
    const error = new Error("未配置混元 API 密钥。请在设置里填写 SecretId 和 SecretKey 后再提交。");
    error.code = "NO_KEY";
    throw error;
  }

  const payload = {
    ImageBase64: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
    Model: model,
    GenerateType: generateType,
    FaceCount: Number(faceCount) || 100000,
    ResultFormat: "STL"
  };

  return tc3Fetch(cfg, "SubmitHunyuanTo3DProJob", payload);
}

export async function queryHunyuanJob(jobId) {
  const cfg = getHunyuanConfig();
  return tc3Fetch(cfg, "QueryHunyuanTo3DProJob", { JobId: jobId });
}

export async function pollHunyuanJob(jobId, onProgress) {
  const started = Date.now();
  while (Date.now() - started < 15 * 60 * 1000) {
    await sleep(4000);
    const response = await queryHunyuanJob(jobId);
    onProgress?.(response);
    if (response.Status === "DONE" || response.Status === "FAIL") return response;
  }
  throw new Error("生成等待超时，请稍后在腾讯云控制台确认任务状态。");
}

async function tc3Fetch(cfg, action, payloadObject) {
  const payload = JSON.stringify(payloadObject);
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = [
    "content-type:application/json; charset=utf-8",
    `host:${cfg.host}`,
    `x-tc-action:${action.toLowerCase()}`,
    ""
  ].join("\n");
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    await sha256Hex(payload)
  ].join("\n");
  const credentialScope = `${date}/${cfg.service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join("\n");
  const kDate = await hmac(`TC3${cfg.tencentSecretKey}`, date);
  const kService = await hmac(kDate, cfg.service);
  const kSigning = await hmac(kService, "tc3_request");
  const signature = await hmacHex(kSigning, stringToSign);
  const authorization = [
    `TC3-HMAC-SHA256 Credential=${cfg.tencentSecretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(", ");

  const response = await fetch(`https://${cfg.host}/`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      "X-TC-Action": action,
      "X-TC-Version": cfg.version,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": cfg.region
    },
    body: payload
  });
  const data = await response.json().catch(() => ({}));
  const result = data.Response || {};
  if (result.Error) {
    const error = new Error(`${result.Error.Code}: ${result.Error.Message}`);
    error.code = result.Error.Code;
    throw error;
  }
  return result;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(hash);
}

async function hmac(key, value) {
  const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

async function hmacHex(key, value) {
  return toHex(await hmac(key, value));
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBrowserConfig() {
  try {
    return JSON.parse(localStorage.getItem("td-studio:runtimeConfig") || "{}");
  } catch {
    return {};
  }
}
