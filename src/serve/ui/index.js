import fs from "node:fs";
import { fileURLToPath } from "node:url";

const serveUiHtmlPath = fileURLToPath(new URL("./dist/index.html", import.meta.url));

function readServeUiHtml() {
  try {
    return fs.readFileSync(serveUiHtmlPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Missing serve UI build. Run npm run build:serve-ui.");
    }
    throw error;
  }
}

export function renderServeManifest() {
  return `${JSON.stringify(
    {
      name: "KAGE Sessions",
      short_name: "KAGE",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#101316",
      theme_color: "#101316",
      description: "Local KAGE session viewer for Claude Code, Codex, QoderCLI, and QoderWork.",
      icons: [
        {
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' rx='28' fill='%23101316'/%3E%3Cpath d='M34 35h60L72 64l22 29H34l22-29L34 35Z' fill='%233a86ff'/%3E%3Cpath d='M48 46h32L64 64l16 18H48l16-18-16-18Z' fill='%2310a37f'/%3E%3C/svg%3E",
          sizes: "128x128",
          type: "image/svg+xml",
        },
      ],
    },
    null,
    2,
  )}\n`;
}

export function renderServeServiceWorker() {
  return `self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
`;
}

export function renderServeUi({ passwordRequired = false, sendEnabled = false } = {}) {
  const configScript = `window.__KAGE_CONFIG__ = ${JSON.stringify({ passwordRequired, sendEnabled })};`;
  return readServeUiHtml().replace("window.__KAGE_CONFIG__ = {};", configScript);
}
