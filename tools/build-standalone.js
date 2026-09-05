const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  "src/storage.js",
  "src/hunyuan-client.js",
  "src/providers/local-provider.js",
  "src/providers/index.js",
  "src/mesh-tools.js",
  "src/app.js"
];

const imports = `import * as THREE from "https://unpkg.com/three@0.169.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.169.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "https://unpkg.com/three@0.169.0/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "https://unpkg.com/three@0.169.0/examples/jsm/loaders/OBJLoader.js";
import { RoomEnvironment } from "https://unpkg.com/three@0.169.0/examples/jsm/environments/RoomEnvironment.js";
import { STLExporter } from "https://unpkg.com/three@0.169.0/examples/jsm/exporters/STLExporter.js";`;

function stripModuleSyntax(source) {
  return source
    .replace(/^\s*import[\s\S]*?;\s*$/gm, "")
    .replace(/\bexport\s+(?=(async\s+)?function|const|let|var|class)/g, "");
}

function readSource(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  return `\n/* ${file} */\n${stripModuleSyntax(source).trim()}\n`;
}

const inlineScript = `${imports}\n${files.map(readSource).join("\n")}`;
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
const standalone = index
  .replace(/<link rel="stylesheet" href="\.\/src\/styles\.css">\s*/m, `<style>\n${css}\n  </style>\n`)
  .replace(/<script src="\.\/config\.local\.js"><\/script>\s*/m, "")
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/m, "")
  .replace(
    /<script type="module" src="\.\/src\/app\.js"><\/script>/,
    `<script type="module">\n${inlineScript}\n  </script>`
  )
  .replace(
    "<title>百草姓 3D 萌物工坊</title>",
    "<title>百草姓 3D 萌物工坊 - 单文件版</title>"
  );

fs.writeFileSync(path.join(root, "standalone.html"), standalone, "utf8");
console.log("Generated standalone.html");
