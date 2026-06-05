import fs from "node:fs";
import { fileURLToPath } from "node:url";

const serveUiHtmlPath = fileURLToPath(new URL("./dist/index.html", import.meta.url));

const serveIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="badge" x1="96" y1="72" x2="416" y2="440" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#182026"/><stop offset="1" stop-color="#0b1013"/></linearGradient><linearGradient id="screen" x1="152" y1="140" x2="360" y2="310" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#202b32"/><stop offset="1" stop-color="#12191e"/></linearGradient></defs><rect x="56" y="56" width="400" height="400" rx="104" fill="url(#badge)"/><rect x="144" y="133" width="224" height="176" rx="36" fill="#f7f2e6"/><rect x="168" y="158" width="176" height="126" rx="19" fill="url(#screen)"/><path d="M195 198l45 36-45 36" fill="none" stroke="#f2b84b" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><path d="M267 267h72" fill="none" stroke="#f7f2e6" stroke-width="24" stroke-linecap="round"/><circle cx="164" cy="360" r="24" fill="#3a86ff"/><circle cx="256" cy="376" r="24" fill="#10a37f"/><circle cx="348" cy="360" r="24" fill="#d97757"/><path d="M183 363c44 33 119 34 164 0" fill="none" stroke="#f7f2e6" stroke-width="16" stroke-linecap="round" opacity="0.56"/></svg>`;
const serveWhiteIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="10" width="44" height="38" rx="10" stroke-width="5"/><path d="M23 25l9 7-9 7" stroke-width="5.8"/><path d="M37 39h9" stroke-width="5"/><path d="M18 55c8 6 20 6 28 0" stroke-width="3.2" opacity="0.68"/></g><circle cx="18" cy="55" r="3.2" fill="#ffffff"/><circle cx="32" cy="56" r="3.2" fill="#ffffff"/><circle cx="46" cy="55" r="3.2" fill="#ffffff"/></svg>`;

function svgDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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
          src: svgDataUri(serveIconSvg),
          sizes: "512x512",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
        {
          src: svgDataUri(serveWhiteIconSvg),
          sizes: "64x64",
          type: "image/svg+xml",
          purpose: "monochrome",
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
