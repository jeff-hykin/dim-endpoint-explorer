// One OpenAPI document as an explorable, live reference: groups (tags) with their docs on the left, the group's
// endpoints on the right with live call counts from Desktop's stats, each expanding into its full doc and "Try it".
import { type ReactNode, useEffect, useMemo, useState } from "react"
import {
    Alert,
    Badge,
    Card,
    CodeBlock,
    Label,
    Link,
    List,
    ListRow,
    LiveValue,
    Markdown,
    Panel,
    Row,
    SearchInput,
    Sparkline,
    StatusDot,
    Table,
    Text,
} from "dimos-react"
import { ago, type Counts, countsFor, formatRate, type OpenApi, type Operation, operations } from "./desktop.ts"
import { useLive, useNow } from "./live.ts"
import { Method, ParamTable, TryIt, unsafeGet } from "./ui.tsx"

type Props = {
    doc: OpenApi | null
    error?: string | null
    /** the stats family these endpoints are counted under */
    family: string
    /** keep only operations whose x-family is this (Desktop's document holds desktop + dimos) */
    docFamily?: string
    /** what the paths are reached under on Desktop's origin (the gateway's are under /agent) */
    prefix?: string
    source: string
    aside?: ReactNode
}

export function ApiSection({ doc, error, family, docFamily, prefix = "", source, aside }: Props) {
    const live = useLive()
    const now = useNow()
    const ops = useMemo(() => operations(doc, docFamily), [doc, docFamily])
    const tags = useMemo(() => {
        const known = (doc?.tags ?? []).filter((tag) =>
            ops.some((op) => op.tag === tag.name) || !docFamily || tag["x-family"] === docFamily
        )
        const extra = [...new Set(ops.map((op) => op.tag))].filter((name) => !known.some((tag) => tag.name === name))
        return [...known, ...extra.map((name) => ({ name, description: undefined as string | undefined }))]
    }, [doc, ops])
    const [tag, setTag] = useState<string | null>(null)
    const [query, setQuery] = useState("")
    const [open, setOpen] = useState<string | null>(null)
    useEffect(() => {
        if (tag === null && tags.length) {
            setTag(tags[0].name)
        }
    }, [tags])
    const url = (path: string) => (prefix && !path.startsWith(prefix) ? prefix + path : path)
    const counts = (method: string, path: string) => countsFor(live.stats, family, method, url(path))
    const q = query.trim().toLowerCase()
    const shown = ops.filter((op) =>
        q
            ? `${op.method} ${op.path} ${op.op.summary ?? ""} ${op.op.description ?? ""}`.toLowerCase().includes(q)
            : op.tag === tag
    )
    const current = tags.find((t) => t.name === tag)
    const untracked = (live.stats?.families?.[family] ?? []).filter((row) => row.matched === false)

    if (!doc) {
        return (
            <>
                {aside}
                {error
                    ? <Alert tone="warn">Couldn't read {source}: {error}</Alert>
                    : <Text muted>Reading {source}…</Text>}
            </>
        )
    }
    return (
        <div className="ee-split">
            <nav className="ee-split__nav">
                <SearchInput placeholder={`Search ${ops.length} endpoints`} value={query} onChange={setQuery} />
                <List>
                    {tags.map((t) => {
                        const mine = ops.filter((op) => op.tag === t.name)
                        const calls = mine.reduce((sum, op) => sum + counts(op.method, op.path).calls, 0)
                        const rate = mine.reduce((sum, op) => sum + counts(op.method, op.path).perSec, 0)
                        return (
                            <ListRow
                                key={t.name}
                                title={t.name}
                                subtitle={
                                    <>
                                        {mine.length} ·{" "}
                                        <LiveValue value={calls} format={(n: number) => n.toLocaleString()} /> calls
                                    </>
                                }
                                meta={rate > 0
                                    ? <StatusDot tone="ok" pulse label={formatRate(rate, " calls/s")} />
                                    : null}
                                selected={t.name === tag && !q}
                                onClick={() => {
                                    setTag(t.name)
                                    setQuery("")
                                }}
                            />
                        )
                    })}
                </List>
                <Text small muted>
                    from <Link href={source} target="_blank" rel="noreferrer">{source}</Link>
                    <br />
                    {doc.info.title} {doc.info.version} · OpenAPI {doc.openapi}
                </Text>
            </nav>
            <div className="ee-split__main">
                {aside}
                {!q && current && (
                    <Card title={current.name}>
                        {current.description
                            ? <Markdown text={current.description} />
                            : <Text muted>No group doc.</Text>}
                    </Card>
                )}
                {q && <Text small muted>{shown.length} matching “{query}”</Text>}
                <List>
                    {shown.map(({ method, path, op }) => {
                        const id = `${method} ${path}`
                        const c = counts(method, path)
                        const key = `${family} ${method} ${url(path)}`
                        return (
                            <div key={id}>
                                <ListRow
                                    icon={<Method method={method} />}
                                    title={<Text mono>{url(path)}</Text>}
                                    subtitle={op.summary}
                                    selected={open === id}
                                    onClick={() => setOpen(open === id ? null : id)}
                                    meta={
                                        <Row gap={8}>
                                            {op["x-agent"] && (
                                                <Badge title="the agent finds this through search_endpoints">
                                                    agent
                                                </Badge>
                                            )}
                                            {op["x-mcp-tool"] && (
                                                <Badge tone="info" title="also an MCP tool">
                                                    mcp: {op["x-mcp-tool"]}
                                                </Badge>
                                            )}
                                            <Sparkline values={live.history[key] ?? []} width={64} height={18} />
                                            <Text mono title="calls since Desktop started">
                                                <LiveValue value={c.calls} format={(n: number) => n.toLocaleString()} />
                                            </Text>
                                            {c.errors > 0 && (
                                                <Badge tone="danger" title="responses ≥ 400">{c.errors} err</Badge>
                                            )}
                                        </Row>
                                    }
                                />
                                {open === id && (
                                    <OperationDoc op={op} method={method} path={url(path)} counts={c} now={now} />
                                )}
                            </div>
                        )
                    })}
                </List>
                {untracked.length > 0 && (
                    <Panel
                        collapsible
                        defaultOpen={false}
                        title={`${untracked.length} request path${
                            untracked.length === 1 ? "" : "s"
                        } that matched no documented endpoint`}
                    >
                        <Table
                            compact
                            rows={untracked}
                            rowKey={(row) => `${row.method} ${row.path}`}
                            columns={[
                                {
                                    key: "path",
                                    label: "request",
                                    render: (row) => <Text mono>{row.method} {row.path}</Text>,
                                },
                                { key: "calls", label: "calls", align: "right" },
                                {
                                    key: "errors",
                                    label: "errors",
                                    align: "right",
                                    render: (row) => (row.errors ? `${row.errors} err` : ""),
                                },
                            ]}
                        />
                    </Panel>
                )}
            </div>
        </div>
    )
}

/** an endpoint's live numbers: calls, errors, rate, mean time, last call */
export function EndpointStats({ counts, now, extra }: { counts: Counts; now: number; extra?: ReactNode }) {
    return (
        <Row gap={16} wrap>
            <Text small>
                <b>{counts.calls.toLocaleString()}</b> calls
            </Text>
            <Text small>
                <b>{counts.errors}</b> errors
            </Text>
            <Text small>
                <b>{formatRate(counts.perSec)}</b> now
            </Text>
            <Text small>
                mean <b>{counts.meanMs.toFixed(1)} ms</b>
            </Text>
            <Text small>
                last call <b>{ago(counts.lastCall, now)}</b>
            </Text>
            {extra}
        </Row>
    )
}

function OperationDoc({ op, method, path, counts, now }: {
    op: Operation
    method: string
    path: string
    counts: Counts
    now: number
}) {
    const params = op.parameters ?? []
    const body = op.requestBody?.content?.["application/json"]
    const pathParams = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
    const tryParams = [
        ...pathParams.filter((name) => !params.some((p) => p.name === name)).map((name) => ({
            name,
            in: "path" as const,
            required: true,
        })),
        ...params.filter((p) => p.in === "path" || p.in === "query").map((p) => ({
            name: p.name,
            in: p.in as "path" | "query",
            required: p.required || p.in === "path",
            description: p.description,
        })),
    ]
    return (
        <div className="ee-endpoint-doc">
            <EndpointStats
                counts={counts}
                now={now}
                extra={!counts.tracked && <Text small muted>(not called yet)</Text>}
            />
            {op.description && op.description !== op.summary && <Markdown text={op.description} />}
            {params.length > 0 && (
                <ParamTable
                    showIn
                    rows={params.map((p) => ({ ...p, type: p.schema?.type, required: !!p.required }))}
                />
            )}
            {op.requestBody && (
                <div>
                    <Label>request body</Label>
                    {op.requestBody.description && <Markdown text={op.requestBody.description} />}
                    {body?.schema !== undefined && (
                        <CodeBlock code={JSON.stringify(body.schema, null, 2)} language="json" maxHeight={360} />
                    )}
                </div>
            )}
            {op.responses && (
                <div>
                    <Label>responses</Label>
                    {Object.entries(op.responses).map(([status, r]) => (
                        <Row key={status} gap={8} align="baseline">
                            <Badge tone={status.startsWith("2") ? "ok" : "warn"}>{status}</Badge>
                            <Markdown text={r.description} inline />
                        </Row>
                    ))}
                </div>
            )}
            {method === "GET" && !unsafeGet(path) && <TryIt url={path} params={tryParams} />}
            {method === "GET" && unsafeGet(path) && (
                <Text small muted>A stream: open it with EventSource, not Try it.</Text>
            )}
        </div>
    )
}
