// The Explorer's agent endpoints (http.ts): compact answers about the running system, built from Desktop's own APIs
// (its openapi, the endpoint registry, the call counts, zenoh-web's topic rates, the runs), so Desktop's agent can ask
// "what is busy?" without reading five documents. The page itself reads Desktop directly (same origin).
import { desktopJson, desktopUrl } from "./desktop.ts"
import { HttpError, type Route } from "./http.ts"
import {
    busiest,
    familyEndpoints,
    familyTotals,
    type OpenApi,
    type Rates,
    type Registry,
    type Stats,
    withCounts,
} from "./model.ts"

export const DESCRIPTION =
    "Endpoint Explorer: maps every endpoint family of the running dimOS system (Desktop, the dimos server, the agent gateway, each app, zenoh-web topics) with live call counts and topic rates"

type Runs = { runs?: { blueprint: string }[]; launch?: { blueprint: string; phase: string } | null }

async function sources() {
    const [desktop, agent, registry, stats] = await Promise.all([
        desktopJson<OpenApi>("/api/desktop/openapi", { optional: true }),
        desktopJson<OpenApi>("/agent/api/openapi", { optional: true }),
        desktopJson<Registry>("/api/endpoints"),
        desktopJson<Stats>("/api/endpoints/stats", { optional: true }),
    ])
    return { desktop, agent, registry, stats, families: familyEndpoints(desktop, agent, registry) }
}

const number = (value: unknown, fallback: number) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export const routes: Route[] = [
    {
        method: "GET",
        path: "api/summary",
        description:
            "A compact picture of the running system: each endpoint family (desktop, dimos, agent, app:<name>) with its endpoint count, calls, errors and calls/s; the busiest endpoints; the zenoh topic count and busiest topics; the running blueprint and its phase",
        role: "context",
        handler: async () => {
            const [{ families, stats }, rates, runs] = await Promise.all([
                sources(),
                desktopJson<Rates>("/api/topics/rates", { optional: true }),
                desktopJson<Runs>("/dimos/runs", { optional: true }),
            ])
            const topics = [...(rates?.topics ?? [])].sort((a, b) => b.hz - a.hz)
            return {
                desktop: desktopUrl(),
                families: Object.entries(families).map(([family, endpoints]) => ({
                    family,
                    endpoints: endpoints.length,
                    ...familyTotals(stats, family),
                })),
                totals: stats?.totals ?? null,
                busiest: busiest(stats),
                topics: {
                    count: topics.length,
                    zenohWebUp: rates?.up ?? false,
                    busiest: topics.slice(0, 5).map(({ topic, type, hz, bps }) => ({ topic, type, hz, bps })),
                },
                running: runs?.launch ??
                    (runs?.runs?.[0] ? { blueprint: runs.runs[0].blueprint, phase: "running" } : null),
            }
        },
    },
    {
        method: "GET",
        path: "api/endpoints",
        description:
            "Endpoints with their live call counts (calls, errors, calls/s, last call, mean ms). family = desktop, dimos, agent or app:<name>; without it, the list of families and their endpoint counts",
        params: {
            family: { type: "string", description: "desktop, dimos, agent, or app:<name> (e.g. app:dim-rerun)" },
            q: { type: "string", description: "only endpoints whose method, path or description contains this" },
        },
        handler: async (args) => {
            const { families, stats } = await sources()
            const family = typeof args.family === "string" ? args.family.trim() : ""
            if (!family) {
                return {
                    families: Object.entries(families).map(([name, list]) => ({
                        family: name,
                        endpoints: list.length,
                    })),
                }
            }
            const list = families[family]
            if (!list) {
                throw new HttpError(404, `no family ${family}; there are: ${Object.keys(families).join(", ")}`)
            }
            const q = typeof args.q === "string" ? args.q.toLowerCase() : ""
            return {
                family,
                endpoints: list
                    .filter((e) => !q || `${e.method} ${e.path} ${e.description}`.toLowerCase().includes(q))
                    .map((e) => withCounts(stats, family, e)),
            }
        },
    },
    {
        method: "GET",
        path: "api/stats",
        description:
            "Desktop's call counts (GET /api/endpoints/stats) trimmed for reading: totals, then each family's busiest endpoints by calls (top per family, default 10), including requests that matched no known endpoint",
        params: {
            family: { type: "string", description: "only this family (desktop, dimos, agent, app:<name>)" },
            top: { type: "number", description: "endpoints per family (default 10)" },
        },
        handler: async (args) => {
            const stats = await desktopJson<Stats>("/api/endpoints/stats")
            const top = number(args.top, 10)
            const only = typeof args.family === "string" && args.family ? args.family : null
            const families: Stats["families"] = {}
            for (const [family, rows] of Object.entries(stats!.families)) {
                if (!only || family === only) {
                    families[family] = [...rows].sort((a, b) => b.calls - a.calls).slice(0, top)
                }
            }
            if (only && !families[only]) {
                throw new HttpError(404, `no calls counted for ${only} yet`)
            }
            return { since: stats!.since, now: stats!.now, totals: stats!.totals, families }
        },
    },
]
