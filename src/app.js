import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { addHistory, clearHistory, readHistory } from "./storage.js";
import { readRuntimeConfig, writeRuntimeConfig } from "./storage.js";
import { getProvider } from "./providers/index.js";
import {
  centerObject,
  cleanGeometry,
  createCardReliefMesh,
  exportBinaryStl,
  getMeshStats,
  inspectWatertight,
  scaleObjectToSize
} from "./mesh-tools.js";

const state = {
  referenceImage: null,
  referenceName: "",
  modelObject: null,
  modelName: "",
  wireframe: false
};
const LOCAL_API_PRESETS = {
  "local-default": {
    label: "通用本地生成服务",
    hint: "适合你自己写的 FastAPI/Flask 服务。通常只需要确认服务地址，提交和查询路径会自动套用本工作台协议。",
    endpoint: "http://localhost:8000",
    submitPath: "/generate",
    taskPath: "/tasks/{taskId}",
    authHeaderName: "",
    authScheme: "Bearer",
    visibleFields: ["endpoint"]
  },
  "hunyuan3d-local": {
    label: "本地 Hunyuan3D 包装服务",
    hint: "适合把开源 Hunyuan3D 模型包成 HTTP 服务。默认按本工作台的生成协议提交图片和轮询任务。",
    endpoint: "http://localhost:8000",
    submitPath: "/generate",
    taskPath: "/tasks/{taskId}",
    authHeaderName: "",
    authScheme: "Bearer",
    visibleFields: ["endpoint"]
  },
  "comfyui-proxy": {
    label: "ComfyUI 包装代理",
    hint: "浏览器不能直接按本工作台格式调用原生 ComfyUI 队列接口，建议用一个小代理转换图片、工作流和结果地址。",
    endpoint: "http://localhost:8000",
    submitPath: "/generate",
    taskPath: "/tasks/{taskId}",
    authHeaderName: "",
    authScheme: "Bearer",
    visibleFields: ["endpoint"]
  },
  "sd-webui-proxy": {
    label: "SD WebUI / TripoSR 包装代理",
    hint: "适合把 SD WebUI、TripoSR 或 InstantMesh 包成统一接口。一般只需要服务地址，路径由代理负责。",
    endpoint: "http://localhost:8000",
    submitPath: "/generate",
    taskPath: "/tasks/{taskId}",
    authHeaderName: "",
    authScheme: "Bearer",
    visibleFields: ["endpoint"]
  },
  "openai-compatible": {
    label: "OpenAI 兼容 3D 代理",
    hint: "适合云端或局域网代理，通常需要服务地址和 API Key。接口路径可按服务文档调整。",
    endpoint: "https://api.example.com",
    submitPath: "/v1/generate-3d",
    taskPath: "/v1/tasks/{taskId}",
    authHeaderName: "Authorization",
    authScheme: "Bearer",
    visibleFields: ["endpoint", "submitPath", "taskPath", "authHeaderName", "authToken", "authScheme"]
  },
  custom: {
    label: "完全自定义 HTTP 接口",
    hint: "适合已有接口路径和认证方式都不固定的服务。这里会显示全部字段，按你的后端文档填写。",
    endpoint: "http://localhost:8000",
    submitPath: "/generate",
    taskPath: "/tasks/{taskId}",
    authHeaderName: "",
    authScheme: "Bearer",
    visibleFields: ["endpoint", "submitPath", "taskPath", "authHeaderName", "authToken", "authScheme"]
  }
};

const el = {
  shell: document.querySelector("#tdStudio"),
  grid: document.querySelector(".td-grid"),
  tabs: [...document.querySelectorAll("[data-tab]")],
  panels: [...document.querySelectorAll("[data-panel]")],
  imageDrop: document.querySelector("#imageDrop"),
  imageInput: document.querySelector("#imageInput"),
  imagePreview: document.querySelector("#imagePreview"),
  providerSelect: document.querySelector("#providerSelect"),
  modelVersion: document.querySelector("#modelVersion"),
  generateType: document.querySelector("#generateType"),
  faceCount: document.querySelector("#faceCount"),
  costHint: document.querySelector("#costHint"),
  submitJob: document.querySelector("#submitJob"),
  createRelief: document.querySelector("#createRelief"),
  reliefWidth: document.querySelector("#reliefWidth"),
  reliefHeight: document.querySelector("#reliefHeight"),
  jobStatus: document.querySelector("#jobStatus"),
  viewport: document.querySelector("#viewport"),
  modelInput: document.querySelector("#modelInput"),
  resetView: document.querySelector("#resetView"),
  toggleWire: document.querySelector("#toggleWire"),
  loadSample: document.querySelector("#loadSample"),
  metricName: document.querySelector("#metricName"),
  metricSize: document.querySelector("#metricSize"),
  metricFaces: document.querySelector("#metricFaces"),
  checkMesh: document.querySelector("#checkMesh"),
  repairMesh: document.querySelector("#repairMesh"),
  repairStatus: document.querySelector("#repairStatus"),
  scaleAxis: document.querySelector("#scaleAxis"),
  targetSize: document.querySelector("#targetSize"),
  applyScale: document.querySelector("#applyScale"),
  exportStl: document.querySelector("#exportStl"),
  keyState: document.querySelector("#keyState"),
  secretIdInput: document.querySelector("#secretIdInput"),
  secretKeyInput: document.querySelector("#secretKeyInput"),
  localPresetSelect: document.querySelector("#localPresetSelect"),
  localPresetHint: document.querySelector("#localPresetHint"),
  localEndpointInput: document.querySelector("#localEndpointInput"),
  localSubmitPathInput: document.querySelector("#localSubmitPathInput"),
  localTaskPathInput: document.querySelector("#localTaskPathInput"),
  localAuthHeaderInput: document.querySelector("#localAuthHeaderInput"),
  localAuthTokenInput: document.querySelector("#localAuthTokenInput"),
  localAuthSchemeInput: document.querySelector("#localAuthSchemeInput"),
  localFields: [...document.querySelectorAll("[data-local-field]")],
  localContractTitle: document.querySelector("#localContractTitle"),
  localContractSubmit: document.querySelector("#localContractSubmit"),
  localContractTask: document.querySelector("#localContractTask"),
  saveConfig: document.querySelector("#saveConfig"),
  clearConfig: document.querySelector("#clearConfig"),
  showHistory: document.querySelector("#showHistory"),
  historyList: document.querySelector("#historyList"),
  toggleHistory: document.querySelector("#toggleHistory"),
  clearHistory: document.querySelector("#clearHistory"),
  template: document.querySelector("#historyItemTemplate")
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xfff4df);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
camera.position.set(80, 70, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
el.viewport.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xffffff, 0xd9c09a, 2.8);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xfff2df, 0.72);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xffffff, 3.1);
key.position.set(60, 90, 30);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const fill = new THREE.DirectionalLight(0xd9fff1, 1.5);
fill.position.set(-70, 45, -80);
scene.add(fill);
const front = new THREE.DirectionalLight(0xfff1dc, 1.3);
front.position.set(0, 35, 120);
scene.add(front);
const grid = new THREE.GridHelper(170, 17, 0xcaa86e, 0xe8d7b7);
scene.add(grid);

const loaders = {
  glb: new GLTFLoader(),
  gltf: new GLTFLoader(),
  stl: new STLLoader(),
  obj: new OBJLoader()
};

init();

async function init() {
  if (new URLSearchParams(location.search).get("mode") === "panel") {
    el.shell.classList.add("is-panel");
  }

  bindTabs();
  bindUploads();
  bindActions();
  await loadConfigForm();
  updateCost();
  updateKeyState();
  await renderHistory();
  loadSampleModel();
  postHost("td:ready", { version: "0.1.0" });
  window.addEventListener("resize", resize);
  resize();
  animate();
}

function bindTabs() {
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      el.panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tab.dataset.tab));
    });
  });
}

function bindUploads() {
  el.imageInput.addEventListener("change", () => loadReferenceImage(el.imageInput.files[0]));
  ["dragenter", "dragover"].forEach((type) => {
    el.imageDrop.addEventListener(type, (event) => {
      event.preventDefault();
      el.imageDrop.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    el.imageDrop.addEventListener(type, () => el.imageDrop.classList.remove("is-dragging"));
  });
  el.imageDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    loadReferenceImage(event.dataTransfer.files[0]);
  });

  el.modelInput.addEventListener("change", () => loadModelFile(el.modelInput.files[0]));
  el.viewport.addEventListener("dragover", (event) => event.preventDefault());
  el.viewport.addEventListener("drop", (event) => {
    event.preventDefault();
    loadModelFile(event.dataTransfer.files[0]);
  });
}

function bindActions() {
  el.generateType.addEventListener("change", updateCost);
  el.providerSelect.addEventListener("change", () => {
    updateCost();
    updateKeyState();
  });
  el.localPresetSelect.addEventListener("change", () => applyLocalPreset(el.localPresetSelect.value));
  [el.localSubmitPathInput, el.localTaskPathInput].forEach((input) => {
    input.addEventListener("input", () => updateLocalPresetUi(el.localPresetSelect.value));
  });
  el.submitJob.addEventListener("click", submitJob);
  el.createRelief.addEventListener("click", createReliefCard);
  el.resetView.addEventListener("click", frameObject);
  el.toggleWire.addEventListener("click", toggleWireframe);
  el.loadSample.addEventListener("click", loadSampleModel);
  el.checkMesh.addEventListener("click", checkMesh);
  el.repairMesh.addEventListener("click", repairMesh);
  el.applyScale.addEventListener("click", applyScale);
  el.exportStl.addEventListener("click", exportStl);
  el.saveConfig.addEventListener("click", saveRuntimeConfig);
  el.clearConfig.addEventListener("click", clearRuntimeConfig);
  el.clearHistory.addEventListener("click", async () => {
    el.clearHistory.disabled = true;
    try {
      await clearHistory();
      await renderHistory();
      setJobStatus("生成历史已从本机缓存清空。");
    } catch (error) {
      setJobStatus(`${error.message} 已先清空当前浏览器历史。`, true);
      await renderHistory();
    } finally {
      el.clearHistory.disabled = false;
    }
  });
  el.toggleHistory.addEventListener("click", toggleHistoryPanel);
  el.showHistory.addEventListener("click", toggleHistoryPanel);

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "td:setTheme") document.documentElement.classList.toggle("light", !message.payload?.dark);
    if (message.type === "td:loadFile" && message.payload?.file) loadModelFile(message.payload.file);
  });
}

async function loadReferenceImage(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setJobStatus("参考图格式需要是 jpg、png 或 webp。", true);
  if (file.size > 6 * 1024 * 1024) return setJobStatus("参考图超过 6MB，请压缩后再上传。", true);
  const dataUrl = await readAsDataUrl(file);
  const dimensions = await readImageDimensions(dataUrl);
  if (Math.min(dimensions.width, dimensions.height) < 128 || Math.max(dimensions.width, dimensions.height) > 5000) {
    return setJobStatus("图片单边需要在 128 到 5000px 之间。", true);
  }
  state.referenceImage = dataUrl;
  state.referenceName = file.name;
  el.imagePreview.src = dataUrl;
  el.imageDrop.classList.add("has-image");
  setJobStatus(`已载入参考图：${file.name}`);
}

async function submitJob() {
  if (!state.referenceImage) return setJobStatus("请先上传参考图。", true);
  const provider = getProvider(el.providerSelect.value);
  if (!provider.isConfigured()) return setJobStatus(`${provider.label} 还没有配置好。可以先拖入本地模型预览，或切换其他生成源。`, true);

  el.submitJob.disabled = true;
  try {
    setJobStatus(`正在提交到${provider.label}...`);
    const submit = await provider.submit({
      imageDataUrl: state.referenceImage,
      imageName: state.referenceName,
      options: getGenerationOptions()
    });
    const taskId = submit.taskId;
    setJobStatus(`已提交：${taskId}，开始轮询状态。`);
    const done = await provider.poll(taskId, (status) => {
      const progress = Number(status.progress || 0);
      setJobStatus(progress ? `任务状态：${status.status || status.Status}，${progress}%` : `任务状态：${status.status || status.Status}`);
    });
    if (done.status === "FAIL" || done.Status === "FAIL") throw new Error(done.error || "生成任务失败。");
    await addHistory({
      provider: provider.id,
      jobId: taskId,
      name: state.referenceName,
      glbUrl: done.glbUrl || "",
      stlUrl: done.stlUrl || "",
      source: state.referenceImage
    });
    await renderHistory();
    postHost("td:generated", { jobId: taskId, glbName: done.glbUrl || "", stlName: done.stlUrl || "" });
    if (done.glbUrl) await loadModelUrl(done.glbUrl, `${provider.id}-${taskId}.glb`);
    else if (done.stlUrl) await loadModelUrl(done.stlUrl, `${provider.id}-${taskId}.stl`);
    setJobStatus("生成完成。请及时下载保存模型文件。");
  } catch (error) {
    setJobStatus(error.message, true);
    postHost("td:error", { code: error.code || "GENERATION_ERROR", message: error.message });
  } finally {
    el.submitJob.disabled = false;
  }
}

async function createReliefCard() {
  if (!state.referenceImage) return setJobStatus("请先上传卡牌图片。", true);
  el.createRelief.disabled = true;
  try {
    setJobStatus("正在把图片转换成卡牌浮雕模型...");
    const mesh = await createCardReliefMesh(state.referenceImage, {
      widthMm: Number(el.reliefWidth.value) || 63,
      reliefMm: Number(el.reliefHeight.value) || 1.2,
      baseMm: 1.6,
      borderMm: 2,
      borderHeightMm: 0.8,
      samplesX: 180
    });
    const name = `${safeName(state.referenceName || "card")}-relief.stl`;
    setModel(mesh, name);
    const previewTab = el.tabs.find((tab) => tab.dataset.tab === "preview");
    previewTab?.click();
    setJobStatus("浮雕卡牌已生成。到“导出”页点击导出 STL 即可打印。");
  } catch (error) {
    setJobStatus(`浮雕生成失败：${error.message}`, true);
  } finally {
    el.createRelief.disabled = false;
  }
}

function getGenerationOptions() {
  return {
    model: el.modelVersion.value,
    generateType: el.generateType.value,
    faceCount: el.faceCount.value
  };
}

async function loadModelFile(file) {
  if (!file) return;
  const ext = extension(file.name);
  if (!loaders[ext]) return;
  const url = URL.createObjectURL(file);
  try {
    await loadModelUrl(url, file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadModelUrl(url, name) {
  const ext = extension(name) || extension(new URL(url, location.href).pathname);
  if (ext === "glb" || ext === "gltf") {
    const gltf = await loaders.glb.loadAsync(url);
    setModel(gltf.scene, name);
  } else if (ext === "stl") {
    const geometry = await loaders.stl.loadAsync(url);
    const mesh = new THREE.Mesh(geometry, defaultMaterial());
    setModel(mesh, name, { preserveMaterial: true, autoStand: false });
  } else if (ext === "obj") {
    const object = await loaders.obj.loadAsync(url);
    setModel(object, name, { fallbackMissingMaterial: true });
  }
}

function setModel(object, name, options = {}) {
  if (state.modelObject) scene.remove(state.modelObject);
  state.modelObject = object;
  state.modelName = name;
  prepareModelForPreview(object, options);
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (!child.material) child.material = defaultMaterial();
  });
  scene.add(object);
  centerObject(object);
  resize();
  frameObject();
  updateMetrics();
  setRepairStatus("模型已加载，可以检测水密性。");
}

function prepareModelForPreview(object, options = {}) {
  if (options.forceDefaultMaterial) setObjectMaterial(object, defaultMaterial);
  else normalizePreviewMaterials(object, options);
  if (options.autoStand !== false) autoStandObject(object);
}

function autoStandObject(object) {
  object.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(object);
  let size = box.getSize(new THREE.Vector3());
  const maxHorizontal = Math.max(size.x, size.z);

  if (size.y >= maxHorizontal * 0.75) return;

  if (size.x >= size.z) object.rotation.z += Math.PI / 2;
  else object.rotation.x -= Math.PI / 2;

  centerObject(object);
}

function loadSampleModel() {
  const group = new THREE.Group();
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8d3a7,
    roughness: 0.78,
    metalness: 0.02
  });
  const robeMaterial = new THREE.MeshStandardMaterial({
    color: 0x7fb06a,
    roughness: 0.82,
    metalness: 0.01
  });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd8b8,
    roughness: 0.74,
    metalness: 0
  });
  const hairMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a392a,
    roughness: 0.86,
    metalness: 0
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x4fa487,
    roughness: 0.78,
    metalness: 0.01
  });
  const cinnabarMaterial = new THREE.MeshStandardMaterial({
    color: 0xc84f3d,
    roughness: 0.76,
    metalness: 0.01
  });
  const inkMaterial = new THREE.MeshStandardMaterial({
    color: 0x38281f,
    roughness: 0.68,
    metalness: 0
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(31, 36, 8, 64), baseMaterial);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(18, 24, 12, 32), robeMaterial);
  const head = new THREE.Mesh(new THREE.SphereGeometry(22, 48, 28), skinMaterial);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(22.8, 48, 18, 0, Math.PI * 2, 0, Math.PI * .48), hairMaterial);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), hairMaterial);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), leafMaterial);
  const nameSeal = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 2.4), cinnabarMaterial);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(18.8, 1.5, 12, 64), cinnabarMaterial);

  const eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 10), inkMaterial);
  const eyeRight = eyeLeft.clone();
  const cheekLeft = new THREE.Mesh(new THREE.SphereGeometry(2.9, 16, 10), cinnabarMaterial);
  const cheekRight = cheekLeft.clone();
  const armLeft = new THREE.Mesh(new THREE.CapsuleGeometry(4.8, 14, 8, 16), robeMaterial);
  const armRight = armLeft.clone();

  base.position.y = 4;
  body.position.y = 28;
  head.position.y = 63;
  hair.position.y = 69;
  bun.position.set(0, 88, -2);
  leaf.position.set(8, 92, 0);
  leaf.scale.set(1.5, .45, .85);
  leaf.rotation.z = -0.55;
  nameSeal.position.set(0, 38, 18.8);
  belt.position.y = 27;
  belt.rotation.x = Math.PI / 2;
  eyeLeft.position.set(-7, 65, 19.4);
  eyeRight.position.set(7, 65, 19.4);
  cheekLeft.position.set(-12, 59, 18.4);
  cheekRight.position.set(12, 59, 18.4);
  cheekLeft.scale.set(1.35, .72, .45);
  cheekRight.scale.copy(cheekLeft.scale);
  armLeft.position.set(-18, 32, 3);
  armRight.position.set(18, 32, 3);
  armLeft.rotation.z = 0.42;
  armRight.rotation.z = -0.42;

  group.add(base, body, head, hair, bun, leaf, nameSeal, belt, eyeLeft, eyeRight, cheekLeft, cheekRight, armLeft, armRight);
  setModel(group, "baicaoxing-q-print-form.stl", { autoStand: false });
}

function defaultMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xf0d8ad,
    emissive: 0x2a170d,
    emissiveIntensity: 0.05,
    roughness: 0.78,
    metalness: 0.01,
    side: THREE.DoubleSide
  });
}

function setObjectMaterial(object, materialFactory) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.material = materialFactory(child);
  });
}

function normalizePreviewMaterials(object, options = {}) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (child.geometry) {
      child.geometry.computeVertexNormals();
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
    }

    const materials = normalizeMaterialList(child.material);
    if (!materials.length) {
      child.material = defaultMaterial();
      return;
    }

    const nextMaterials = materials.map((material) => {
      if (options.fallbackMissingMaterial && !material) return defaultMaterial();
      if (!material) return defaultMaterial();
      prepareTextureColorSpace(material);

      if (materialNeedsPreviewFallback(material, child.geometry)) {
        return defaultMaterial();
      }

      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
      return material;
    });

    child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0];
  });
}

function normalizeMaterialList(material) {
  if (Array.isArray(material)) return material;
  return material ? [material] : [];
}

function prepareTextureColorSpace(material) {
  ["map", "emissiveMap"].forEach((key) => {
    if (material[key]) material[key].colorSpace = THREE.SRGBColorSpace;
  });
}

function materialNeedsPreviewFallback(material, geometry) {
  const hasVisibleTexture = material.map || material.emissiveMap;
  const hasVertexColors = Boolean(geometry?.attributes?.color);
  if (hasVisibleTexture || hasVertexColors) return false;
  if (!material.color) return false;

  const brightness = material.color.r + material.color.g + material.color.b;
  const opacity = material.opacity ?? 1;
  return opacity > 0.01 && brightness < 0.08;
}

function toggleWireframe() {
  state.wireframe = !state.wireframe;
  state.modelObject?.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    normalizeMaterialList(child.material).forEach((material) => {
      material.wireframe = state.wireframe;
    });
  });
}

function checkMesh() {
  if (!state.modelObject) return setRepairStatus("请先加载模型。", true);
  const result = inspectWatertight(state.modelObject);
  setRepairStatus(result.watertight
    ? `检测通过：${result.triangles} 个三角面，没有发现开放边。`
    : `检测未通过：开放边 ${result.openEdges}，非流形边 ${result.nonManifoldEdges}。`);
}

function repairMesh() {
  if (!state.modelObject) return setRepairStatus("请先加载模型。", true);
  const result = cleanGeometry(state.modelObject);
  setRepairStatus(result.watertight
    ? "已清理法线和包围盒，当前边计数显示水密。"
    : `已完成基础清理，但仍有开放边 ${result.openEdges}。后续可接入 manifold3d WASM 做真正 Make Manifold。`);
  updateMetrics();
}

function applyScale() {
  if (!state.modelObject) return;
  const stats = scaleObjectToSize(state.modelObject, el.scaleAxis.value, Number(el.targetSize.value));
  if (stats) updateMetrics(stats);
}

function exportStl() {
  if (!state.modelObject) return;
  const result = exportBinaryStl(state.modelObject);
  const blob = result instanceof Blob ? result : new Blob([result], { type: "model/stl" });
  const filename = `${safeName(state.modelName || "td-model")}.stl`;
  downloadBlob(blob, filename);
  const stats = getMeshStats(state.modelObject);
  postHost("td:exported", { stlName: filename, sizeMM: vectorText(stats.size) });
}

function updateMetrics(stats = getMeshStats(state.modelObject)) {
  el.metricName.textContent = state.modelName || "未命名模型";
  el.metricSize.textContent = vectorText(stats.size);
  el.metricFaces.textContent = stats.faces.toLocaleString("zh-CN");
}

function frameObject() {
  if (!state.modelObject) return;
  const box = new THREE.Box3().setFromObject(state.modelObject);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDim / Math.tan((camera.fov * Math.PI) / 360);
  camera.position.set(center.x + distance * .7, center.y + distance * .55, center.z + distance * .8);
  camera.near = Math.max(distance / 1000, .01);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function resize() {
  const rect = el.viewport.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / Math.max(rect.height, 1);
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

async function renderHistory() {
  const history = await readHistory();
  el.historyList.replaceChildren();
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "td-status";
    empty.textContent = "生成完成后会在这里保留最近 20 条记录。";
    el.historyList.append(empty);
    return;
  }
  history.forEach((item) => {
    const node = el.template.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = item.name || item.jobId || "未命名任务";
    node.querySelector("small").textContent = item.jobId ? `JobId ${item.jobId}` : new Date(item.savedAt).toLocaleString();
    const thumb = node.querySelector(".td-thumb");
    if (item.source) thumb.style.backgroundImage = `url("${item.source}")`;
    thumb.style.backgroundSize = "cover";
    node.addEventListener("click", () => {
      if (item.glbUrl) loadModelUrl(item.glbUrl, `${item.jobId}.glb`);
      else if (item.stlUrl) loadModelUrl(item.stlUrl, `${item.jobId}.stl`);
    });
    el.historyList.append(node);
  });
}

function updateCost() {
  const provider = getProvider(el.providerSelect.value);
  el.costHint.textContent = `预计消耗：${provider.costLabel(el.generateType.value)}`;
}

function updateKeyState() {
  const provider = getProvider(el.providerSelect.value);
  el.keyState.textContent = provider.isConfigured()
    ? `当前生成源可用：${provider.label}。`
    : `当前生成源未配置：${provider.label}。请在下面选择接口类型，页面会只显示需要填写的信息。`;
}

async function loadConfigForm() {
  const fileConfig = window.TD_STUDIO_CONFIG || {};
  const savedConfig = await readRuntimeConfig({});
  const config = {
    ...fileConfig,
    ...savedConfig,
    localProvider: {
      ...(fileConfig.localProvider || {}),
      ...(savedConfig.localProvider || {})
    }
  };
  const localProvider = config.localProvider || {};
  el.secretIdInput.value = config.tencentSecretId || "";
  el.secretKeyInput.value = config.tencentSecretKey || "";
  el.localPresetSelect.value = localProvider.apiPreset || "local-default";
  el.localEndpointInput.value = localProvider.endpoint || "http://localhost:8000";
  el.localSubmitPathInput.value = localProvider.submitPath || "/generate";
  el.localTaskPathInput.value = localProvider.taskPath || "/tasks/{taskId}";
  el.localAuthHeaderInput.value = localProvider.authHeaderName || "";
  el.localAuthTokenInput.value = localProvider.authToken || "";
  el.localAuthSchemeInput.value = localProvider.authScheme ?? "Bearer";
  updateLocalPresetUi(el.localPresetSelect.value);
}

async function saveRuntimeConfig() {
  const config = {
    tencentSecretId: el.secretIdInput.value.trim(),
    tencentSecretKey: el.secretKeyInput.value.trim(),
    localProvider: {
      apiPreset: el.localPresetSelect.value,
      endpoint: el.localEndpointInput.value.trim() || "http://localhost:8000",
      submitPath: el.localSubmitPathInput.value.trim() || "/generate",
      taskPath: el.localTaskPathInput.value.trim() || "/tasks/{taskId}",
      authHeaderName: el.localAuthHeaderInput.value.trim(),
      authToken: el.localAuthTokenInput.value.trim(),
      authScheme: el.localAuthSchemeInput.value.trim(),
      pollIntervalMs: 3000
    }
  };

  el.saveConfig.disabled = true;
  try {
    const persisted = await writeRuntimeConfig(config);
    updateKeyState();
    updateCost();
    setJobStatus(persisted
      ? "配置已保存到本机 CSV 和当前浏览器，下次打开会自动读取。"
      : "配置已保存到当前浏览器。直接双击打开时不会写入 local-data 文件夹。");
  } catch (error) {
    updateKeyState();
    updateCost();
    setJobStatus(`${error.message} 已先保存到当前浏览器。`, true);
  } finally {
    el.saveConfig.disabled = false;
  }
}

function applyLocalPreset(presetId) {
  const preset = getLocalPreset(presetId);
  el.localEndpointInput.value = preset.endpoint;
  el.localSubmitPathInput.value = preset.submitPath;
  el.localTaskPathInput.value = preset.taskPath;
  el.localAuthHeaderInput.value = preset.authHeaderName;
  el.localAuthSchemeInput.value = preset.authScheme;
  if (!preset.visibleFields.includes("authToken")) el.localAuthTokenInput.value = "";
  updateLocalPresetUi(presetId);
  updateKeyState();
}

function updateLocalPresetUi(presetId) {
  const preset = getLocalPreset(presetId);
  const visible = new Set(preset.visibleFields);
  el.localPresetHint.textContent = preset.hint;
  el.localFields.forEach((field) => {
    field.hidden = !visible.has(field.dataset.localField);
  });
  el.localContractTitle.textContent = `${preset.label}需要填写`;
  el.localContractSubmit.textContent = `提交：POST ${el.localSubmitPathInput.value || preset.submitPath}`;
  el.localContractTask.textContent = `查询：GET ${el.localTaskPathInput.value || preset.taskPath}`;
}

function getLocalPreset(presetId) {
  return LOCAL_API_PRESETS[presetId] || LOCAL_API_PRESETS["local-default"];
}

async function clearRuntimeConfig() {
  el.clearConfig.disabled = true;
  try {
    const persisted = await writeRuntimeConfig({});
    await loadConfigForm();
    updateKeyState();
    setJobStatus(persisted ? "本机 CSV 和浏览器配置已清空。" : "浏览器配置已清空。");
  } catch (error) {
    await loadConfigForm();
    updateKeyState();
    setJobStatus(`${error.message} 浏览器配置已先清空。`, true);
  } finally {
    el.clearConfig.disabled = false;
  }
}

function toggleHistoryPanel() {
  const collapsed = el.grid.classList.toggle("history-collapsed");
  el.toggleHistory.textContent = collapsed ? "展开" : "收起";
  requestAnimationFrame(() => {
    resize();
    frameObject();
  });
}

function setJobStatus(message, isError = false) {
  el.jobStatus.textContent = message;
  el.jobStatus.style.color = isError ? "var(--danger)" : "";
}

function setRepairStatus(message, isError = false) {
  el.repairStatus.textContent = message;
  el.repairStatus.style.color = isError ? "var(--danger)" : "";
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}

function extension(name) {
  return String(name || "").split("?")[0].split(".").pop().toLowerCase();
}

function vectorText(size) {
  return `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} mm`;
}

function safeName(name) {
  return String(name).replace(/\.[^.]+$/, "").replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-").slice(0, 64) || "td-model";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function postHost(type, payload) {
  window.parent?.postMessage({ type, payload }, "*");
}
