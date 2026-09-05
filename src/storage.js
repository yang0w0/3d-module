const PREFIX = "td-studio:";
const HAS_LOCAL_SERVER = location.protocol === "http:" || location.protocol === "https:";

export function readSetting(key, fallback = null) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function writeSetting(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

async function readServerData(path, key) {
  if (!HAS_LOCAL_SERVER) return null;
  try {
    const response = await fetch(`./api/${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      exists: Boolean(data.exists),
      value: data[key]
    };
  } catch {
    return null;
  }
}

async function writeServerData(path, key, value) {
  if (!HAS_LOCAL_SERVER) return false;
  const response = await fetch(`./api/${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ [key]: value })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `本机缓存保存失败：HTTP ${response.status}`);
  }
  return true;
}

function hasStoredValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value != null && value !== "";
}

export async function readRuntimeConfig(fallback = {}) {
  const browserConfig = readSetting("runtimeConfig", fallback);
  const serverData = await readServerData("runtime-config", "config");
  if (serverData != null) {
    const serverConfig = serverData.value || {};
    if (!serverData.exists && !hasStoredValue(serverConfig) && hasStoredValue(browserConfig)) {
      await writeServerData("runtime-config", "config", browserConfig).catch(() => {});
      return browserConfig;
    }
    writeSetting("runtimeConfig", serverConfig);
    return serverConfig;
  }
  return browserConfig;
}

export async function writeRuntimeConfig(config) {
  writeSetting("runtimeConfig", config);
  return writeServerData("runtime-config", "config", config);
}

export async function readHistory() {
  const browserHistory = readSetting("history", []);
  const serverData = await readServerData("history", "history");
  if (serverData != null) {
    const serverHistory = Array.isArray(serverData.value) ? serverData.value : [];
    if (!serverData.exists && !hasStoredValue(serverHistory) && hasStoredValue(browserHistory)) {
      await writeServerData("history", "history", browserHistory).catch(() => {});
      return browserHistory;
    }
    writeSetting("history", serverHistory);
    return serverHistory;
  }
  return browserHistory;
}

export async function addHistory(item) {
  const history = await readHistory();
  const nextHistory = [{ ...item, savedAt: Date.now() }, ...history].slice(0, 20);
  writeSetting("history", nextHistory);
  await writeServerData("history", "history", nextHistory).catch(() => {});
  return nextHistory;
}

export async function clearHistory() {
  writeSetting("history", []);
  await writeServerData("history", "history", []).catch(() => {});
}
