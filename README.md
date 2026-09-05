# 3d-module —— 3D 生成与打印功能模块

> 状态：**原型阶段（独立工作台已搭建，支持双击 standalone.html 使用；API 可在设置页或本机 config.local.js 填写后联调）**
> 目标：做一个"从生成 3D 模型到导出可打印 STL"的全流程 HTML 工作台模块，
> 第一阶段独立运行，第二阶段作为附加功能挂载到其他 HTML 工作台上。

---

## 这个文件夹是干什么的

存放该功能模块的**全部规则、规格、说明和交接文档**。写代码之前先读这里的文档；改代码必须同步更新这里的文档。

## 给别人使用的打开方式

最简单：把 `standalone.html` 发给对方，让对方双击打开。也可以发整个文件夹；如果误双击 `index.html`，页面会在 `file://` 模式下自动跳到 `standalone.html`。

`standalone.html` 不写任何电脑上的绝对路径，样式和工作台代码已经内联在这个 HTML 里。它会把配置和生成历史保存在当前浏览器里，不需要 Node.js、本地服务器或 Python。这个模式需要能访问 Three.js CDN，适合普通预览、上传本地 GLB/STL/OBJ、生成浮雕卡牌和导出 STL。

需要把配置/历史同步保存到 `local-data/*.csv`，或者需要加载本机开源生成服务时，再运行 `start-workbench.cmd`。这仍然只是在本机启动 `http://127.0.0.1`，不是发布到互联网。

分享文件夹时不要带上 `config.local.js`、`local-data/`、生成出的 `.glb/.stl/.obj` 和本地模型服务输出目录。

## 目录结构

```
3d-module/
├── README.md          ← 本文件：总览与阅读顺序
├── SPEC.md            ← 模块需求与架构规格（做什么、长什么样、怎么分层）
├── API.md             ← 混元3D API 接入规则（接口、签名、计费、密钥管理）
├── PIPELINE.md        ← 生成→修复→转STL→打印 的技术管线说明
├── INTEGRATION.md     ← 第二阶段：如何挂载到其他 HTML 工作台（对接契约）
├── TODO.md            ← 开发任务清单（按顺序执行）
├── LOCAL_PROVIDER.md  ← 自定义/本地模型服务接口契约
├── index.html         ← 独立工作台入口，也支持 ?mode=panel
├── standalone.html    ← 可双击打开的单文件使用版
├── config.example.js  ← 本机密钥配置模板
├── local-providers/   ← 本地生成服务包装示例（TripoSR 等）
└── src/               ← UI、生成服务适配、网格处理、存储模块
```

## 阅读顺序

1. `SPEC.md` —— 先明确要做什么
2. `API.md` —— 生成能力从哪来、花多少钱、密钥怎么管
3. `PIPELINE.md` —— 浏览器端转化/打印的技术方案
4. `INTEGRATION.md` —— 可移植性怎么设计（必须在第一阶段就预留）
5. `TODO.md` —— 动手时的执行清单

如需接入 TripoSR / InstantMesh / Hunyuan3D / TRELLIS 等本地开源生成模型，或接入需要 API Key 的自定义生成接口，阅读 `LOCAL_PROVIDER.md`。
TripoSR 本地包装服务已放在 `local-providers/triposr/`，可直接作为 `http://localhost:8000` 的生成源。

## 核心设计约束（不可违背）

| 约束 | 原因 |
|---|---|
| **纯 HTML/JS 实现，多设备可用** | 用户会在不同设备打开，不能依赖本机 N 卡 / Python 环境 |
| **模块自包含** | 第二阶段要嵌入另一个工作台，不能写死成孤立页面 |
| **密钥安全** | 腾讯云 SecretKey 绝不能出现在会分享出去的文件里，规则见 API.md |
| **免费优先** | 优先吃 TokenHub 免费积分 + 只出白模省积分，计费规则见 API.md |
| **输出目标 = 3D 打印** | 打印只吃几何不吃贴图，默认 GenerateType=Geometry（白模）省一半积分 |

## 与其他文件夹的关系

- `3d-assets/` —— 早期的试验工具页（3d-print-workbench.html）和资产目录约定（raw/stl），本模块完成后**由本模块取代**，但 raw/stl 目录约定继续沿用
- `creative-workbench/` —— 里面有 TC3 签名的 Node 参考实现 `server.js`，写签名时直接参考
