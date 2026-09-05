# TODO —— 开发任务清单

> 按顺序执行。每完成一项打勾并注明日期。开工前先读 README.md → SPEC.md → API.md → PIPELINE.md → INTEGRATION.md。

## 第一阶段：独立工作台（当前阶段）

- [ ] T1 生成服务层 `src/hunyuan-client.js`
  - TC3-HMAC-SHA256 浏览器端签名（参考 creative-workbench/server.js）
  - SubmitHunyuanTo3DProJob / QueryHunyuanTo3DProJob 封装、轮询、失败重试 1 次
  - 密钥从 `config.local.js` 读取（该文件进 .gitignore，提供 `config.example.js` 模板）
- [ ] T2 生成面板
  - 图片上传（≤6MB 校验）、参数表单（默认 GenerateType=Geometry 白模、FaceCount=100000、ResultFormat=STL+GLB）
  - 任务进度轮询 UI、提交前积分消耗提示、生成历史（localStorage，自动下载落盘 GLB/STL）
  - 备用入口卡片：混元官网每日免费额度（3d.hunyuan.tencent.com）
- [ ] T3 预览面板
  - three.js importmap 接入、GLB/OBJ/STL 拖入加载、轨道控制、线框切换
- [ ] T4 修复面板
  - manifold3d WASM 加载（首次联网缓存）、水密检测、一键 Make Manifold、前后对比
- [ ] T5 导出面板
  - 目标尺寸输入 → 等比换算 → 二进制 STL 导出、导出前水密/尺寸校验
- [ ] T6 设置面板
  - 密钥配置引导（含安全警告文案）、积分余额显示
- [ ] T7 外壳与面板模式
  - `index.html` 独立模式 + `?mode=panel` 紧凑模式
- [ ] T8 自查 INTEGRATION.md 第 3 节的 6 条可移植性硬约束
- [ ] T9 用真实参考图跑通全流程（生成→修复→导出 STL），在 3d-assets/raw、stl 留样例

## 第二阶段：挂载到目标工作台（等用户提供目标工作台后启动）

- [ ] T10 确认宿主工作台与嵌入方式（iframe 或 Web Component）
- [ ] T11 postMessage 协议联调（td:ready / td:generated / td:exported / td:error）
- [ ] T12 主题适配（td:setTheme）
- [ ] T13 在宿主工作台文档中登记该附加功能的使用说明

## 备选/将来

- [ ] 密钥路线 B：本地 Node 代理（`server.js` 复用 creative-workbench 实现），密钥彻底不进前端
- [ ] Colab 免费云 GPU 跑 TRELLIS.2 作为第二生成源（接入 hunyuan-client 同款适配层接口）
- [ ] 多视角输入（正面/侧面/背面）提升生成质量（+10 积分/次）

## 使用记录

- 2026-09-05：文件夹与文档创建完成，代码未开工。
- 2026-09-05：完成独立工作台原型：`index.html`、配置模板、UI 面板、three.js 预览、拖拽加载、基础水密检测、尺寸缩放、STL 导出、localStorage 历史、混元 API 浏览器端适配骨架。manifold3d WASM 和真实 API 生成仍需后续联调。
- 2026-09-05：新增生成源 provider 接口与本地开源服务协议：工作台可在“混元 API / 本地开源服务”之间切换，本地服务默认对接 `POST /generate` 与 `GET /tasks/{taskId}`，用于后续挂 TripoSR、InstantMesh、Hunyuan3D 或 TRELLIS。
