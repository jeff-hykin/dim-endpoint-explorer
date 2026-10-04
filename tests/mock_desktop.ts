// A stand-in Desktop serving tests/fixtures (shaped per the IcyStingray design): the backend tests use it, and
// `deno task mock` runs it with live-looking traffic, the built page at /apps/dim-endpoint-explorer/ and the backend's
// routes, for working on the page without a dev Desktop.
import { handle } from "../backend/http.ts"
import { matchesTemplate, type Stats } from "../backend/model.ts"

const fixture = (name: string) => JSON.parse(Deno.readTextFileSync(new URL(`fixtures/${name}`, import.meta.url)))
const APP = "dim-endpoint-explorer"

export function mockDesktop(
    { port = 0, live = false, frontend }: { port?: number; live?: boolean; frontend?: string } = {},
) {
    const stats: Stats = fixture("stats.json")
    const registry = fixture("endpoints.json")
    const rates = fixture("rates.json")
    const samples = fixture("samples.json")
    const listeners = new Set<ReadableStreamDefaultController<Uint8Array>>()
    const encoder = new TextEncoder()
    const emit = (event: unknown) => {
        for (const listener of listeners) {
            try {
                listener.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            } catch {
                listeners.delete(listener)
            }
        }
    }
    const changed: Stats["families"][string] = []
    const changedFamilies: string[] = []
    const count = (family: string, method: string, path: string, status: number) => {
        const rows = (stats.families[family] ??= [])
        let row = rows.find((r) => r.method === method && (r.path === path || matchesTemplate(r.path, path)))
        if (!row) {
            row = { method, path, calls: 0, errors: 0, lastCall: null, meanMs: 2, perSec: 0, matched: true }
            rows.push(row)
        }
        row.calls++
        row.errors += status >= 400 ? 1 : 0
        row.lastCall = Date.now()
        stats.totals.calls++
        changed.push(row)
        changedFamilies.push(family)
    }
    const timers: number[] = []
    if (live) {
        timers.push(setInterval(() => {
            stats.now = Date.now()
            for (const [family, rows] of Object.entries(stats.families)) {
                for (const row of rows) {
                    const base = row.path.includes("state") || row.path.includes("rates") ? 2 : 0.15
                    const n = Math.random() < base ? Math.ceil(Math.random() * base * 2) : 0
                    row.perSec = Math.round((row.perSec * 0.7 + n * 0.3) * 100) / 100
                    if (n) {
                        row.calls += n
                        row.lastCall = Date.now()
                        stats.totals.calls += n
                        changed.push(row)
                        changedFamilies.push(family)
                    }
                }
            }
            stats.totals.perSec = Math.round(
                Object.values(stats.families).flat().reduce((s, r) => s + r.perSec, 0) * 100,
            ) / 100
            for (const topic of rates.topics) {
                const hz = Math.max(0, topic.history[topic.history.length - 1] * (0.94 + Math.random() * 0.12))
                topic.hz = Math.round(hz * 10) / 10
                topic.history = [...topic.history.slice(-31), topic.hz]
            }
            if (changed.length) {
                emit({
                    type: "endpoint-stats",
                    at: Date.now(),
                    totals: stats.totals,
                    changed: changed.map((row, i) => ({ family: changedFamilies[i], ...row })),
                })
                changed.length = 0
                changedFamilies.length = 0
            }
        }, 1000))
    }
    const self = () => `http://127.0.0.1:${server.addr.port}`
    const route = async (request: Request): Promise<Response> => {
        const url = new URL(request.url)
        const path = url.pathname
        const json = (value: unknown) => Response.json(value)
        if (path === "/api/events") {
            let mine: ReadableStreamDefaultController<Uint8Array>
            const body = new ReadableStream<Uint8Array>({
                start: (controller) => {
                    mine = controller
                    listeners.add(controller)
                    controller.enqueue(encoder.encode(": hello\n\n"))
                },
                cancel: () => {
                    listeners.delete(mine)
                },
            })
            return new Response(body, { headers: { "content-type": "text/event-stream" } })
        }
        if (path === "/mock/install") {
            const name = url.searchParams.get("name") ?? "map-editor"
            registry.apps.push({
                app: name,
                title: "Map Editor",
                source: "dimos.yaml",
                endpoints: [
                    { method: "GET", path: "api/maps", description: "Saved maps" },
                    { method: "POST", path: "api/maps/{id}/save", description: "Save a map" },
                ],
            })
            emit({ type: "apps" })
            emit({ type: "endpoints", app: name, added: registry.apps.at(-1).endpoints, removed: [] })
            return json({ ok: true })
        }
        const fixed: Record<string, () => unknown> = {
            "/api/desktop/openapi": () => fixture("openapi.json"),
            "/agent/api/openapi": () => fixture("agent_openapi.json"),
            "/api/endpoints": () => {
                const app = url.searchParams.get("app")
                return app ? { apps: registry.apps.filter((a: { app: string }) => a.app === app) } : registry
            },
            "/api/endpoints/stats": () => ({ ...stats, now: Date.now() }),
            "/api/topics": () => fixture("topics.json"),
            "/api/topics/rates": () => rates,
            "/dimos/runs": () => fixture("runs.json"),
            "/dimos/blueprints": () => fixture("blueprints.json"),
            "/api/apps": () => fixture("apps.json"),
            "/api/hud": () => ({ zenoh: "peer" }),
            "/api/zenoh-web": () => ({
                enabled: true,
                up: true,
                url: "/zenoh-web",
                version: "0.4.1-63b72dd",
                encoder: "VideoToolbox",
            }),
            "/dimos/info": () => ({ dir: "/repos/dimos", found: true, installed: true, version: "0.0.9" }),
        }
        if (path === "/api/desktop/dimos.yaml") {
            return new Response(Deno.readTextFileSync(new URL("fixtures/dimos.yaml", import.meta.url)), {
                headers: { "content-type": "text/yaml" },
            })
        }
        if (path === "/api/topics/sample") {
            const sample = samples[url.searchParams.get("topic") ?? ""]
            return sample ? json(sample) : Response.json({ error: "nothing on that topic" }, { status: 400 })
        }
        if (path === "/mcp" && request.method === "POST") {
            return json(fixture("mcp_tools.json"))
        }
        if (fixed[path]) {
            return json(fixed[path]())
        }
        if (path.startsWith(`/apps/${APP}/`)) {
            const rest = new Request(new URL(path.slice(`/apps/${APP}`.length) + url.search, self()), request)
            const answer = await handle(rest, (await import("../backend/routes.ts")).routes, "")
            if (answer) {
                return answer
            }
            if (frontend) {
                const file = path.slice(`/apps/${APP}/`.length) || "index.html"
                try {
                    const bytes = await Deno.readFile(`${frontend}/${file.replace(/\.\./g, "")}`)
                    const ext = file.split(".").pop()
                    const type = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml" }[
                        ext ?? ""
                    ] ?? "application/octet-stream"
                    return new Response(bytes, { headers: { "content-type": type } })
                } catch {
                    // fall through
                }
            }
        }
        if (path.startsWith("/apps/")) {
            return json({ ok: true, mock: true })
        }
        return Response.json({ error: `mock Desktop has no ${path}` }, { status: 404 })
    }
    const server = Deno.serve({ port, hostname: "127.0.0.1", onListen: () => {} }, async (request) => {
        const response = await route(request)
        const path = new URL(request.url).pathname
        if (live && path !== "/api/events" && path !== "/api/endpoints/stats" && !path.startsWith("/mock")) {
            const app = path.match(/^\/apps\/([^/]+)\/(.*)$/)
            const family = app
                ? `app:${app[1]}`
                : path.startsWith("/dimos")
                ? "dimos"
                : path.startsWith("/agent")
                ? "agent"
                : "desktop"
            const counted = app ? (app[2].startsWith("api/") ? app[2] : "(frontend)") : path
            count(family, app && !app[2].startsWith("api/") ? "GET" : request.method, counted, response.status)
        }
        return response
    })
    return {
        url: self(),
        emit,
        close: async () => {
            timers.forEach(clearInterval)
            for (const listener of listeners) {
                try {
                    listener.close()
                } catch {
                    // already closed
                }
            }
            await server.shutdown()
        },
    }
}

if (import.meta.main) {
    const { setDesktopUrl } = await import("../backend/desktop.ts")
    const port = Number(Deno.args[Deno.args.indexOf("--port") + 1] || 7399)
    const mock = mockDesktop({ port, live: true, frontend: new URL("../frontend/dist", import.meta.url).pathname })
    setDesktopUrl(mock.url)
    console.log(`mock Desktop on ${mock.url}  page: ${mock.url}/apps/${APP}/`)
}
