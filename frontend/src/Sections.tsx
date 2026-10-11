// The Desktop, dimos server and agent gateway sections: each is its OpenAPI document (ApiSection) plus the live state
// and docs that belong to it.
import { useEffect, useState } from "react"
import {
    Alert,
    Badge,
    Button,
    Card,
    CodeBlock,
    LiveValue,
    Markdown,
    Panel,
    Row,
    Stat,
    Stepper,
    Text,
} from "dimos-react"
import { ApiSection } from "./ApiSection.tsx"
import { countsFor, getJson, type McpTool, mcpTools, type OpenApi, type Runs } from "./desktop.ts"
import { useJson, useLive } from "./live.ts"
import { ParamTable } from "./ui.tsx"

const DOC_1 =
    'Desktop is one Rust process. It serves the shell, every app\'s page and these endpoints on one origin, so any page can `fetch("/api/…")` without CORS. Its own manifest, the same `dimos.yaml` shape every app has, lists them for the agent.'
const DOC_2 =
    'Each change is a `{type:"dimos", event:{type:"launch"}}` event, and `{type:"runs"}` when a run starts or stops, so this card updates itself.'

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
                <Card>
                    <Markdown
                        text={DOC_1}
                    />
                    <Row gap={8} wrap>
                        <Button
                            size="sm"
                            iconRight="external"
                            onClick={() => open("/api/desktop/dimos.yaml", "_blank", "noreferrer")}
                        >
                            Desktop's dimos.yaml
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowYaml(!showYaml)}>
                            {showYaml ? "Hide" : "Show"} it here
                        </Button>
                    </Row>
                    {showYaml && <CodeBlock code={yaml ?? "loading…"} language="yaml" maxHeight={480} />}
                </Card>
            }
        />
    )
}

const PHASE_TONES: Record<string, string> = { running: "ok", failed: "danger" }

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
                    <Card>
                        <Markdown text="The dimos server is its own process on a unix socket, started on demand by Desktop, which proxies `/dimos/…` to it. It is the only part that depends on the dimos version: it reads the checkout's blueprints, launches runs and reads their logs." />
                    </Card>
                    <div className="ee-grid">
                        <Card>
                            <Stat
                                label="running blueprint"
                                value={launch?.blueprint ?? runs.data?.runs?.[0]?.blueprint ?? "none"}
                                hint={`refreshed by: ${runs.refreshedBy ?? "first load"}`}
                            />
                            <Badge tone={launch ? PHASE_TONES[launch.phase] ?? "warn" : "default"}>
                                {launch?.phase ??
                                    (runs.data?.runs?.length ? "running (from a terminal)" : "nothing running")}
                            </Badge>
                            {launch?.error && <Text small tone="danger">{launch.error}</Text>}
                        </Card>
                        <Card>
                            <Stat
                                label="blueprints"
                                value={<LiveValue value={list.length} />}
                                hint={`${list.filter((b) => b.kind === "builtin").length} builtin · ${
                                    list.filter((b) => b.kind !== "builtin").length
                                } external · refreshed by: ${blueprints.refreshedBy ?? "first load"}`}
                            />
                        </Card>
                        <Card>
                            <Stat
                                label="runs (registry)"
                                value={runs.data?.runs?.length ?? 0}
                                hint={runs.data?.runs?.map((r) => r.runId).join(", ") || "—"}
                            />
                        </Card>
                    </div>
                    <LaunchPhases phase={launch?.phase} />
                </>
            }
        />
    )
}

function LaunchPhases({ phase }: { phase?: string }) {
    const steps = ["starting", "running", "stopped"]
    const current = phase === "failed" ? 1 : Math.max(0, steps.indexOf(phase ?? ""))
    return (
        <Card title="A launch's phases">
            <Row gap={12} wrap>
                <Stepper
                    steps={steps.map((label) => ({ label }))}
                    current={phase && phase !== "failed" ? current : -1}
                />
                <Text muted small>or</Text>
                <Badge tone={phase === "failed" ? "danger" : "default"} solid={phase === "failed"}>failed</Badge>
            </Row>
            <Markdown
                text={DOC_2}
            />
        </Card>
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
        <Card
            id="mcp-tools"
            title="Desktop MCP tools"
            actions={
                <Text small muted>
                    <Text mono>POST /mcp</Text> · <LiveValue value={mcp.calls} /> calls · {mcp.errors} errors
                </Text>
            }
        >
            <Markdown text="The agent doesn't call Desktop's HTTP API directly: it speaks MCP to `/mcp`, and these tools search the endpoint registry, then call an endpoint for it (`call_endpoint`). So an app's `dimos.yaml` endpoints become things the agent can do." />
            {toolsError && <Alert tone="warn">tools/list failed: {toolsError}</Alert>}
            {(tools ?? []).map((tool) => (
                <Panel
                    key={tool.name}
                    collapsible
                    defaultOpen={false}
                    title={
                        <Row gap={10}>
                            <Text mono>{tool.name}</Text>
                            <Text muted small>{tool.description?.split(/(?<=\.)\s/)[0]}</Text>
                        </Row>
                    }
                >
                    <Text as="p" small>{tool.description}</Text>
                    {tool.inputSchema?.properties && (
                        <ParamTable
                            rows={Object.entries(tool.inputSchema.properties).map(([name, p]) => ({
                                name,
                                type: p.type,
                                description: p.description,
                                required: tool.inputSchema?.required?.includes(name),
                            }))}
                        />
                    )}
                </Panel>
            ))}
            {tools === null && !toolsError && <Text muted>asking /mcp for tools/list…</Text>}
        </Card>
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
                    <Card>
                        <Markdown text="The agent gateway (dimcode) is a separate server; Desktop proxies `/agent/…` to it, so `/agent/api/settings` here is `/api/settings` there. It owns chat sessions, the model and keys, and the portal page; for anything on the robot it goes back through Desktop's MCP." />
                    </Card>
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
