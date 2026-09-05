import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

export function getMeshStats(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  let faces = 0;
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geometry = child.geometry;
    if (geometry.index) faces += geometry.index.count / 3;
    else faces += geometry.attributes.position.count / 3;
  });
  return { box, size, faces: Math.round(faces) };
}

export function scaleObjectToSize(object, axis, targetSizeMm) {
  const { size } = getMeshStats(object);
  const source = axis === "max" ? Math.max(size.x, size.y, size.z) : size[axis];
  if (!source || !Number.isFinite(source)) return null;
  const scale = Number(targetSizeMm) / source;
  object.scale.multiplyScalar(scale);
  centerObject(object);
  return getMeshStats(object);
}

export function centerObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const nextBox = new THREE.Box3().setFromObject(object);
  object.position.y -= nextBox.min.y;
}

export function inspectWatertight(object) {
  const edgeMap = new Map();
  let triangles = 0;
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    const positions = geometry.attributes.position;
    const matrix = child.matrixWorld;
    for (let i = 0; i < positions.count; i += 3) {
      triangles += 1;
      const a = vertexKey(positions, i, matrix);
      const b = vertexKey(positions, i + 1, matrix);
      const c = vertexKey(positions, i + 2, matrix);
      addEdge(edgeMap, a, b);
      addEdge(edgeMap, b, c);
      addEdge(edgeMap, c, a);
    }
    geometry.dispose();
  });
  let openEdges = 0;
  let nonManifoldEdges = 0;
  edgeMap.forEach((count) => {
    if (count === 1) openEdges += 1;
    if (count > 2) nonManifoldEdges += 1;
  });
  return {
    triangles,
    openEdges,
    nonManifoldEdges,
    watertight: triangles > 0 && openEdges === 0 && nonManifoldEdges === 0
  };
}

export function cleanGeometry(object) {
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    child.geometry.computeVertexNormals();
    child.geometry.computeBoundingBox();
    child.geometry.computeBoundingSphere();
  });
  return inspectWatertight(object);
}

export function exportBinaryStl(object) {
  const exporter = new STLExporter();
  return exporter.parse(object, { binary: true });
}

export async function createCardReliefMesh(imageDataUrl, options = {}) {
  const widthMm = Number(options.widthMm) || 63;
  const baseMm = Number(options.baseMm) || 1.6;
  const reliefMm = Number(options.reliefMm) || 1.2;
  const borderMm = Number(options.borderMm) || 2;
  const borderHeightMm = Number(options.borderHeightMm) || 0.8;
  const samplesX = Number(options.samplesX) || 180;
  const image = await loadImage(imageDataUrl);
  const aspect = image.naturalHeight / image.naturalWidth;
  const samplesY = Math.max(16, Math.round(samplesX * aspect));
  const heightMm = widthMm * aspect;
  const height = imageToHeightMap(image, samplesX, samplesY, widthMm, heightMm, baseMm, reliefMm, borderMm, borderHeightMm);
  const geometry = heightMapToGeometry(height, widthMm, heightMm);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    color: 0xd8d1bd,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.72,
    metalness: 0.02
  });
  return new THREE.Mesh(geometry, material);
}

function addEdge(edgeMap, left, right) {
  const key = left < right ? `${left}|${right}` : `${right}|${left}`;
  edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
}

function vertexKey(attribute, index, matrix) {
  const v = new THREE.Vector3().fromBufferAttribute(attribute, index).applyMatrix4(matrix);
  return `${round(v.x)},${round(v.y)},${round(v.z)}`;
}

function round(value) {
  return Math.round(value * 100000) / 100000;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function imageToHeightMap(image, samplesX, samplesY, widthMm, heightMm, baseMm, reliefMm, borderMm, borderHeightMm) {
  const canvas = document.createElement("canvas");
  canvas.width = samplesX;
  canvas.height = samplesY;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, samplesX, samplesY);
  const { data } = ctx.getImageData(0, 0, samplesX, samplesY);
  const height = new Float32Array(samplesX * samplesY);
  const colors = new Float32Array(samplesX * samplesY * 3);
  for (let y = 0; y < samplesY; y += 1) {
    for (let x = 0; x < samplesX; x += 1) {
      const index = (y * samplesX + x) * 4;
      const r = data[index] / 255;
      const g = data[index + 1] / 255;
      const b = data[index + 2] / 255;
      const a = data[index + 3] / 255;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const raised = Math.pow((1 - luminance) * a, 1.25);
      height[y * samplesX + x] = baseMm + raised * reliefMm;
      const colorIndex = (y * samplesX + x) * 3;
      colors[colorIndex] = mix(0.82, r, a);
      colors[colorIndex + 1] = mix(0.78, g, a);
      colors[colorIndex + 2] = mix(0.66, b, a);
    }
  }
  addRim(height, samplesX, samplesY, widthMm, heightMm, borderMm, borderHeightMm);
  return { data: height, colors, cols: samplesX, rows: samplesY };
}

function addRim(height, cols, rows, widthMm, heightMm, borderMm, borderHeightMm) {
  const borderX = Math.max(1, Math.round(cols * borderMm / widthMm));
  const borderY = Math.max(1, Math.round(rows * borderMm / heightMm));
  const border = Math.min(borderX, borderY);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const dist = Math.min(x, cols - 1 - x, y, rows - 1 - y);
      const rim = Math.max(0, Math.min(1, (border - dist) / border));
      height[y * cols + x] += Math.sqrt(rim) * borderHeightMm;
    }
  }
}

function heightMapToGeometry(height, widthMm, heightMm) {
  const { data, colors, cols, rows } = height;
  const vertices = [];
  const vertexColors = [];
  const indices = [];

  for (let y = 0; y < rows; y += 1) {
    const z = heightMm / 2 - (y / (rows - 1)) * heightMm;
    for (let x = 0; x < cols; x += 1) {
      const px = -widthMm / 2 + (x / (cols - 1)) * widthMm;
      vertices.push(px, data[y * cols + x], z);
      const colorIndex = (y * cols + x) * 3;
      vertexColors.push(colors[colorIndex], colors[colorIndex + 1], colors[colorIndex + 2]);
    }
  }
  const bottomOffset = rows * cols;
  for (let y = 0; y < rows; y += 1) {
    const z = heightMm / 2 - (y / (rows - 1)) * heightMm;
    for (let x = 0; x < cols; x += 1) {
      const px = -widthMm / 2 + (x / (cols - 1)) * widthMm;
      vertices.push(px, 0, z);
      vertexColors.push(0.55, 0.52, 0.44);
    }
  }

  for (let y = 0; y < rows - 1; y += 1) {
    for (let x = 0; x < cols - 1; x += 1) {
      const a = y * cols + x;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
      indices.push(bottomOffset + a, bottomOffset + c, bottomOffset + b, bottomOffset + b, bottomOffset + c, bottomOffset + d);
    }
  }

  for (let x = 0; x < cols - 1; x += 1) {
    addQuad(indices, x, x + 1, bottomOffset + x + 1, bottomOffset + x);
    const topA = (rows - 1) * cols + x;
    addQuad(indices, topA + 1, topA, bottomOffset + topA, bottomOffset + topA + 1);
  }
  for (let y = 0; y < rows - 1; y += 1) {
    const left = y * cols;
    addQuad(indices, left + cols, left, bottomOffset + left, bottomOffset + left + cols);
    const right = y * cols + cols - 1;
    addQuad(indices, right, right + cols, bottomOffset + right + cols, bottomOffset + right);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setIndex(indices);
  return geometry;
}

function addQuad(indices, a, b, c, d) {
  indices.push(a, b, c, a, c, d);
}

function mix(left, right, amount) {
  return left + (right - left) * amount;
}
