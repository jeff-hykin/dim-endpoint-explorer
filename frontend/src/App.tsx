// Endpoint Explorer: every component's dimos.yaml (Desktop, the dimos gateway, each app): what it provides, what it uses,
// and who uses each endpoint. #<component id> opens one directly.
import { useEffect, useMemo, useState } from "react"
import {
    Alert,
    AppShell,
    Badge,
    type BadgeTone,
    Button,
    Heading,
    List,
    ListRow,
    Panel,
    Row,
    SearchInput,
    Table,
    Text,
    TopBar,
} from "dimos-react"
import { parse } from "yaml"
import {
    type AppInput,
    buildComponents,
    type Component,
    type DesktopYaml,
    type Endpoint,
    ownerOf,
    usedBy,
} from "./model.ts"

async function get(path: string): Promise<string> {
    const response = await fetch(path, { signal: AbortSignal.timeout(10_000) })
    const text = await response.text()
    if (!response.ok) {
        throw new Error(`${path}: ${response.status} ${text.slice(0, 200)}`)
    }
    return text
}

/** every dimos.yaml Desktop serves: its own, and each app's (as /api/apps/{pkg}/dimos-yaml-check + /api/endpoints) */
async function load(): Promise<{ components: Component[]; errors: string[] }> {
    const errors: string[] = []
    const soft = <T,>(promise: Promise<T>): Promise<T | null> =>
        promise.catch((error) => {
            errors.push(String(error instanceof Error ? error.message : error))
            return null
        })
    const [desktop, appList, registry] = await Promise.all([
        soft(get("/api/desktop/dimos.yaml").then((text) => parse(text) as DesktopYaml)),
        soft(
            get("/api/apps").then((text) =>
                JSON.parse(text).apps as { pkg: string; title?: string; builtin?: boolean }[]
            ),
        ),
        soft(get("/api/endpoints").then((text) => JSON.parse(text).apps as ({ app: string } & AppInput["registry"])[])),
    ])
    const apps = await Promise.all(
        (appList ?? []).filter((app) => !app.builtin).map(async (app): Promise<AppInput | null> => {
            const check = await soft(get(`/api/apps/${encodeURIComponent(app.pkg)}/dimos-yaml-check`))
            return check === null ? null : {
                pkg: app.pkg,
                title: app.title,
                declared: JSON.parse(check).declared,
                registry: registry?.find((entry) => entry.app === app.pkg),
            }
        }),
    )
    return { components: buildComponents(desktop, apps.filter((app) => app !== null)), errors }
}

const METHOD_TONES: Record<string, BadgeTone> = {
    GET: "info",
    POST: "ok",
    PUT: "warn",
    PATCH: "warn",
    DELETE: "danger",
}
const Method = ({ method }: { method: string }) => (
    <Badge tone={METHOD_TONES[method] ?? "default"} solid>{method}</Badge>
)
const readHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, ""))
const standalone = globalThis.top === globalThis.self

export function App() {
    const [data, setData] = useState<{ components: Component[]; errors: string[] } | null>(null)
    const [loading, setLoading] = useState(false)
    const [selected, setSelected] = useState(readHash)
    const [query, setQuery] = useState("")
    const [open, setOpen] = useState<string | null>(null)
    const reload = () => {
        setLoading(true)
        load().then(setData).finally(() => setLoading(false))
    }
    useEffect(() => {
        reload()
        const onHash = () => setSelected(readHash())
        addEventListener("hashchange", onHash)
        return () => removeEventListener("hashchange", onHash)
    }, [])
    const components = data?.components ?? []
    const users = useMemo(() => usedBy(components), [data])
    const q = query.trim().toLowerCase()
    const matches = (e: { method: string; path: string; description?: string }) =>
        !q || `${e.method} ${e.path} ${e.description ?? ""}`.toLowerCase().includes(q)
    const shown = components.filter((c) =>
        !q || `${c.id} ${c.title}`.toLowerCase().includes(q) || c.provides.some(matches) || c.uses.some(matches)
    )
    const current = components.find((c) => c.id === selected) ?? shown[0] ?? null
    const title = (id: string | null) => components.find((c) => c.id === id)?.title ?? id ?? "?"
    const go = (id: string) => (location.hash = id)
    const link = (id: string) => (
        <Badge key={id} className="ee-link" onClick={() => go(id)} title={`open ${id}`}>{title(id)}</Badge>
    )

    const provided = (e: Endpoint) => {
        const key = `${e.method} ${e.path}`
        const who = users.get(key) ?? []
        return (
            <div key={key}>
                <ListRow
                    icon={<Method method={e.method} />}
                    title={<Text mono>{e.path}</Text>}
                    subtitle={e.description}
                    selected={open === key}
                    onClick={() => setOpen(open === key ? null : key)}
                    meta={
                        <Row gap={6}>
                            {e.role && <Badge tone="info">{e.role}</Badge>}
                            {who.length > 0 && <Text small muted>used by {who.length}</Text>}
                        </Row>
                    }
                />
                {open === key && (
                    <div className="ee-endpoint-doc">
                        {e.params && (
                            <Table
                                compact
                                rowKey="name"
                                rows={Object.entries(e.params).map(([name, p]) => ({ name, ...p }))}
                                columns={[
                                    {
                                        key: "name",
                                        label: "param",
                                        render: (p) => <Text mono>{p.name}{p.required ? "*" : ""}</Text>,
                                    },
                                    { key: "type", label: "type", render: (p) => <Text mono>{p.type ?? ""}</Text> },
                                    { key: "description", label: "description" },
                                ]}
                            />
                        )}
                        <Row gap={6} wrap>
                            <Text small muted>{who.length ? "used by" : "no dimos.yaml uses it"}</Text>
                            {who.map(link)}
                        </Row>
                    </div>
                )}
            </div>
        )
    }

    return (
        <AppShell
            topBar={
                <TopBar
                    title={standalone ? "Endpoint Explorer" : undefined}
                    icon={standalone ? "activity" : undefined}
                    right={<Button size="sm" icon="refresh" loading={loading} onClick={reload}>Reload</Button>}
                />
            }
        >
            <div className="ee-content">
                {data?.errors.map((error) => <Alert key={error} tone="warn">{error}</Alert>)}
                <div className="ee-split">
                    <nav className="ee-split__nav">
                        <SearchInput placeholder="Search endpoints" value={query} onChange={setQuery} />
                        <List>
                            {shown.map((c) => (
                                <ListRow
                                    key={c.id}
                                    title={c.title}
                                    subtitle={`${c.provides.length} provided · ${c.uses.length} used`}
                                    selected={c.id === current?.id}
                                    onClick={() => go(c.id)}
                                />
                            ))}
                        </List>
                    </nav>
                    {current && (
                        <div className="ee-split__main">
                            <Heading level={1}>{current.title}</Heading>
                            {current.description && <Text as="p">{current.description}</Text>}
                            <Row gap={6} wrap>
                                <Text small muted>
                                    dimos.yaml: <Text mono>{current.source}</Text>
                                </Text>
                                {Object.entries(current.requires).map(([name, range]) => (
                                    <Badge key={name}>requires {name} {range}</Badge>
                                ))}
                                {current.zenohGateway && <Badge>uses zenoh-gateway</Badge>}
                                {current.connects.map((url) => <Badge key={url}>connects {url}</Badge>)}
                            </Row>
                            <Panel title={`Provides (${current.provides.length})`}>
                                {current.provides.length
                                    ? <List>{current.provides.filter(matches).map(provided)}</List>
                                    : <Text muted>Its dimos.yaml provides no endpoints.</Text>}
                            </Panel>
                            <Panel title={`Uses (${current.uses.length})`}>
                                {current.uses.length
                                    ? (
                                        <List>
                                            {current.uses.filter(matches).map((use) => (
                                                <ListRow
                                                    key={`${use.method} ${use.path}`}
                                                    icon={<Method method={use.method} />}
                                                    title={<Text mono>{use.path}</Text>}
                                                    subtitle={use.endpoint?.description ??
                                                        (use.provider
                                                            ? `not in ${title(use.provider)}'s dimos.yaml`
                                                            : `${ownerOf(use.path)} has no dimos.yaml`)}
                                                    meta={use.provider ? link(use.provider) : null}
                                                />
                                            ))}
                                        </List>
                                    )
                                    : <Text muted>Its dimos.yaml uses no endpoints.</Text>}
                            </Panel>
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    )
}
