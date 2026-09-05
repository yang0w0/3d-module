// Copy this file to config.local.js on each machine that needs API generation.
// Never share config.local.js or paste SecretKey into screenshots/docs.
window.TD_STUDIO_CONFIG = {
  tencentSecretId: "",
  tencentSecretKey: "",
  region: "ap-guangzhou",
  service: "ai3d",
  host: "ai3d.tencentcloudapi.com",
  version: "2025-05-13",
  localProvider: {
    apiPreset: "local-default",
    endpoint: "http://localhost:8000",
    submitPath: "/generate",
    taskPath: "/tasks/{taskId}",
    authHeaderName: "",
    authToken: "",
    authScheme: "Bearer",
    pollIntervalMs: 3000
  }
};
