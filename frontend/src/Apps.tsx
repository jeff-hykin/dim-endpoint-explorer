// Apps: every installed app's endpoints from the registry (GET /api/endpoints: dimos.yaml, agent.json or openapi.json),
// with live counts per endpoint. Re-read on the {type:"endpoints"} and {type:"apps"} events, so installing or
// rebuilding an app shows up here without a reload. Also: the frontend ↔ backend events contract.
import { useEffect, useMemo, useState } from "react"
import { ago, countsFor, formatRate, matchesTemplate, type RegistryApp, type RegistryEndpoint } from "./desktop.ts"
import { type DesktopEvent, useJson, useLive, useNow } from "./live.ts"
import { describeEvent } from "./Overview.tsx"
import { Arrow, Doc, Live, Method, Notice, Sparkline, TryIt, unsafeGet } from "./ui.tsx"

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
        const fresh = added.has(id)
        return (
            <div key={id} className={`ep ${open === id ? "open" : ""} ${fresh ? "fresh" : ""}`}>
                <button type="button" className="ep-row" onClick={() => setOpen(open === id ? null : id)}>
                    <Method method={e.method} />
                    <span className="ep-path">{showApp ? <span className="fam">{owner.app}</span> : null}{e.path}</span>
                    <span className="ep-summary">{e.description}</span>
                    {e.role && (
                        <span
                            className="dim-badge info"
                            title={e.role === "view"
                                ? "what screenshot() calls"
                                : "what desktop_context adds while the app is focused"}
                        >
                            {e.role}
                        </span>
                    )}
                    <Sparkline values={live.history[`${family(owner)} ${e.method} ${e.path}`]} width={64} height={18} />
                    <span className="ep-count">
                        <Live value={c.calls} format={(n) => n.toLocaleString()} />
                    </span>
                    {c.errors > 0 && <span className="dim-badge danger">{c.errors} err</span>}
                    <span className="ep-last dim-muted">{ago(c.lastCall, now)}</span>
                </button>
                {open === id && (
                    <div className="ep-doc">
                        <div className="ep-stats">
                            <span>
                                <b>{c.calls.toLocaleString()}</b> calls
                            </span>
                            <span>
                                <b>{c.errors}</b> errors
                            </span>
                            <span>
                                <b>{formatRate(c.perSec)}</b> now
                            </span>
                            <span>
                                mean <b>{c.meanMs.toFixed(1)} ms</b>
                            </span>
                            <span>
                                last call <b>{ago(c.lastCall, now)}</b>
                            </span>
                            <span className="dim-muted">
                                reached at <code>{urlOf(owner, e.path)}</code>
                            </span>
                        </div>
                        {e.description && <p>{e.description}</p>}
                        {e.params && Object.keys(e.params).length > 0 && (
                            <table className="dim-table compact">
                                <thead>
                                    <tr>
                                        <th>param</th>
                                        <th>type</th>
                                        <th>description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(e.params).map(([name, p]) => (
                                        <tr key={name}>
                                            <td className="dim-mono">
                                                {name}
                                                {p.required ? <span className="req">*</span> : null}
                                            </td>
                                            <td className="dim-mono">{p.type}</td>
                                            <td>{p.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
                            <div className="dim-muted small">
                                Not a GET: Try it only calls safe reads. The agent calls this through MCP's
                                call_endpoint.
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="apps">
            <div className="intro">
                <p>
                    Each app is a backend Desktop starts, plus a page served at <code>/apps/&lt;name&gt;/</code>. Its
                    {" "}
                    <code>dimos.yaml</code> (or <code>agent.json</code> /{" "}
                    <code>openapi.json</code>) lists its endpoints; Desktop puts them in one registry, which is what the
                    agent searches and what you see here. Counts come from Desktop's app proxy.
                </p>
            </div>
            {registry.error && <Notice kind="warn">/api/endpoints: {registry.error}</Notice>}
            <div className="apps-grid">
                <nav className="apps-nav">
                    <input
                        className="dim-input"
                        placeholder="Search every app's endpoints"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <label className="dim-check small">
                        <input type="checkbox" checked={builtins} onChange={(e) => setBuiltins(e.target.checked)} />
                        <span className="box" /> include Desktop's builtins
                    </label>
                    {apps.map((a) => {
                        const fam = family(a)
                        const frontend = countsFor(live.stats, fam, "GET", "(frontend)")
                        const rate = (live.stats?.families?.[fam] ?? []).reduce((s, r) => s + r.perSec, 0)
                        return (
                            <button
                                key={a.app}
                                type="button"
                                className={`app-item ${a.app === selected && !q ? "on" : ""}`}
                                onClick={() => {
                                    setSelected(a.app)
                                    setQuery("")
                                }}
                            >
                                <img
                                    className="app-icon"
                                    src={`/api/apps/${encodeURIComponent(a.app)}/icon`}
                                    alt=""
                                    onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                                />
                                <span className="app-text">
                                    <span className="app-title">{a.title ?? a.app}</span>
                                    <span className="dim-muted tiny">
                                        {a.endpoints.length} endpoints · {a.source} · page loads {frontend.calls}
                                    </span>
                                </span>
                                <span className="app-rate">
                                    <Sparkline values={live.history[fam]} width={48} height={16} />
                                    <span className="tiny">{formatRate(rate)}</span>
                                </span>
                            </button>
                        )
                    })}
                    <div className="dim-muted tiny refreshed">
                        registry refreshed by: {registry.refreshedBy ?? "first load"}
                    </div>
                </nav>
                <div className="apps-main">
                    {q && (
                        <div className="endpoints">
                            <div className="dim-muted small">{matches.length} endpoints matching “{query}”</div>
                            {matches.map(({ app: owner, e }) => endpointRow(owner, e, true))}
                        </div>
                    )}
                    {!q && app && (
                        <>
                            <div className="group-doc dim-card">
                                <h3>
                                    {app.title ?? app.app} <span className="dim-muted small dim-mono">{app.app}</span>
                                </h3>
                                {app.description && <p>{app.description}</p>}
                                <div className="dim-muted small">
                                    endpoints from <b>{app.source}</b>
                                    {app.manifestUrl && (
                                        <>
                                            ·{" "}
                                            <a
                                                className="dim-link"
                                                href={app.manifestUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {app.manifestUrl}
                                            </a>
                                        </>
                                    )}
                                    {app.source !== "builtin" && (
                                        <>
                                            · page at{" "}
                                            <a
                                                className="dim-link"
                                                href={`/apps/${app.app}/`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                /apps/{app.app}/
                                            </a>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="endpoints">{app.endpoints.map((e) => endpointRow(app, e))}</div>
                            <UnlistedCalls family={family(app)} listed={app.endpoints} />
                        </>
                    )}
                    {!q && !app && <div className="dim-muted pad">No apps installed.</div>}
                </div>
            </div>
            <EventsContract />
        </div>
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
        <div className="unlisted small dim-muted">
            <span>
                page assets served:{" "}
                <b>
                    <Live value={frontend.calls} />
                </b>{" "}
                (counted as <code>(frontend)</code>)
            </span>
            {rows.length > 0 && (
                <span>
                    · calls to paths the manifest doesn't list:{" "}
                    {rows.map((r) => `${r.method} ${r.path} (${r.calls})`).join(", ")}
                </span>
            )}
        </div>
    )
}

function EventsContract() {
    const { events } = useLive()
    const relevant = events.filter((e: DesktopEvent) => e.type !== "endpoint-stats").slice(0, 8)
    return (
        <div id="events" className="contract">
            <h3 className="docs-h">The frontend ↔ backend events contract</h3>
            <div className="docs-grid">
                <Doc title="How a page hears what changed" open>
                    <svg className="diagram" viewBox="0 0 640 210">
                        <Arrow />
                        {[
                            [10, "app backend", "manifest changes"],
                            [170, "Desktop registry", "re-reads manifests"],
                            [330, "GET /api/events", "one SSE stream"],
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
                            <text x={480} y={144} textAnchor="middle">data: {"{…}"}</text>
                            <path markerEnd="url(#arrow)" className="dline" d="M560,186 L400,186" />
                            <text x={480} y={180} textAnchor="middle">GET /api/endpoints again</text>
                        </g>
                    </svg>
                    <p>
                        Desktop never calls into a page. It keeps <b>one</b> Server-Sent Events stream,{" "}
                        <code>GET /api/events</code>, and writes one JSON object per <code>data:</code> line, typed by
                        {" "}
                        <code>type</code>. A page subscribes with the dim-app SDK, which shares one connection per page
                        and reconnects with backoff (0.5 s doubling to 10 s):
                    </p>
                    <pre className="code-block">
                        {`import { onDesktopEvent } from "dim-app/desktop_events.js"

const off = onDesktopEvent("endpoints", (event) => {
    // event.app, event.added, event.removed
    reloadEndpoints()          // this section does exactly this
})
onDesktopEvent("apps", reloadEndpoints)   // installed, removed, started…
onDesktopEvent("*", (event) => log(event)) // everything`}
                    </pre>
                    <p className="small">
                        A backend uses the same call: in Deno it reads the stream from the Desktop URL its server was
                        given (<code>desktopUrl</code> in <code>DIMOS_APP</code>). For its <em>own</em>{" "}
                        pages, an app backend has a second channel: the SDK's websocket (<code>dim-app/ws</code>,{" "}
                        <code>dimApp.send()</code>).
                    </p>
                </Doc>
                <Doc title="The standard events" open>
                    <table className="dim-table compact">
                        <tbody>
                            <tr>
                                <td>
                                    <code>apps</code>
                                </td>
                                <td>an app was installed, removed, updated, started or stopped</td>
                            </tr>
                            <tr>
                                <td>
                                    <code>endpoints</code>
                                </td>
                                <td>
                                    an app's endpoints changed: <code>app, added, removed</code>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <code>blueprints</code>
                                </td>
                                <td>
                                    the blueprint list changed (file watcher): <code>added, removed</code>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <code>runs</code>
                                </td>
                                <td>a blueprint run started or stopped</td>
                            </tr>
                            <tr>
                                <td>
                                    <code>dimos</code>
                                </td>
                                <td>the dimos server's launch / log / upload events</td>
                            </tr>
                            <tr>
                                <td>
                                    <code>notification</code>
                                </td>
                                <td>
                                    a new notification (the SDK's <code>notify()</code> posts them)
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <code>ui-settings</code>
                                </td>
                                <td>a shared setting changed</td>
                            </tr>
                            <tr>
                                <td>
                                    <code>endpoint-stats</code>
                                </td>
                                <td>
                                    call counts changed: <code>totals, changed[]</code>, at most once a second
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="dim-label" style={{ marginTop: 12 }}>
                        heard by this page (endpoint-stats hidden)
                    </div>
                    <ul className="event-feed">
                        {relevant.map((event, i) => (
                            <li key={`${event.at}-${i}`}>
                                <span className="dim-mono dim-muted">
                                    {new Date(event.at).toLocaleTimeString([], { hour12: false })}
                                </span>
                                <span className={`ev ev-${event.type}`}>{event.type}</span>
                                <span className="dim-muted ev-detail">{describeEvent(event)}</span>
                            </li>
                        ))}
                        {!relevant.length && (
                            <li className="dim-muted">Nothing yet: install or rebuild an app, or start a blueprint.</li>
                        )}
                    </ul>
                </Doc>
            </div>
        </div>
    )
}
