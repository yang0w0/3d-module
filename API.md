# API —— 混元生3D 接入规则

> 数据来源：腾讯云官方接口面（2026-09 核实）。参考实现：`creative-workbench/server.js`（TC3 签名）。

## 1. 接口面（⚠️ 国内站与国际站是两套，别混）

| | 国内站（我们的账号） |
|---|---|
| 请求域名 | `ai3d.tencentcloudapi.com` |
| service（签名用） | `ai3d` |
| Version | `2025-05-13` |
| Region | `ap-guangzhou` |

报 `UnsupportedRegion` = 调错了接口面，不是 Region 参数问题。

## 2. 接口调用

**提交**：`SubmitHunyuanTo3DProJob` → 返回 `JobId`
- 输入三选一：`ImageBase64`（≤6MB，单边 128~5000）/ `ImageUrl` / `Prompt`
- `Model`: `"3.0"` | `"3.1"`（3.1 不支持 LowPoly/Sketch）
- `GenerateType`：
  - `Normal` 几何+纹理（25 积分）
  - **`Geometry` 白模（15 积分）← 打印默认用这个**
  - `LowPoly` 减面（30 积分）、`Sketch` 草图（25 积分）
- `FaceCount`：3000~1500000（默认 500000，打印 50000~150000 足够）
- `ResultFormat`：**选 STL**（打印直接可用）；默认返回 obj+glb 也会给

**查询**：`QueryHunyuanTo3DProJob {JobId}`
- `Status`: WAIT / RUN / FAIL / DONE
- DONE 后 `ResultFile3Ds[]` 里的 `Url` **仅 24h 有效** → 必须立即下载落盘
- 典型时延 1~3 分钟，轮询间隔 3~5s

**错误处理**
- 失败不扣积分；`ResourceInsufficient` = 积分用尽
- 失败自动重试 1 次；`NO_KEY` 类错误不重试
- 进程/页面刷新时把未完成任务标记为中断，提示重新提交

## 3. 计费与省积分规则

- 免费包：**100 积分/用户**，在 console.cloud.tencent.com/ai3d 资源包管理手动领取，1 年有效
- 单价：Normal 25 / **Geometry 15** / LowPoly 30 / Sketch 25；多视角 +10
- 资源包 1000 积分 = 100 元；后付费 0.12 元/积分；**默认不自动转后付费**
- **省积分三原则**（写进 UI 默认值）：
  1. 打印用途一律 `GenerateType=Geometry`（白模，省 40%）
  2. 试参数/试参考图 → 用混元官网（3d.hunyuan.tencent.com）每日免费额度，确认满意才走 API
  3. UI 上每次提交前显示本次预计消耗

## 4. 密钥安全规则（⚠️ 最高优先级）

- 用的是 CAM **SecretId/SecretKey**（API 密钥管理新建）；控制台的 sk- 开头 OpenAI KEY 是 TokenHub 专用，**不能**用于生3D
- 两条部署路线，二选一（开发时定）：

| 路线 | 密钥放哪 | 优点 | 缺点 |
|---|---|---|---|
| A. 纯静态 HTML | 密钥写在**本机独立配置文件**（如 `config.local.js`，进 .gitignore，绝不随 HTML 分发） | 零部署，多设备各配各的 | 分享文件前必须确认密钥文件不带出去 |
| B. 本地 Node 代理 | 密钥只放服务端 `.env`，页面 fetch `localhost` | 密钥永不进前端，最安全 | 每台设备要跑一个小服务 |

- **默认路线 A**（符合"多设备纯 HTML"约束），但签名逻辑和密钥读取必须隔离在 `hunyuan-client.js` 一个文件里，将来切路线 B 不动 UI
- 页面“设置”也提供自定义/本地 API 配置，可填写 `endpoint`、提交/查询路径、认证 Header 名和 API Key；适合接自己的代理服务或兼容第三方接口
- 签名：TC3-HMAC-SHA256，零依赖 Node/浏览器实现参考 `creative-workbench/server.js`
- 任何文档、截图、提交记录中**不得出现** SecretKey 明文
