// The Desktop, dimos server and agent gateway sections: each is its OpenAPI document (ApiSection) plus the live state
// and docs that belong to it.
import { useEffect, useState } from "react"
import { ApiSection } from "./ApiSection.tsx"
import { countsFor, getJson, type McpTool, mcpTools, type OpenApi, type Runs } from "./desktop.ts"
import { useJson, useLive } from "./live.ts"
import { Live, Notice } from "./ui.tsx"

export function DesktopSection() {
    const doc = useJson<OpenApi>("/api/desktop/openapi", ["apps"])
    const [yaml, setYaml] = useState<string | null>(null)
    const [showYaml, setShowYaml] = useState(false)
    useEffect(() => {
        if (showYaml && yaml === null) {
            fetch("/api/desktop/dimos.yaml").then((r) => r.ok ? r.text() : `# ${r.status} ${r.statusText}`).then(
                setYaml,
                (e) => setYaml(`# ${e.message}`),
            )
        }
    }, [showYaml])
    return (
        <ApiSection
            doc={doc.data}
            error={doc.error}
            family="desktop"
            docFamily="desktop"
            source="/api/desktop/openapi"
            aside={
                <div className="intro">
                    <p>
                        Desktop is one Rust process. It serves the shell, every app's page and these endpoints on one
                        origin, so any page can <code>fetch("/api/…")</code> without CORS. Its own manifest, the same
                        {" "}
                        <code>dimos.yaml</code> shape every app has, lists them for the agent.
                    </p>
                    <div className="row-gap">
                        <a className="dim-btn sm" href="/api/desktop/dimos.yaml" target="_blank" rel="noreferrer">
                            Desktop's dimos.yaml ↗
                        </a>
                        <button type="button" className="dim-btn sm ghost" onClick={() => setShowYaml(!showYaml)}>
                            {showYaml ? "Hide" : "Show"} it here
                        </button>
                    </div>
                    {showYaml && <pre className="code-block yaml">{yaml ?? "loading…"}</pre>}
                </div>
            }
        />
    )
}

export function DimosSection() {
    const doc = useJson<OpenApi>("/api/desktop/openapi")
    const runs = useJson<Runs>("/dimos/runs", ["runs", "dimos"])
    const blueprints = useJson<{ blueprints: { name: string; kind: string }[] }>("/dimos/blueprints", ["blueprints"])
    const launch = runs.data?.launch
    const list = blueprints.data?.blueprints ?? []
    return (
        <ApiSection
            doc={doc.data}
            error={doc.error}
            family="dimos"
            docFamily="dimos"
            source="/api/desktop/openapi"
            aside={
                <>
                    <div className="intro">
                        <p>
                            The dimos server is its own process on a unix socket, started on demand by Desktop, which
                            proxies <code>/dimos/…</code>{" "}
                            to it. It is the only part that depends on the dimos version: it reads the checkout's
                            blueprints, launches runs and reads their logs.
                        </p>
                    </div>
                    <div className="state-cards">
                        <div className="dim-card state">
                            <span className="dim-label">running blueprint</span>
                            <span className="big small-big">
                                {launch?.blueprint ?? runs.data?.runs?.[0]?.blueprint ?? "none"}
                            </span>
                            <span
                                className={`dim-badge ${
                                    launch?.phase === "running"
                                        ? "ok"
                                        : launch?.phase === "failed"
                                        ? "danger"
                                        : launch
                                        ? "warn"
                                        : ""
                                }`}
                            >
                                {launch?.phase ??
                                    (runs.data?.runs?.length ? "running (from a terminal)" : "nothing running")}
                            </span>
                            {launch?.error && <span className="danger-text small">{launch.error}</span>}
                            <span className="dim-muted small">refreshed by: {runs.refreshedBy ?? "first load"}</span>
                        </div>
                        <div className="dim-card state">
                            <span className="dim-label">blueprints</span>
                            <span className="big">
                                <Live value={list.length} />
                            </span>
                            <span className="dim-muted small">
                                {list.filter((b) => b.kind === "builtin").length} builtin ·{" "}
                                {list.filter((b) => b.kind !== "builtin").length} external
                            </span>
                            <span className="dim-muted small">
                                refreshed by: {blueprints.refreshedBy ?? "first load"}
                            </span>
                        </div>
                        <div className="dim-card state">
                            <span className="dim-label">runs (registry)</span>
                            <span className="big">{runs.data?.runs?.length ?? 0}</span>
                            <span className="dim-muted small">
                                {runs.data?.runs?.map((r) => r.runId).join(", ") || "—"}
                            </span>
                        </div>
                    </div>
                    <LaunchPhases phase={launch?.phase} />
                </>
            }
        />
    )
}

function LaunchPhases({ phase }: { phase?: string }) {
    const steps = ["starting", "running", "stopped"]
    return (
        <div className="phases dim-card">
            <span className="dim-label">a launch's phases</span>
            <div className="phase-row">
                {steps.map((step, i) => (
                    <span key={step} className="phase-wrap">
                        <span className={`phase ${phase === step ? "on" : ""}`}>{step}</span>
                        {i < steps.length - 1 && <span className="phase-arrow">→</span>}
                    </span>
                ))}
                <span className="phase-or">or</span>
                <span className={`phase fail ${phase === "failed" ? "on" : ""}`}>failed</span>
            </div>
            <span className="dim-muted small">
                Each change is a <code>{`{type:"dimos", event:{type:"launch"}}`}</code> event, and{" "}
                <code>{`{type:"runs"}`}</code> when a run starts or stops, so this card updates itself.
            </span>
        </div>
    )
}

export function AgentSection({ focus }: { focus?: string }) {
    const doc = useJson<OpenApi>("/agent/api/openapi", ["agent"])
    const live = useLive()
    const [tools, setTools] = useState<McpTool[] | null>(null)
    const [toolsError, setToolsError] = useState<string | null>(null)
    useEffect(() => {
        mcpTools().then(
            (r) => r.result ? setTools(r.result.tools) : setToolsError(r.error?.message ?? "no result"),
            (e) => setToolsError(e.message),
        )
    }, [])
    useEffect(() => {
        if (focus === "mcp") {
            document.getElementById("mcp-tools")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
    }, [focus, tools])
    const mcp = countsFor(live.stats, "desktop", "POST", "/mcp")
    const mcpPanel = (
        <div id="mcp-tools" className="dim-card mcp">
            <div className="mcp-head">
                <h3>Desktop MCP tools</h3>
                <span className="dim-muted small">
                    <code>POST /mcp</code> · <Live value={mcp.calls} /> calls · {mcp.errors} errors
                </span>
            </div>
            <p className="small">
                The agent doesn't call Desktop's HTTP API directly: it speaks MCP to{" "}
                <code>/mcp</code>, and these tools search the endpoint registry, then call an endpoint for it (<code>
                    call_endpoint
                </code>). So an app's <code>dimos.yaml</code> endpoints become things the agent can do.
            </p>
            {toolsError && <Notice kind="warn">tools/list failed: {toolsError}</Notice>}
            <div className="tools">
                {(tools ?? []).map((tool) => (
                    <details key={tool.name} className="tool">
                        <summary>
                            <code>{tool.name}</code>
                            <span className="dim-muted">{tool.description?.split(/(?<=\.)\s/)[0]}</span>
                        </summary>
                        <p className="small">{tool.description}</p>
                        {tool.inputSchema?.properties && (
                            <table className="dim-table compact">
                                <tbody>
                                    {Object.entries(tool.inputSchema.properties).map(([name, p]) => (
                                        <tr key={name}>
                                            <td className="dim-mono">
                                                {name}
                                                {tool.inputSchema?.required?.includes(name)
                                                    ? <span className="req">*</span>
                                                    : null}
                                            </td>
                                            <td className="dim-mono">{p.type}</td>
                                            <td>{p.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </details>
                ))}
                {tools === null && !toolsError && <span className="dim-muted">asking /mcp for tools/list…</span>}
            </div>
        </div>
    )
    return (
        <ApiSection
            doc={doc.data}
            error={doc.error}
            family="agent"
            prefix="/agent"
            source="/agent/api/openapi"
            aside={
                <>
                    <div className="intro">
                        <p>
                            The agent gateway (dimcode) is a separate server; Desktop proxies <code>/agent/…</code>{" "}
                            to it, so <code>/agent/api/sessions</code> here is <code>/api/sessions</code>{" "}
                            there. It owns chat sessions, the model and keys, and the portal page; for anything on the
                            robot it goes back through Desktop's MCP.
                        </p>
                    </div>
                    {mcpPanel}
                </>
            }
        />
    )
}

/** a Desktop JSON path, shown raw (used by the Explorer's own agent endpoints panel) */
export async function raw(path: string): Promise<string> {
    try {
        return JSON.stringify(await getJson(path), null, 2)
    } catch (error) {
        return `error: ${(error as Error).message}`
    }
}
