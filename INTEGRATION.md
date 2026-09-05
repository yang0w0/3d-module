# INTEGRATION —— 挂载到其他 HTML 工作台的对接契约

> 本文档定义第二阶段的"附加功能"挂载方式。第一阶段开发时必须遵守这里的约束，避免返工。

## 1. 挂载方式（按优先级）

### 方式 A：iframe 嵌入（首选，零耦合）

宿主工作台加一段：

```html
<iframe src="../3d-module/index.html?mode=panel" width="100%" height="720"
        style="border:0"></iframe>
```

- 模块检测 URL 参数 `mode=panel` 时隐藏独立页的外壳（大标题、独立导航），只渲染紧凑面板
- **优点**：样式/JS 完全隔离，宿主怎么改都不影响模块，反过来也一样
- 同源（同一磁盘目录/同一域名）下可用 `postMessage` 双向通信

### 方式 B：Web Component 挂载（备选，深度集成）

核心功能封装为 `<td-studio>` 自定义元素，宿主引入一个 JS 文件即可：

```html
<script src="../3d-module/td-studio.js"></script>
<td-studio theme="dark" height="720"></td-studio>
```

- 优点：视觉上无缝融入宿主；缺点：three.js 等依赖的加载需处理冲突，集成成本高
- **只有宿主明确要求"不要 iframe"时才做 B**

## 2. postMessage 通信协议（方式 A 用）

模块对外暴露的事件（子 → 宿主）：

| 消息 | payload | 说明 |
|---|---|---|
| `td:ready` | `{version}` | 模块加载完成 |
| `td:generated` | `{jobId, glbName, stlName}` | 一次生成完成 |
| `td:exported` | `{stlName, sizeMM}` | STL 已导出 |
| `td:error` | `{code, message}` | 任何不可恢复错误 |

宿主 → 模块的消息：

| 消息 | payload | 说明 |
|---|---|---|
| `td:setTheme` | `{dark: true/false}` | 跟随宿主主题 |
| `td:loadFile` | `{file: File}` | 宿主直接投喂一个模型文件 |

## 3. 可移植性硬约束（第一阶段开发时的自查清单）

- [ ] 所有依赖用 CDN + importmap 明确声明，不用宿主的全局变量
- [ ] CSS 全部限定在模块根类名 / shadow DOM 下，不污染宿主
- [ ] localStorage 键名加 `td-studio:` 前缀，避免和宿主冲突
- [ ] 密钥配置文件相对路径引用，整个文件夹拷走即可在别的机器用
- [ ] 不写死任何绝对路径；文件夹可整体挪动/改名
- [ ] 面板模式（`?mode=panel`）与独立模式共用核心代码，只换外壳

## 4. 交付物形态

```
3d-module/            ← 整个文件夹就是一个可搬运的包
├── index.html        独立工作台入口（= 宿主 iframe 的 src）
├── td-studio.js      （可选，方式 B 时提供）
├── src/*.js          核心逻辑
└── docs/*.md         本套文档
```

移动到任何位置 / 拷贝到任何设备，只要浏览器能打开 HTML 就能用。
