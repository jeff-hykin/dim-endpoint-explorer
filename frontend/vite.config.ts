import react from "@vitejs/plugin-react"
import process from "node:process"
import { defineConfig } from "vite"

// base "./": every URL relative, so the app works under Desktop's /apps/<name>/ (docs/apps.md); `npm run dev` proxies
// Desktop's /api to DESKTOP (default the local Desktop on :5555)
const desktop = process.env.DESKTOP ?? "http://127.0.0.1:5555"
export default defineConfig({
    base: "./",
    plugins: [react()],
    server: { proxy: { "/api": desktop } },
})
