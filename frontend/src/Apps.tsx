// Apps: every installed app's endpoints from the registry (GET /api/endpoints: dimos.yaml, agent.json or openapi.json),
// with live counts per endpoint. Re-read on the {type:"endpoints"} and {type:"apps"} events, so installing or
// rebuilding an app shows up here without a reload. Also: the frontend ↔ backend events contract.
import { useEffect, useMemo, useState } from "react"
import {
    Alert,
    Badge,
    Card,
    Checkbox,
    CodeBlock,
    Heading,
    Label,
    Link,
    List,
    ListRow,
    LiveValue,
    Markdown,
    Row,
    SearchInput,
    Sparkline,
    Table,
    Text,
} from "dimos-react"
import { EndpointStats } from "./ApiSection.tsx"
import { ago, countsFor, formatRate, matchesTemplate, type RegistryApp, type RegistryEndpoint } from "./desktop.ts"
import { useJson, useLive, useNow } from "./live.ts"
import { EventFeed } from "./Overview.tsx"
import { Arrow, Doc, Method, ParamTable, TryIt, unsafeGet } from "./ui.tsx"

export function AppsSection({ focus }: { focus?: string }) {
    const live = useLive()
    const now = useNow()
    const registry = useJson<{ apps: RegistryApp[] }>("/api/endpoints", ["endpoints", "apps"])
    const [builtins, setBuiltins] = useState(false)
    const [query, setQuery] = useState("")
    const [selected, setSelected] = useState<string | null>(focus && focus !== "events" ? focus : null)
    const [open, setOpen] = useState<string | null>(null)
    const added = useAddedEndpoints()
    const apps = (registry.data?.apps ?? []).filter((app) => builtins || app.source !== "builtin")
    useEffect(() => {
        if (focus && focus !== "events") {
            setSelected(focus)
        }
        if (focus === "events") {
            document.getElementById("events")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
    }, [focus])
    useEffect(() => {
        if (!selected && apps.length) {
            setSelected(apps[0].app)
        }
    }, [apps.length])
    const family = (app: RegistryApp) => (app.source === "builtin" ? "desktop" : `app:${app.app}`)
    const urlOf = (app: RegistryApp, path: string) => (path.startsWith("/") ? path : `/apps/${app.app}/${path}`)
    const q = query.trim().toLowerCase()
    const matches = useMemo(
        () =>
            q
                ? apps.flatMap((app) =>
                    app.endpoints
                        .filter((e) =>
                            `${app.app} ${e.method} ${e.path} ${e.description ?? ""}`.toLowerCase().includes(q)
                        )
                        .map((e) => ({ app, e }))
                )
                : [],
        [q, registry.data, builtins],
    )
    const app = apps.find((a) => a.app === selected) ?? null

    const endpointRow = (owner: RegistryApp, e: RegistryEndpoint, showApp = false) => {
        const id = `${owner.app} ${e.method} ${e.path}`
        const c = countsFor(live.stats, family(owner), e.method, e.path)
        return (
            <div key={id} className={added.has(id) ? "ee-endpoint-fresh" : undefined}>
                <ListRow
                    icon={<Method method={e.method} />}
                    title={
                        <Row gap={8}>
                            {showApp ? <Badge>{owner.app}</Badge> : null}
                            <Text mono>{e.path}</Text>
                        </Row>
                    }
                    subtitle={e.description}
                    selected={open === id}
                    onClick={() => setOpen(open === id ? null : id)}
                    meta={
                        <Row gap={8}>
                            {e.role && (
                                <Badge
                                    tone="info"
                                    title={e.role === "view"
                                        ? "what screenshot() calls"
                                        : "what desktop_context adds while the app is focused"}
                                >
                                    {e.role}
                                </Badge>
                            )}
                            <Sparkline
                                values={live.history[`${family(owner)} ${e.method} ${e.path}`] ?? []}
                                width={64}
                                height={18}
                            />
                            <Text mono>
                                <LiveValue value={c.calls} format={(n: number) => n.toLocaleString()} />
                            </Text>
                            {c.errors > 0 && <Badge tone="danger">{c.errors} err</Badge>}
                            <Text small muted>{ago(c.lastCall, now)}</Text>
                        </Row>
                    }
                />
                {open === id && (
                    <div className="ee-endpoint-doc">
                        <EndpointStats
                            counts={c}
                            now={now}
                            extra={
                                <Text small muted>
                                    reached at <Text mono>{urlOf(owner, e.path)}</Text>
                                </Text>
                            }
                        />
                        {e.description && <Text as="p">{e.description}</Text>}
                        {e.params && Object.keys(e.params).length > 0 && (
                            <ParamTable rows={Object.entries(e.params).map(([name, p]) => ({ name, ...p }))} />
                        )}
                        {e.method === "GET" && !unsafeGet(e.path) && (
                            <TryIt
                                url={urlOf(owner, e.path)}
                                params={Object.entries(e.params ?? {}).map(([name, p]) => ({
                                    name,
                                    in: e.path.includes(`{${name}}`) ? "path" as const : "query" as const,
                                    required: p.required,
                                    description: p.description,
                                }))}
                            />
                        )}
                        {e.method !== "GET" && (
                            <Text small muted>
                                Not a GET: Try it only calls safe reads. The agent calls this through MCP's
                                call_endpoint.
                            </Text>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <>
            <Card>
                <Markdown text="Each app is a backend Desktop starts, plus a page served at `/apps/<name>/`. Its `dimos.yaml` (or `agent.json` / `openapi.json`) lists its endpoints; Desktop puts them in one registry, which is what the agent searches and what you see here. Counts come from Desktop's app proxy." />
            </Card>
            {registry.error && <Alert tone="warn">/api/endpoints: {registry.error}</Alert>}
            <div className="ee-split">
                <nav className="ee-split__nav">
                    <SearchInput placeholder="Search every app's endpoints" value={query} onChange={setQuery} />
                    <Checkbox value={builtins} onChange={setBuiltins} label="include Desktop's builtins" />
                    <List>
                        {apps.map((a) => {
                            const fam = family(a)
                            const frontend = countsFor(live.stats, fam, "GET", "(frontend)")
                            const rate = (live.stats?.families?.[fam] ?? []).reduce((s, r) => s + r.perSec, 0)
                            return (
                                <ListRow
                                    key={a.app}
                                    icon={
                                        <img
                                            className="ee-app-icon"
                                            src={`/api/apps/${encodeURIComponent(a.app)}/icon`}
                                            alt=""
                                            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                                        />
                                    }
                                    title={a.title ?? a.app}
                                    subtitle={`${a.endpoints.length} endpoints · ${a.source} · page loads ${frontend.calls}`}
                                    meta={
                                        <Row gap={6}>
                                            <Sparkline values={live.history[fam] ?? []} width={48} height={16} />
                                            <Text small>{formatRate(rate)}</Text>
                                        </Row>
                                    }
                                    selected={a.app === selected && !q}
                                    onClick={() => {
                                        setSelected(a.app)
                                        setQuery("")
                                    }}
                                />
                            )
                        })}
                    </List>
                    <Text small muted>registry refreshed by: {registry.refreshedBy ?? "first load"}</Text>
                </nav>
                <div className="ee-split__main">
                    {q && (
                        <>
                            <Text small muted>{matches.length} endpoints matching “{query}”</Text>
                            <List>{matches.map(({ app: owner, e }) => endpointRow(owner, e, true))}</List>
                        </>
                    )}
                    {!q && app && (
                        <>
                            <Card
                                title={
                                    <Row gap={8} align="baseline">
                                        {app.title ?? app.app}
                                        <Text mono small muted>{app.app}</Text>
                                    </Row>
                                }
                            >
                                {app.description && <Text as="p">{app.description}</Text>}
                                <Text small muted>
                                    endpoints from <b>{app.source}</b>
                                    {app.manifestUrl && (
                                        <>
                                            {" · "}
                                            <Link href={app.manifestUrl} target="_blank" rel="noreferrer">
                                                {app.manifestUrl}
                                            </Link>
                                        </>
                                    )}
                                    {app.source !== "builtin" && (
                                        <>
                                            {" · page at "}
                                            <Link href={`/apps/${app.app}/`} target="_blank" rel="noreferrer">
                                                /apps/{app.app}/
                                            </Link>
                                        </>
                                    )}
                                </Text>
                            </Card>
                            <List>{app.endpoints.map((e) => endpointRow(app, e))}</List>
                            <UnlistedCalls family={family(app)} listed={app.endpoints} />
                        </>
                    )}
                    {!q && !app && <Text muted>No apps installed.</Text>}
                </div>
            </div>
            <EventsContract />
        </>
    )
}

/** endpoints added by the last few {type:"endpoints"} events, so they can glow for a moment */
function useAddedEndpoints(): Set<string> {
    const { events } = useLive()
    const now = useNow()
    const ids = new Set<string>()
    for (const event of events) {
        if (event.type === "endpoints" && now - event.at < 8000) {
            for (const e of (event.added as RegistryEndpoint[] | undefined) ?? []) {
                ids.add(`${event.app} ${e.method} ${e.path}`)
            }
        }
    }
    return ids
}

function UnlistedCalls({ family, listed }: { family: string; listed: RegistryEndpoint[] }) {
    const { stats } = useLive()
    const rows = (stats?.families?.[family] ?? []).filter(
        (row) =>
            row.path !== "(frontend)" &&
            !listed.some((e) => e.method === row.method && matchesTemplate(e.path, row.path)),
    )
    const frontend = countsFor(stats, family, "GET", "(frontend)")
    return (
        <Text small muted>
            page assets served:{" "}
            <b>
                <LiveValue value={frontend.calls} />
            </b>{" "}
            (counted as <Text mono>(frontend)</Text>)
            {rows.length > 0 && (
                <>
                    {" "}· calls to paths the manifest doesn't list:{" "}
                    {rows.map((r) => `${r.method} ${r.path} (${r.calls})`).join(", ")}
                </>
            )}
        </Text>
    )
}

const STANDARD_EVENTS: { type: string; meaning: string }[] = [
    { type: "apps", meaning: "an app was installed, removed, updated, started or stopped" },
    { type: "endpoints", meaning: "an app's endpoints changed: `app, added, removed`" },
    { type: "blueprints", meaning: "the blueprint list changed (file watcher): `added, removed`" },
    { type: "runs", meaning: "a blueprint run started or stopped" },
    { type: "dimos", meaning: "the dimos server's launch / log / upload events" },
    { type: "notification", meaning: "a new notification (the SDK's `notify()` posts them)" },
    { type: "ui-settings", meaning: "a shared setting changed" },
    { type: "endpoint-stats", meaning: "call counts changed: `totals, changed[]`, at most once a second" },
]

const EVENTS_EXAMPLE = `import { onDesktopEvent, onDesktopReconnect } from "./dim-app/mod.js"

const off = onDesktopEvent("endpoints", (event) => {
    // event.app, event.added, event.removed
    reloadEndpoints()          // this section does exactly this
})
onDesktopEvent("apps", reloadEndpoints)   // installed, removed, started…
onDesktopEvent("*", (event) => log(event)) // everything
onDesktopReconnect(reloadEndpoints)       // events sent while the link was down are gone`

function EventsContract() {
    const { events } = useLive()
    const relevant = events.filter((e) => e.type !== "endpoint-stats").slice(0, 20)
    return (
        <div id="events">
            <Heading level={2}>The frontend ↔ backend events contract</Heading>
            <div className="ee-grid ee-grid--wide">
                <Doc title="How a page hears what changed" open>
                    <svg className="ee-diagram" viewBox="0 0 640 210">
                        <Arrow />
                        {[
                            [10, "app backend", "manifest changes"],
                            [170, "Desktop registry", "re-reads manifests"],
                            [330, "zenoh-gateway", "<ns>/desktop/events/*"],
                            [490, "your page", "onDesktopEvent()"],
                        ].map(([x, title, sub]) => (
                            <g key={String(title)} className="dnode">
                                <rect x={Number(x)} y={10} width={140} height={44} rx={8} />
                                <text x={Number(x) + 70} y={29} textAnchor="middle" className="node-title">
                                    {title}
                                </text>
                                <text x={Number(x) + 70} y={44} textAnchor="middle" className="node-sub">{sub}</text>
                                <line className="lifeline" x1={Number(x) + 70} y1={54} x2={Number(x) + 70} y2={200} />
                            </g>
                        ))}
                        <g className="seq">
                            <path markerEnd="url(#arrow)" className="dline" d="M80,82 L240,82" />
                            <text x={160} y={76} textAnchor="middle">manifest changed</text>
                            <path markerEnd="url(#arrow)" className="dline event" d="M240,116 L400,116" />
                            <text x={320} y={110} textAnchor="middle">{`{type:"endpoints", app, added, removed}`}</text>
                            <path markerEnd="url(#arrow)" className="dline event" d="M400,150 L560,150" />
                            <text x={480} y={144} textAnchor="middle">WebRTC sample {"{…}"}</text>
                            <path markerEnd="url(#arrow)" className="dline" d="M560,186 L400,186" />
                            <text x={480} y={180} textAnchor="middle">GET /api/endpoints again</text>
                        </g>
                    </svg>
                    <Markdown text="The rule: a page **asks** over HTTP and **hears** over zenoh. Desktop publishes each event on `<ns>/desktop/events/<type>` (JSON, typed by `type`; the dimos server's on `<ns>/dimos/events/<type>`), and the page hears it through Desktop's zenoh-gateway on its **one** zenoh-gateway connection (dim-app's `getZenoh()`; the namespace comes from `GET /api/desktop/zenoh`). Snapshot + live: GET first, apply the events, GET again when the connection comes back. No SSE, no websockets, no polling:" />
                    <CodeBlock code={EVENTS_EXAMPLE} language="js" />
                    <Markdown text="An app's *own* backend pushes to its pages the same way: one HTTP call to Desktop's relay, `POST /desktop/frontend/<app>/<topic>` (any language; dim-app's `publishFrontend(topic, payload)`), which publishes the body on `<ns>/apps/<app>/frontend/<topic>`; a Rust or Python backend with zenoh may publish there itself (`zenohPrefix` in `DIMOS_APP`). The page subscribes with `getZenoh().subscribeFrontend(topic, cb)`, or for state the agent can change, `useBackendState(key)`: it GETs, and re-GETs when the backend's `stateChanged(key)` publishes `{key, version}` on `state/<key>`." />
                </Doc>
                <Doc title="The standard events" open>
                    <Table
                        compact
                        rowKey="type"
                        rows={STANDARD_EVENTS}
                        columns={[
                            {
                                key: "type",
                                label: "type",
                                render: (row) => <Text mono>{row.type}</Text>,
                            },
                            {
                                key: "meaning",
                                label: "when",
                                render: (row) => <Markdown text={row.meaning} inline />,
                            },
                        ]}
                    />
                    <Label>heard by this page (endpoint-stats hidden)</Label>
                    <EventFeed
                        events={relevant}
                        empty="Nothing yet: install or rebuild an app, or start a blueprint."
                    />
                </Doc>
            </div>
        </div>
    )
}
