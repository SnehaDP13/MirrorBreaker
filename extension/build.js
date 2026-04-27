import * as esbuild from "esbuild";
import path from "path";

const EXTENSION_DIR = path.join(process.cwd(), "extension");
const DIST_DIR = path.join(EXTENSION_DIR, "dist");

async function build() {
  await esbuild.build({
    entryPoints: [
      path.join(EXTENSION_DIR, "content.ts"),
      path.join(EXTENSION_DIR, "iframe.ts"),
    ],
    bundle: true,
    outdir: DIST_DIR,
    target: ["es2020"],
    format: "iife",
    platform: "browser",
    minify: false, // keep it readable for debugging
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    logLevel: "info",
    alias: {
      "@": path.join(process.cwd(), "src"),
    },
  });
}

build().catch(() => process.exit(1));
