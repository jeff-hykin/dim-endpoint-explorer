// The system as its dimos.yaml files describe it: each component's `provides` endpoints and `uses`, and who uses what.
// Pure functions over what Desktop serves (no fetching here), so they're tested directly (model_test.ts).

export type Param = { type?: string; description?: string; required?: boolean }
export type Endpoint = {
    method: string
    /** the full path from Desktop's origin, e.g. /dimos-gateway/active or /apps/dim-rerun/api/open */
    path: string
    description?: string
    params?: Record<string, Param>
    role?: string
}
export type Use = { method: string; path: string; provider: string | null; endpoint: Endpoint | null }
export type Component = {
    id: string
    title: string
    description: string
    /** where its dimos.yaml came from */
    source: string
    provides: Endpoint[]
    uses: Use[]
    requires: Record<string, string>
    zenohGateway: boolean
    connects: string[]
}

/** GET /api/desktop/dimos.yaml, parsed */
export type DesktopYaml = {
    title?: string
    version?: string
    requires?: Record<string, string>
    agent?: { description?: string; endpoints?: (Endpoint & { app?: string })[] }
}
/** one app: GET /api/apps (title), GET /api/apps/{pkg}/dimos-yaml-check (declared), GET /api/endpoints (its entry) */
export type AppInput = {
    pkg: string
    title?: string
    declared: { file?: string; public: string[]; requires: string[]; zenohGateway?: boolean; connects?: string[] }
    registry?: { description?: string; endpoints: Endpoint[] }
}

export const DESKTOP = "desktop"
export const DIMOS_GATEWAY = "dimos-gateway"
export const AGENT_GATEWAY = "agent-gateway"

const segments = (path: string) => path.split("?")[0].replace(/^\/+|\/+$/g, "").split("/")
const isParam = (part: string) => /^\{.+\}$/.test(part)

/** `/recordings/{id}` matches `/recordings/abc` (a `{…}` segment on either side matches any one segment) */
export function samePath(a: string, b: string): boolean {
    const x = segments(a)
    const y = segments(b)
    return x.length === y.length && x.every((part, i) => part === y[i] || isParam(part) || isParam(y[i]))
}

/** which component a full path belongs to, by its prefix */
export function ownerOf(path: string): string {
    const [first, second] = segments(path)
    if (first === "apps" && second) {
        return second
    }
    if (first === DIMOS_GATEWAY || first === AGENT_GATEWAY) {
        return first
    }
    return DESKTOP
}

const split = (line: string) => {
    const [method, ...rest] = line.trim().split(/\s+/)
    return { method: method.toUpperCase(), path: rest.join(" ") }
}

export function buildComponents(desktop: DesktopYaml | null, apps: AppInput[]): Component[] {
    const builtins = desktop?.agent?.endpoints ?? []
    const clean = ({ method, path, description, params, role }: Endpoint): Endpoint => ({
        method: method.toUpperCase(),
        path,
        ...(description ? { description } : {}),
        ...(params && Object.keys(params).length ? { params } : {}),
        ...(role ? { role } : {}),
    })
    const blank = { uses: [], requires: {}, zenohGateway: false, connects: [] }
    const components: Component[] = []
    if (desktop) {
        components.push({
            ...blank,
            id: DESKTOP,
            title: desktop.title ?? "Desktop",
            description: desktop.agent?.description ?? "",
            source: "GET /api/desktop/dimos.yaml",
            provides: builtins.filter((e) => ownerOf(e.path) === DESKTOP).map(clean),
            requires: desktop.requires ?? {},
        })
        const gateway = builtins.filter((e) => ownerOf(e.path) === DIMOS_GATEWAY).map(clean)
        if (gateway.length) {
            components.push({
                ...blank,
                id: DIMOS_GATEWAY,
                title: "dimos gateway",
                description:
                    "The dimos server Desktop drives, as Desktop's dimos.yaml lists it (the gateway serves none).",
                source: "GET /api/desktop/dimos.yaml",
                provides: gateway,
            })
        }
    }
    for (const app of apps) {
        const described = app.registry?.endpoints ?? []
        components.push({
            id: app.pkg,
            title: app.title ?? app.pkg,
            description: app.registry?.description ?? "",
            source: app.declared.file ?? `GET /api/apps/${app.pkg}/dimos-yaml-check`,
            provides: app.declared.public.map((line) => {
                const { method, path } = split(line)
                const found = described.find((e) => e.method.toUpperCase() === method && samePath(e.path, path))
                return clean({ ...found, method, path: `/apps/${app.pkg}/${path.replace(/^\/+/, "")}` })
            }),
            uses: app.declared.requires.map((line) => ({ ...split(line), provider: null, endpoint: null })),
            requires: {},
            zenohGateway: app.declared.zenohGateway ?? false,
            connects: app.declared.connects ?? [],
        })
    }
    // resolve each use to the component and endpoint that provides it
    const byId = new Map(components.map((c) => [c.id, c]))
    for (const component of components) {
        for (const use of component.uses) {
            const provider = byId.get(ownerOf(use.path))
            use.provider = provider?.id ?? null
            use.endpoint = provider?.provides.find((e) => e.method === use.method && samePath(e.path, use.path)) ??
                null
        }
    }
    return components
}

/** `METHOD path` of a provided endpoint → the ids of the components whose dimos.yaml uses it */
export function usedBy(components: Component[]): Map<string, string[]> {
    const out = new Map<string, string[]>()
    for (const component of components) {
        for (const use of component.uses) {
            if (use.endpoint) {
                const key = `${use.endpoint.method} ${use.endpoint.path}`
                out.set(key, [...(out.get(key) ?? []), component.id])
            }
        }
    }
    return out
}
