// The shapes Desktop serves (dimos-desktop docs/api.md) and the pure joins the agent endpoints answer from: which
// endpoints each family has (Desktop's openapi, the gateway's openapi, the app registry) and their live call counts.

export type Param = { type?: string; description?: string; required?: boolean }
export type RegistryEndpoint = {
    method: string
    path: string
    description?: string
    params?: Record<string, Param>
    role?: string
}
export type RegistryApp = {
    app: string
    title?: string
    description?: string
    source: string
    manifestUrl?: string
    endpoints: RegistryEndpoint[]
}
export type Registry = { apps: RegistryApp[] }

export type Operation = {
    operationId?: string
    summary?: string
    description?: string
    tags?: string[]
    parameters?: { name: string; in: string; required?: boolean; description?: string; schema?: { type?: string } }[]
    requestBody?: unknown
    responses?: Record<string, { description?: string }>
    "x-family"?: string
    "x-mcp-tool"?: string
}
export type OpenApi = {
    openapi: string
    info: { title: string; version?: string; description?: string }
    tags?: { name: string; description?: string; "x-family"?: string }[]
    paths: Record<string, Record<string, Operation>>
}

export type EndpointStat = {
    method: string
    path: string
    calls: number
    errors: number
    lastCall: number | null
    meanMs: number
    perSec: number
    matched?: boolean
}
export type Stats = {
    since: number
    now: number
    totals: { calls: number; errors: number; perSec: number }
    families: Record<string, EndpointStat[]>
}
export type Rates = {
    topics: { topic: string; type: string; hz: number; bps: number; history?: number[] }[]
    up: boolean
}

export type FamilyEndpoint = { method: string; path: string; description: string; params?: Record<string, Param> }
export type CountedEndpoint = FamilyEndpoint & Omit<EndpointStat, "method" | "path"> & { tracked: boolean }

const METHODS = ["get", "post", "put", "patch", "delete"]
const trim = (path: string) => path.replace(/^\/+/, "")

/** `/dimos/blueprints/{name}/config` matches `/dimos/blueprints/go2/config` (leading slashes ignored) */
export function matchesTemplate(template: string, path: string): boolean {
    const want = trim(template).split("/")
    const got = trim(path.split("?")[0]).split("/")
    return want.length === got.length && want.every((part, i) => /^\{.+\}$/.test(part) || part === got[i])
}

/** the openapi's operations as endpoints, keeping those whose family (operation, else first tag) is `family` */
export function openapiEndpoints(doc: OpenApi | null, family?: string, prefix = ""): FamilyEndpoint[] {
    if (!doc) {
        return []
    }
    const tagFamily = new Map((doc.tags ?? []).map((tag) => [tag.name, tag["x-family"]]))
    const out: FamilyEndpoint[] = []
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
        for (const method of METHODS) {
            const op = item[method]
            if (!op) {
                continue
            }
            const opFamily = op["x-family"] ?? tagFamily.get(op.tags?.[0] ?? "")
            if (family && opFamily && opFamily !== family) {
                continue
            }
            const params: Record<string, Param> = {}
            for (const p of op.parameters ?? []) {
                params[p.name] = { type: p.schema?.type, description: p.description, required: p.required }
            }
            out.push({
                method: method.toUpperCase(),
                path: prefix + path,
                description: op.summary ?? op.description ?? "",
                ...(Object.keys(params).length ? { params } : {}),
            })
        }
    }
    return out
}

/** every family's endpoints: desktop + dimos from Desktop's openapi, agent from the gateway's, app:<name> per app */
export function familyEndpoints(
    desktop: OpenApi | null,
    agent: OpenApi | null,
    registry: Registry | null,
): Record<string, FamilyEndpoint[]> {
    const families: Record<string, FamilyEndpoint[]> = {
        desktop: openapiEndpoints(desktop, "desktop"),
        dimos: openapiEndpoints(desktop, "dimos"),
        agent: openapiEndpoints(agent, undefined, "/agent"),
    }
    for (const app of registry?.apps ?? []) {
        if (app.source === "builtin") {
            continue
        }
        families[`app:${app.app}`] = app.endpoints.map(({ method, path, description, params }) => ({
            method,
            path,
            description: description ?? "",
            ...(params ? { params } : {}),
        }))
    }
    return families
}

/** a path as the stats key it: no leading slash, and the gateway's own path for the agent family (it counts `/api/x`, not `/agent/api/x`) */
const norm = (family: string, path: string) => {
    const bare = trim(path.split("?")[0])
    return family === "agent" ? bare.replace(/^agent(\/|$)/, "") : bare
}

/** a family's stats rows that belong to one endpoint: the exact template, else unmatched raw paths that fit it */
export function statsFor(stats: Stats | null, family: string, method: string, path: string): EndpointStat[] {
    const rows = stats?.families?.[family] ?? []
    const want = norm(family, path)
    const exact = rows.filter((row) => row.method === method && norm(family, row.path) === want)
    if (exact.length) {
        return exact
    }
    return rows.filter((row) =>
        row.method === method && row.matched === false && matchesTemplate(want, norm(family, row.path))
    )
}

function latest(times: (number | null)[]): number | null {
    const known = times.filter((time): time is number => typeof time === "number")
    return known.length ? Math.max(...known) : null
}

export function withCounts(stats: Stats | null, family: string, endpoint: FamilyEndpoint): CountedEndpoint {
    const rows = statsFor(stats, family, endpoint.method, endpoint.path)
    const calls = rows.reduce((sum, row) => sum + row.calls, 0)
    return {
        ...endpoint,
        calls,
        errors: rows.reduce((sum, row) => sum + row.errors, 0),
        perSec: Math.round(rows.reduce((sum, row) => sum + row.perSec, 0) * 100) / 100,
        lastCall: latest(rows.map((row) => row.lastCall)),
        meanMs: calls ? Math.round(rows.reduce((sum, row) => sum + row.meanMs * row.calls, 0) / calls * 10) / 10 : 0,
        tracked: rows.length > 0,
    }
}

export function familyTotals(stats: Stats | null, family: string) {
    const rows = stats?.families?.[family] ?? []
    return {
        calls: rows.reduce((sum, row) => sum + row.calls, 0),
        errors: rows.reduce((sum, row) => sum + row.errors, 0),
        perSec: Math.round(rows.reduce((sum, row) => sum + row.perSec, 0) * 100) / 100,
    }
}

/** the busiest endpoints across every family, by total calls */
export function busiest(stats: Stats | null, limit = 8) {
    const all = Object.entries(stats?.families ?? {}).flatMap(([family, rows]) =>
        rows.map(({ method, path, calls, errors, perSec }) => ({ family, method, path, calls, errors, perSec }))
    )
    return all.sort((a, b) => b.calls - a.calls || b.perSec - a.perSec).slice(0, limit)
}
