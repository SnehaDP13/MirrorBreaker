import fs from "fs";
import https from "https";
import path from "path";

const ASSETS_DIR = path.join(process.cwd(), "extension", "dist", "assets");

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

const downloads = [
  {
    url: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm/vision_wasm_internal.js",
    dest: path.join(ASSETS_DIR, "vision_wasm_internal.js"),
  },
  {
    url: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm/vision_wasm_internal.wasm",
    dest: path.join(ASSETS_DIR, "vision_wasm_internal.wasm"),
  },
  {
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    dest: path.join(ASSETS_DIR, "face_landmarker.task"),
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} to ${dest}...`);
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

async function main() {
  for (const d of downloads) {
    await download(d.url, d.dest);
  }
  console.log("All assets downloaded!");
}

main().catch(console.error);
