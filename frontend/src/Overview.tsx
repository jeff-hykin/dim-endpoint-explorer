// Overview: the system as one picture. Every box is a real piece of the running system; every line carries live
// traffic: calls/s from Desktop's call counts, messages/s from zenoh-gateway's topic rates, events/s seen by this page.
import {
    Badge,
    Button,
    Card,
    EmptyState,
    LiveValue,
    LogView,
    Markdown,
    Row,
    Sparkline,
    Stat,
    Table,
    Text,
} from "dimos-react"
import { openApp } from "./dim-app/source/desktop.js"
import { familyRate, formatRate, type RegistryApp, type Runs } from "./desktop.ts"
import { curve, FlowEdge } from "./flow.tsx"
import { type DesktopEvent, useJson, useLive } from "./live.ts"
import type { Section } from "./App.tsx"

type Box = { x: number; y: number; w: number; h: number }
const mid = (x1: number, y1: number, x2: number, y2: number): [number, number] => [(x1 + x2) / 2, (y1 + y2) / 2]

function Node({ box, title, sub, metric, onClick, kind = "", status }: {
    box: Box
    title: string
    sub?: string
    metric?: string
    onClick?: () => void
    kind?: string
    status?: "ok" | "warn" | "off"
}) {
    return (
        <g
            className={`node ${kind} ${onClick ? "clickable" : ""}`}
            onClick={onClick}
            role={onClick ? "button" : undefined}
        >
            <title>{onClick ? `${title}: open its section` : title}</title>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} />
            {status && <circle className={`status ${status}`} cx={box.x + 13} cy={box.y + 16} r={4} />}
            <text className="node-title" x={box.x + (status ? 23 : 12)} y={box.y + 20}>{title}</text>
            {sub && <text className="node-sub" x={box.x + 12} y={box.y + 36}>{sub}</text>}
            {metric && (
                <text className="node-metric" x={box.x + box.w - 10} y={box.y + 20} textAnchor="end">{metric}</text>
            )}
        </g>
    )
}

const DOC_1 =
    "Nobody polls for \"did something change?\". Desktop publishes its events on zenoh, `<ns>/desktop/events/<type>`, and every page hears them over its one zenoh-gateway connection: `apps`, `endpoints`, `runs`, `blueprints`, `endpoint-stats`… This page listens with the SDK's `onDesktopEvent`, which is how these numbers move. Apps' backends push to their pages the same way, through `POST /desktop/frontend/<app>/<topic>`."

export function Overview({ go }: { go: (section: Section, focus?: string) => void }) {
    const live = useLive()
    const { stats, rates } = live
    const registry = useJson<{ apps: RegistryApp[] }>("/api/endpoints", ["endpoints", "apps"])
    const runs = useJson<Runs>("/dimos/runs", ["runs", "dimos"])
    const apps = (registry.data?.apps ?? []).filter((app) => app.source !== "builtin")
    const launch = runs.data?.launch ??
        (runs.data?.runs?.[0] ? { blueprint: runs.data.runs[0].blueprint, phase: "running" } : null)
    const running = launch?.phase === "running"

    const desktopRate = familyRate(stats, "desktop", (row) => row.path !== "/mcp")
    const mcpRate = familyRate(stats, "desktop", (row) => row.path === "/mcp")
    const dimosRate = familyRate(stats, "dimos")
    const agentRate = familyRate(stats, "agent")
    const appRates = new Map(apps.map((app) => [app.app, familyRate(stats, `app:${app.app}`)]))
    const appTotal = [...appRates.values()].reduce((a, b) => a + b, 0)
    const zenohHz = (rates?.topics ?? []).reduce((sum, t) => sum + t.hz, 0)
    const topicCount = rates?.topics.length ?? 0
    const calls = (n: number) => formatRate(n, " calls/s")

    // layout (viewBox 1100 × 650): ports ordered so each one faces what it talks to
    const portal: Box = { x: 20, y: 110, w: 170, h: 54 }
    const shell: Box = { x: 20, y: 250, w: 170, h: 54 }
    const pages: Box = { x: 20, y: 420, w: 170, h: 54 }
    const port = (i: number): Box => ({ x: 362, y: 62 + i * 64, w: 220, h: 44 })
    const [dimosProxy, agentProxy, mcp, api, events, appProxy, zweb] = [0, 1, 2, 3, 4, 5, 6].map(port)
    const dimosServer: Box = { x: 700, y: 59, w: 180, h: 50 }
    const blueprint: Box = { x: 910, y: 51, w: 170, h: 66 }
    const gateway: Box = { x: 700, y: 123, w: 180, h: 50 }
    const shown = apps.slice(0, 5)
    const backend = (i: number): Box => ({ x: 700, y: 300 + i * 50, w: 180, h: 40 })
    const busY = 610
    const R = (b: Box) => [b.x + b.w, b.y + b.h / 2] as const
    const L = (b: Box) => [b.x, b.y + b.h / 2] as const
    const edge = (from: readonly [number, number], to: readonly [number, number]) => ({
        d: curve(from[0], from[1], to[0], to[1]),
        mid: mid(from[0], from[1], to[0], to[1]),
    })

    // nothing running: say what's still here and where to start one (live: Desktop's runs event re-reads /dimos/runs)
    const nothingRunning = runs.data && !runs.data.runs?.length &&
        !(launch && (launch.phase === "running" || launch.phase === "starting"))
    return (
        <>
            {nothingRunning && (
                <EmptyState
                    data-testid="onboard-no-blueprint"
                    icon="robot"
                    title="Nothing is running, so only Desktop's own endpoints are here"
                    message="Launch a blueprint (or a replay, no robot needed) to see its modules' endpoints and topics light up too."
                    actions={
                        <Button variant="primary" onClick={() => openApp("launcher", { kind: "blueprint" })}>
                            Open the Launcher
                        </Button>
                    }
                />
            )}
            <div className="ee-grid ee-grid--stats">
                <Card>
                    <Stat
                        label="calls / s"
                        value={
                            <LiveValue
                                value={stats?.totals.perSec ?? 0}
                                format={(n: number) => formatRate(n, "")}
                            />
                        }
                    />
                    <Sparkline values={live.history.total ?? []} width={110} />
                </Card>
                <Card>
                    <Stat
                        label="calls counted"
                        value={
                            <LiveValue
                                value={stats?.totals.calls ?? 0}
                                format={(n: number) => n.toLocaleString()}
                            />
                        }
                        hint={`${stats?.totals.errors ?? 0} errors`}
                    />
                </Card>
                <Card>
                    <Stat label="zenoh msgs / s" value={<LiveValue value={Math.round(zenohHz)} />} />
                    <Sparkline values={live.history.zenoh ?? []} width={110} color="var(--accent-alt)" />
                </Card>
                <Card>
                    <Stat
                        label="topics"
                        value={topicCount}
                        hint={rates?.up === false ? "zenoh-gateway is down" : "via zenoh-gateway"}
                    />
                </Card>
                <Card>
                    <Stat label="events / s" value={<LiveValue value={live.eventsPerSec} />} />
                    <Sparkline values={live.eventHistory} width={110} color="var(--ok)" />
                </Card>
                <Card>
                    <Stat label="blueprint" value={launch?.blueprint ?? "none"} />
                    <Badge tone={running ? "ok" : launch?.phase === "failed" ? "danger" : "default"}>
                        {launch?.phase ?? "not running"}
                    </Badge>
                </Card>
            </div>

            <Card>
                <svg
                    className="ee-flowmap"
                    viewBox="0 0 1100 650"
                    role="img"
                    aria-label="Data-flow map of the running system"
                >
                    <defs>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2.5" />
                        </filter>
                    </defs>
                    <text className="col-label" x={20} y={36}>BROWSER PAGES</text>
                    <text className="col-label" x={342} y={36}>DESKTOP SERVER · one origin</text>
                    <text className="col-label" x={700} y={36}>BEHIND DESKTOP</text>
                    <rect
                        className="group"
                        x={342}
                        y={46}
                        width={260}
                        height={524}
                        rx={14}
                        onClick={() => go("desktop")}
                    />

                    {/* requests: pages → Desktop */}
                    <FlowEdge {...edge(R(shell), L(api))} rate={desktopRate} />
                    <FlowEdge {...edge(L(events), R(shell))} rate={live.eventsPerSec} kind="event" />
                    <FlowEdge {...edge(L(events), R(pages))} rate={live.eventsPerSec} kind="event" />
                    <FlowEdge {...edge(R(shell), L(dimosProxy))} rate={dimosRate} />
                    <FlowEdge {...edge(R(portal), L(agentProxy))} rate={agentRate} />
                    <FlowEdge {...edge(R(pages), L(appProxy))} rate={appTotal} />
                    <FlowEdge {...edge(L(zweb), R(pages))} rate={0} kind="static" dashed label="WebRTC" />

                    {/* Desktop → the processes behind it */}
                    <FlowEdge {...edge(R(dimosProxy), L(dimosServer))} rate={dimosRate} />
                    <FlowEdge {...edge(R(agentProxy), L(gateway))} rate={agentRate} />
                    <FlowEdge {...edge(L(gateway), R(mcp))} rate={mcpRate} label={mcpRate ? calls(mcpRate) : "MCP"} />
                    <FlowEdge {...edge(R(dimosServer), L(blueprint))} rate={running ? 0.3 : 0} kind="static" />
                    {shown.map((app, i) => {
                        const r = appRates.get(app.app) ?? 0
                        return <FlowEdge key={app.app} {...edge(R(appProxy), L(backend(i)))} rate={r} />
                    })}

                    {/* robot data: blueprint → zenoh → zenoh-gateway */}
                    <line className="bus" x1={342} y1={busY} x2={1080} y2={busY} />
                    <text className="bus-label" x={711} y={busY + 26} textAnchor="middle" onClick={() => go("zenoh")}>
                        zenoh · keys dimos/&lt;topic&gt;/&lt;type&gt; · LCM bytes
                    </text>
                    <FlowEdge
                        d={`M${blueprint.x + 85},${blueprint.y + blueprint.h} L${blueprint.x + 85},${busY}`}
                        mid={[blueprint.x + 85, (blueprint.y + blueprint.h + busY) / 2]}
                        rate={zenohHz}
                        kind="msg"
                        label={formatRate(zenohHz, " msg/s")}
                    />
                    <FlowEdge
                        d={`M${zweb.x + 118},${busY} L${zweb.x + 118},${zweb.y + zweb.h}`}
                        mid={[zweb.x + 118, (zweb.y + zweb.h + busY) / 2 + 4]}
                        rate={zenohHz}
                        kind="msg"
                        label={`${topicCount} topics`}
                    />

                    <Node
                        box={shell}
                        title="Desktop shell"
                        sub="launcher, settings, HUD"
                        onClick={() => go("desktop")}
                    />
                    <Node box={portal} title="Agent portal" sub="chat page, /agent/" onClick={() => go("agent")} />
                    <Node
                        box={pages}
                        title="App pages"
                        sub={`${apps.length} apps, /apps/<name>/`}
                        onClick={() => go("apps")}
                    />
                    <Node
                        box={api}
                        kind="port"
                        title="HTTP API"
                        sub="/api/…"
                        metric={calls(desktopRate)}
                        onClick={() => go("desktop")}
                    />
                    <Node
                        box={events}
                        kind="port"
                        title="Events (zenoh)"
                        sub="<ns>/desktop/events"
                        metric={formatRate(live.eventsPerSec, " ev/s")}
                        onClick={() => go("apps", "events")}
                    />
                    <Node
                        box={dimosProxy}
                        kind="port"
                        title="dimos proxy"
                        sub="/dimos/…"
                        metric={calls(dimosRate)}
                        onClick={() => go("dimos")}
                    />
                    <Node
                        box={agentProxy}
                        kind="port"
                        title="agent proxy"
                        sub="/agent/…"
                        metric={calls(agentRate)}
                        onClick={() => go("agent")}
                    />
                    <Node
                        box={mcp}
                        kind="port"
                        title="MCP"
                        sub="POST /mcp · tools"
                        metric={calls(mcpRate)}
                        onClick={() => go("agent", "mcp")}
                    />
                    <Node
                        box={appProxy}
                        kind="port"
                        title="App proxy"
                        sub="/apps/<name>/…"
                        metric={calls(appTotal)}
                        onClick={() => go("apps")}
                    />
                    <Node
                        box={zweb}
                        kind="port zenoh"
                        title="zenoh-gateway"
                        sub="/zenoh-gateway · /api/topics"
                        metric={formatRate(zenohHz, " msg/s")}
                        onClick={() => go("zenoh")}
                        status={rates?.up ? "ok" : "off"}
                    />
                    <Node box={dimosServer} title="dimos server" sub="unix socket" onClick={() => go("dimos")} />
                    <Node
                        box={blueprint}
                        kind="zenoh"
                        title={launch?.blueprint ?? "no blueprint"}
                        sub={launch ? `phase: ${launch.phase}` : "none running"}
                        status={running ? "ok" : launch ? "warn" : "off"}
                        onClick={() => go("dimos")}
                    />
                    <text className="node-sub" x={blueprint.x + 12} y={blueprint.y + 56}>python modules</text>
                    <Node box={gateway} title="agent gateway" sub="dimcode" onClick={() => go("agent")} />
                    {shown.map((app, i) => (
                        <Node
                            key={app.app}
                            box={backend(i)}
                            kind="app"
                            title={app.title ?? app.app}
                            metric={formatRate(appRates.get(app.app) ?? 0, "/s")}
                            onClick={() => go("apps", app.app)}
                        />
                    ))}
                    {apps.length > shown.length && (
                        <text
                            className="node-sub clickable"
                            x={710}
                            y={backend(shown.length).y + 18}
                            onClick={() => go("apps")}
                        >
                            + {apps.length - shown.length} more apps
                        </text>
                    )}
                    <text className="col-label" x={700} y={290}>APP BACKENDS</text>
                </svg>
                <Row gap={18} wrap>
                    <Text small>
                        <i className="legend-swatch" /> HTTP calls/s (Desktop's call counts)
                    </Text>
                    <Text small>
                        <i className="legend-swatch event" /> events pushed to pages (seen here)
                    </Text>
                    <Text small>
                        <i className="legend-swatch msg" /> zenoh messages/s (zenoh-gateway rates)
                    </Text>
                    <Text small muted>Click any box to open its section.</Text>
                </Row>
            </Card>

            <div className="ee-grid">
                <Card title="1 · Requests go up">
                    <Markdown text="Every page is served by Desktop, on one origin. A page just calls a path; Desktop routes it by prefix and counts it under a *family*:" />
                    <Table
                        compact
                        rowKey="family"
                        rows={FAMILIES}
                        columns={[
                            { key: "prefix", label: "path", render: (row: Family) => <Text mono>{row.prefix}</Text> },
                            { key: "family", label: "family" },
                            { key: "what", label: "served by" },
                        ]}
                    />
                </Card>
                <Card title="2 · Changes come down">
                    <Markdown
                        text={DOC_1}
                    />
                    <Button size="sm" iconRight="arrow-right" onClick={() => go("apps", "events")}>
                        The events contract
                    </Button>
                </Card>
                <Card title="3 · Robot data flows sideways">
                    <Markdown text="The blueprint's modules publish on **zenoh**, not HTTP. Desktop joins zenoh as a peer and embeds **zenoh-gateway**, which hands topics to pages over WebRTC and answers `/api/topics`. Rates here are messages/s, not calls." />
                    <Button size="sm" iconRight="arrow-right" onClick={() => go("zenoh")}>
                        Topics and how zenoh works
                    </Button>
                </Card>
            </div>
            <Activity go={go} />
        </>
    )
}

type Family = { prefix: string; family: string; what: string }
const FAMILIES: Family[] = [
    { prefix: "/api/… /mcp", family: "desktop", what: "Desktop itself" },
    { prefix: "/dimos/…", family: "dimos", what: "the dimos server (unix socket)" },
    { prefix: "/agent/…", family: "agent", what: "the dimcode gateway" },
    { prefix: "/apps/<name>/…", family: "app:<name>", what: "that app's backend" },
]

/** Desktop events as a log (newest first) */
export function EventFeed({ events, empty }: { events: DesktopEvent[]; empty: string }) {
    return (
        <LogView
            height={240}
            follow={false}
            lines={events.length
                ? events.map((event) => ({
                    ts: event.at,
                    text: `${event.type}  ${describeEvent(event)}`,
                    level: event.type === "endpoint-stats" ? "debug" : "info",
                }))
                : [{ text: empty, level: "debug" }]}
        />
    )
}

type BusyRow = { family: string; method: string; path: string; perSec: number; calls: number }

function Activity({ go }: { go: (section: Section, focus?: string) => void }) {
    const { stats, events } = useLive()
    const rows: BusyRow[] = Object.entries(stats?.families ?? {})
        .flatMap(([family, list]) => list.map((row) => ({ family, ...row })))
        .sort((a, b) => b.perSec - a.perSec || b.calls - a.calls)
        .slice(0, 8)
    const section = (family: string): Section =>
        family === "desktop" ? "desktop" : family === "dimos" ? "dimos" : family === "agent" ? "agent" : "apps"
    return (
        <div className="ee-grid ee-grid--wide">
            <Card title="Busiest endpoints right now">
                <Table
                    compact
                    rows={rows}
                    rowKey={(row: BusyRow) => `${row.family} ${row.method} ${row.path}`}
                    onRowClick={(row: BusyRow) => go(section(row.family), row.family.replace(/^app:/, ""))}
                    empty="No calls counted yet."
                    columns={[
                        { key: "family", label: "family", render: (row: BusyRow) => <Badge>{row.family}</Badge> },
                        {
                            key: "path",
                            label: "endpoint",
                            render: (row: BusyRow) => <Text mono>{row.method} {row.path}</Text>,
                        },
                        {
                            key: "perSec",
                            label: "calls/s",
                            align: "right",
                            render: (row: BusyRow) => <LiveValue value={Math.round(row.perSec * 100) / 100} />,
                        },
                        {
                            key: "calls",
                            label: "calls",
                            align: "right",
                            render: (row: BusyRow) => (
                                <LiveValue
                                    value={row.calls}
                                    format={(n: number) => n.toLocaleString()}
                                />
                            ),
                        },
                    ]}
                />
            </Card>
            <Card title="Desktop events, as this page hears them">
                <EventFeed events={events.slice(0, 40)} empty="Waiting for Desktop's events (zenoh)…" />
            </Card>
        </div>
    )
}

export function describeEvent(event: Record<string, unknown>): string {
    switch (event.type) {
        case "endpoint-stats": {
            const changed = (event.changed as { family: string; path: string }[] | undefined) ?? []
            return `${changed.length} endpoint${changed.length === 1 ? "" : "s"} counted: ${
                changed.slice(0, 2).map((c) => `${c.family} ${c.path}`).join(", ")
            }`
        }
        case "endpoints":
            return `${event.app}: +${(event.added as unknown[] | undefined)?.length ?? 0} −${
                (event.removed as unknown[] | undefined)?.length ?? 0
            }`
        case "blueprints":
            return `+${(event.added as unknown[] | undefined)?.length ?? 0} −${
                (event.removed as unknown[] | undefined)?.length ?? 0
            }`
        case "dimos":
            return String((event.event as { type?: string } | undefined)?.type ?? "")
        default:
            return ""
    }
}
