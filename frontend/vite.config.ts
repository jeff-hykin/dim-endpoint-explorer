import react from "@vitejs/plugin-react"
import process from "node:process"
import { defineConfig } from "vite"

// base "./": every URL relative, so the app works under Desktop's /apps/<name>/ (docs/apps.md); `npm run dev` proxies
// Desktop's paths to DESKTOP (default: `deno task mock`, a stand-in Desktop on :7399)
const desktop = process.env.DESKTOP ?? "http://127.0.0.1:7399"
export default defineConfig({
    base: "./",
    plugins: [react()],
    server: {
        proxy: Object.fromEntries(["/api", "/dimos", "/agent", "/mcp", "/apps"].map((path) => [path, desktop])),
    },
})
