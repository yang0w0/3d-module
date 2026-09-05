const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.env.TD_WORKBENCH_ROOT || path.join(__dirname, ".."));
const port = Number(process.env.TD_WORKBENCH_PORT || 5173);
const dataDir = path.join(root, "local-data");
const runtimeConfigFile = path.join(dataDir, "runtime-config.csv");
const historyFile = path.join(dataDir, "history.csv");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".stl": "model/stl",
  ".obj": "text/plain; charset=utf-8"
};

const CONFIG_HEADERS = ["key", "value"];
const HISTORY_HEADERS = ["savedAt", "provider", "jobId", "name", "glbUrl", "stlUrl", "source"];

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, limit = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function flattenConfig(value, prefix = "", rows = []) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    Object.keys(value).sort().forEach((key) => {
      const pathKey = prefix ? `${prefix}.${key}` : key;
      flattenConfig(value[key], pathKey, rows);
    });
    return rows;
  }
  rows.push([prefix, value == null ? "" : String(value)]);
  return rows;
}

function unflattenConfig(rows) {
  const config = {};
  rows.forEach(([key, value]) => {
    if (!key) return;
    const parts = key.split(".");
    let cursor = config;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        cursor[part] = value;
      } else {
        cursor[part] = cursor[part] || {};
        cursor = cursor[part];
      }
    });
  });
  return config;
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  return [CONFIG_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n") + "\n";
}

function rowsToCsv(headers, rows) {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n") + "\n";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function readRuntimeConfig() {
  if (!fs.existsSync(runtimeConfigFile)) return {};
  const rows = parseCsv(fs.readFileSync(runtimeConfigFile, "utf8"));
  const dataRows = rows[0]?.[0] === CONFIG_HEADERS[0] && rows[0]?.[1] === CONFIG_HEADERS[1]
    ? rows.slice(1)
    : rows;
  return unflattenConfig(dataRows);
}

function writeRuntimeConfig(config) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(runtimeConfigFile, toCsv(flattenConfig(config)), "utf8");
}

function normalizeHistoryItem(item) {
  return {
    savedAt: Number(item.savedAt) || Date.now(),
    provider: String(item.provider || ""),
    jobId: String(item.jobId || ""),
    name: String(item.name || ""),
    glbUrl: String(item.glbUrl || ""),
    stlUrl: String(item.stlUrl || ""),
    source: String(item.source || "")
  };
}

function readHistory() {
  if (!fs.existsSync(historyFile)) return [];
  const rows = parseCsv(fs.readFileSync(historyFile, "utf8"));
  const dataRows = rows[0]?.[0] === HISTORY_HEADERS[0] ? rows.slice(1) : rows;
  return dataRows
    .filter((row) => row.some(Boolean))
    .map((row) => normalizeHistoryItem(Object.fromEntries(HISTORY_HEADERS.map((key, index) => [key, row[index] || ""]))))
    .sort((left, right) => right.savedAt - left.savedAt)
    .slice(0, 20);
}

function writeHistory(history) {
  const normalized = Array.isArray(history) ? history.map(normalizeHistoryItem) : [];
  const rows = normalized
    .sort((left, right) => right.savedAt - left.savedAt)
    .slice(0, 20)
    .map((item) => HISTORY_HEADERS.map((key) => item[key] ?? ""));
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(historyFile, rowsToCsv(HISTORY_HEADERS, rows), "utf8");
}

function handleStoreRoute(req, res, urlPath, store) {
  if (urlPath !== `/api/${store.name}`) return false;
  (async () => {
    try {
      if (req.method === "GET") {
        sendJson(res, 200, { ok: true, exists: store.exists(), [store.responseKey]: store.read() });
        return;
      }
      if (req.method === "POST" || req.method === "PUT") {
        const body = await readBody(req);
        const payload = body ? JSON.parse(body) : {};
        store.write(payload[store.responseKey] ?? store.empty);
        sendJson(res, 200, { ok: true });
        return;
      }
      res.writeHead(405, { Allow: "GET, POST, PUT" });
      res.end("Method not allowed");
    } catch (error) {
      sendJson(res, 500, { ok: false, message: error.message });
    }
  })();
  return true;
}

http.createServer(async (req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (handleStoreRoute(req, res, urlPath, {
    name: "runtime-config",
    responseKey: "config",
    empty: {},
    exists: () => fs.existsSync(runtimeConfigFile),
    read: readRuntimeConfig,
    write: writeRuntimeConfig
  })) return;

  if (handleStoreRoute(req, res, urlPath, {
    name: "history",
    responseKey: "history",
    empty: [],
    exists: () => fs.existsSync(historyFile),
    read: readHistory,
    write: writeHistory
  })) return;

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`3D workbench running at http://127.0.0.1:${port}/`);
});
