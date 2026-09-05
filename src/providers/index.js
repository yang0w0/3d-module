import {
  getGenerationCost,
  hasApiKeys,
  pollHunyuanJob,
  submitHunyuanJob
} from "../hunyuan-client.js";
import {
  hasLocalProvider,
  pollLocalGeneration,
  submitLocalGeneration
} from "./local-provider.js";

export const PROVIDERS = [
  {
    id: "hunyuan",
    label: "混元 API",
    costLabel: (generateType) => `${getGenerationCost(generateType)} 积分`,
    isConfigured: hasApiKeys,
    submit: async ({ imageDataUrl, options }) => {
      const result = await submitHunyuanJob({
        imageBase64: imageDataUrl,
        model: options.model,
        generateType: options.generateType,
        faceCount: options.faceCount
      });
      return { taskId: result.JobId, raw: result };
    },
    poll: async (taskId, onProgress) => {
      const done = await pollHunyuanJob(taskId, onProgress);
      const files = done.ResultFile3Ds || [];
      const glb = files.find((file) => String(file.Type).toLowerCase() === "glb") || files[0];
      const stl = files.find((file) => String(file.Type).toLowerCase() === "stl");
      return {
        status: done.Status,
        glbUrl: glb?.Url || "",
        stlUrl: stl?.Url || "",
        error: done.ErrorMessage || "",
        raw: done
      };
    }
  },
  {
    id: "local",
    label: "自定义/本地 API",
    costLabel: () => "按你的接口计费或本地算力",
    isConfigured: hasLocalProvider,
    submit: submitLocalGeneration,
    poll: pollLocalGeneration
  }
];

export function getProvider(id) {
  return PROVIDERS.find((provider) => provider.id === id) || PROVIDERS[0];
}
