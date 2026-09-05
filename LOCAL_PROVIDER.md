# LOCAL_PROVIDER —— 自定义/本地生成服务接口

工作台已经预留“自定义/本地 API”生成源。你可以在本机、局域网电脑、Colab 或云 GPU 上跑 TripoSR、InstantMesh、Hunyuan3D、TRELLIS 等模型，也可以接入其他兼容 HTTP API，只要外面包一层接口即可。

本仓库已内置一个 TripoSR 包装服务示例：`local-providers/triposr/`。它会把工作台的 `POST /generate` 请求转成 TripoSR 的 `run.py --model-save-format glb` 调用，并通过 `GET /tasks/{taskId}` 返回 GLB 下载地址。

如果目标是“打印整张卡牌”，不建议使用 TripoSR 这类单图重建模型。工作台的“卡牌浮雕打印”会在浏览器本地把图片转成高度图，生成一块带边框、带明暗浮雕的可打印 STL；这条路线不调用外部 API，也不消耗本地 AI 算力。

## 默认地址

```text
POST http://localhost:8000/generate
GET  http://localhost:8000/tasks/{taskId}
```

可在 `config.local.js` 里改：

```js
window.TD_STUDIO_CONFIG = {
  localProvider: {
    endpoint: "http://localhost:8000",
    submitPath: "/generate",
    taskPath: "/tasks/{taskId}",
    authHeaderName: "",
    authToken: "",
    authScheme: "Bearer"
  }
};
```

也可以在页面“设置”里填写，这些值会保存到当前浏览器的 `localStorage`。

## 接入带密钥的 API

如果你的接口使用 Bearer Token：

```js
window.TD_STUDIO_CONFIG = {
  localProvider: {
    endpoint: "https://api.example.com",
    submitPath: "/v1/generate-3d",
    taskPath: "/v1/tasks/{taskId}",
    authHeaderName: "Authorization",
    authToken: "你的 API Key",
    authScheme: "Bearer"
  }
};
```

请求会自动带上：

```text
Authorization: Bearer 你的 API Key
```

如果你的接口使用 `X-API-Key`：

```js
window.TD_STUDIO_CONFIG = {
  localProvider: {
    endpoint: "https://api.example.com",
    submitPath: "/generate",
    taskPath: "/tasks/{taskId}",
    authHeaderName: "X-API-Key",
    authToken: "你的 API Key",
    authScheme: ""
  }
};
```

请求会自动带上：

```text
X-API-Key: 你的 API Key
```

## 提交生成

`POST /generate` 使用 `multipart/form-data`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `image` | File | 参考图 |
| `options` | JSON string | `{source,targetFormats,model,generateType,faceCount}` |

最小返回：

```json
{
  "taskId": "task_abc123"
}
```

如果你的后端是同步生成，也可以直接返回结果：

```json
{
  "taskId": "task_abc123",
  "status": "success",
  "glbUrl": "http://localhost:8000/outputs/task_abc123.glb",
  "stlUrl": "http://localhost:8000/outputs/task_abc123.stl"
}
```

## 查询任务

`GET /tasks/{taskId}` 返回：

```json
{
  "taskId": "task_abc123",
  "status": "running",
  "progress": 45
}
```

完成时：

```json
{
  "taskId": "task_abc123",
  "status": "success",
  "progress": 100,
  "glbUrl": "http://localhost:8000/outputs/task_abc123.glb",
  "stlUrl": "http://localhost:8000/outputs/task_abc123.stl"
}
```

失败时：

```json
{
  "taskId": "task_abc123",
  "status": "failed",
  "error": "CUDA out of memory"
}
```

## CORS

如果工作台从 `http://localhost:8765` 打开，生成服务需要允许跨域：

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Authorization, X-API-Key, Content-Type
```

后端最少支持 `POST /generate`、`GET /tasks/{taskId}` 和模型文件下载即可。
