# PIPELINE —— 生成到打印的技术管线

> 全流程纯浏览器完成，不需要显卡、不需要 Python、不需要 Blender。

## 总流程

```
参考图 → [P1] 混元API生成 GLB+STL → [P2] three.js 预览
       → [P3] 水密检测/修复 → [P4] 定尺寸导出 STL → 切片打印
```

## 分段技术选型

### 生成段（云端）
- 混元 API 直接请求 `ResultFormat=STL` 拿到打印用文件，同时保留 GLB 做预览
- API 积分耗尽时：备用入口跳混元官网（每日免费额度），下载 GLB 拖回本模块

### 预览段（浏览器）
- three.js（CDN importmap 方式，参考 `3d-assets/3d-print-workbench.html` 现有实现）
- 支持 GLB / OBJ / STL 拖入

### 修复段（浏览器，关键难点）
- 引擎：**manifold3d 的 WASM 版**（manifoldcad.org 同款，纯浏览器可跑，约 2MB 首次加载后可缓存）
- 能力：水密检测、补洞、Make Manifold（去非流形/自交）、布尔运算
- 兜底策略：manifold 修不动的文件，提示导出后用 Blender（3D Print Toolbox → Make Manifold）手动处理——脚本与 Blender 是互补不是二选一

### 导出段（浏览器）
- STLExporter（three.js 生态）输出**二进制 STL**
- 缩放逻辑：AI 模型单位不定，以包围盒最长边为基准，用户输入目标 mm 数，等比换算
- 导出前校验：水密 ✅ / 尺寸 ≥ 打印机最小可打印细节（FDM 0.4mm）/ 体积估算

## 打印知识备忘（写进 UI 提示）

| 事项 | 规则 |
|---|---|
| 打印机只认 STL | GLB/OBJ 必须转换 |
| 模型必须水密 | 有孔洞直接打印会破 |
| AI 模型是空壳 | 壁厚不足需加厚（manifold 偏移实体化或 Blender Solidify） |
| FDM 细节极限 | 0.4mm 以下细节打不出，手办级精度需光固化或外发代打 |
| 面数 | 打印 5~15 万面足够，API 的 FaceCount 别拉满（费积分且文件大） |

## 目录约定（沿用 3d-assets/）

```
3d-assets/
├── raw/    生成端产出的 GLB/OBJ（原始件）
└── stl/    修复+定尺寸后的可打印 STL（成品）
```

浏览器本地文件无法自动写入磁盘目录，采用"下载到指定文件夹"的操作约定；若将来走本地 Node 代理（API.md 路线 B），可升级为服务端自动归档。
