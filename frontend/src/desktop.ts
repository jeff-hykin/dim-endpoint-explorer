// Desktop's APIs as the page reads them: same origin (the page lives at /apps/dim-endpoint-explorer/), so absolute
// paths reach Desktop directly. Shapes: dimos-desktop docs/api.md and the IcyStingray design.
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
export type OpenApiParam = {
    name: string
    in: string
    required?: boolean
    description?: string
    schema?: { type?: string }
}
export type Operation = {
    operationId?: string
    summary?: string
    description?: string
    tags?: string[]
    parameters?: OpenApiParam[]
    requestBody?: { content?: Record<string, { schema?: unknown; example?: unknown }>; description?: string }
    responses?: Record<string, { description?: string }>
    "x-family"?: string
    "x-mcp-tool"?: string
}
export type OpenApi = {
    openapi: string
    info: { title: string; version?: string; description?: string }
    servers?: { url: string }[]
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
export type Topic = { topic: string; type: string; hz: number; bps: number; history?: number[] }
export type Rates = { topics: Topic[]; up: boolean }
export type Launch = {
    blueprint: string
    phase: string
    startedAt?: string
    runId?: string | null
    error?: string | null
}
export type Runs = {
    runs: { runId: string; blueprint: string; pid: number; startedAt: string }[]
    launch: Launch | null
}
export type McpTool = {
    name: string
    description?: string
    inputSchema?: { properties?: Record<string, Param>; required?: string[] }
}

export class DesktopError extends Error {
    constructor(public status: number, message: string) {
        super(message)
    }
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) })
    const text = await response.text()
    let data: unknown = null
    try {
        data = JSON.parse(text)
    } catch {
        data = text
    }
    if (!response.ok) {
        const message = (data as { error?: string })?.error ?? `${response.status} ${response.statusText}`
        throw new DesktopError(response.status, message)
    }
    return data as T
}

export const mcpTools = () =>
    getJson<{ result?: { tools: McpTool[] }; error?: { message: string } }>("/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })

const trim = (path: string) => path.replace(/^\/+/, "")

/** `/dimos/blueprints/{name}` matches `/dimos/blueprints/go2` */
export function matchesTemplate(template: string, path: string): boolean {
    const want = trim(template).split("/")
    const got = trim(path.split("?")[0]).split("/")
    return want.length === got.length && want.every((part, i) => /^\{.+\}$/.test(part) || part === got[i])
}

export type Counts = {
    calls: number
    errors: number
    perSec: number
    lastCall: number | null
    meanMs: number
    tracked: boolean
}

/** one endpoint's live counts: the stats rows for its template, plus unmatched raw paths that fit it */
export function countsFor(stats: Stats | null, family: string, method: string, path: string): Counts {
    const rows = stats?.families?.[family] ?? []
    let mine = rows.filter((row) => row.method === method && trim(row.path) === trim(path))
    if (!mine.length) {
        const bare = path.replace(/^\/agent/, "")
        mine = rows.filter((row) =>
            row.method === method && row.matched === false &&
            (matchesTemplate(path, row.path) || matchesTemplate(bare, row.path.replace(/^\/agent/, "")))
        )
    }
    const calls = mine.reduce((sum, row) => sum + row.calls, 0)
    const lasts = mine.map((row) => row.lastCall).filter((t): t is number => typeof t === "number")
    return {
        calls,
        errors: mine.reduce((sum, row) => sum + row.errors, 0),
        perSec: mine.reduce((sum, row) => sum + row.perSec, 0),
        lastCall: lasts.length ? Math.max(...lasts) : null,
        meanMs: calls ? mine.reduce((sum, row) => sum + row.meanMs * row.calls, 0) / calls : 0,
        tracked: mine.length > 0,
    }
}

export function familyRate(stats: Stats | null, family: string, filter?: (row: EndpointStat) => boolean): number {
    return (stats?.families?.[family] ?? []).filter(filter ?? (() => true)).reduce((sum, row) => sum + row.perSec, 0)
}

/** the openapi operations in `family` (operation's x-family, else its first tag's) */
export function operations(doc: OpenApi | null, family?: string) {
    const tagFamily = new Map((doc?.tags ?? []).map((tag) => [tag.name, tag["x-family"]]))
    const out: { method: string; path: string; op: Operation; tag: string }[] = []
    for (const [path, item] of Object.entries(doc?.paths ?? {})) {
        for (const method of ["get", "post", "put", "patch", "delete"]) {
            const op = item[method]
            if (!op) {
                continue
            }
            const tag = op.tags?.[0] ?? "Other"
            const opFamily = op["x-family"] ?? tagFamily.get(tag)
            if (family && opFamily && opFamily !== family) {
                continue
            }
            out.push({ method: method.toUpperCase(), path, op, tag })
        }
    }
    return out
}

export function formatRate(n: number, unit = "/s"): string {
    if (!n) {
        return `0${unit}`
    }
    return `${n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2).replace(/0$/, "")}${unit}`
}

export function formatBytes(n: number): string {
    const units = ["B", "KB", "MB", "GB"]
    let i = 0
    while (n >= 1000 && i < units.length - 1) {
        n /= 1000
        i++
    }
    return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`
}

export function ago(time: number | null, now = Date.now()): string {
    if (!time) {
        return "never"
    }
    const s = Math.max(0, Math.round((now - time) / 1000))
    return s < 2
        ? "just now"
        : s < 60
        ? `${s}s ago`
        : s < 3600
        ? `${Math.round(s / 60)}m ago`
        : `${Math.round(s / 3600)}h ago`
}
