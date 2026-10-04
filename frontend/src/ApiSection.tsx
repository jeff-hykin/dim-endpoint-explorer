// One OpenAPI document as an explorable, live reference: groups (tags) with their docs on the left, the group's
// endpoints on the right with live call counts from Desktop's stats, each expanding into its full doc and "Try it".
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { ago, countsFor, formatRate, type OpenApi, type Operation, operations } from "./desktop.ts"
import { useLive, useNow } from "./live.ts"
import { Markdown } from "./md.tsx"
import { Live, Method, Notice, Sparkline, TryIt, unsafeGet } from "./ui.tsx"

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
            <div className="api-main solo">
                {aside}
                {error
                    ? <Notice kind="warn">Couldn't read {source}: {error}</Notice>
                    : <div className="dim-muted pad">Reading {source}…</div>}
            </div>
        )
    }
    return (
        <div className="api">
            <nav className="api-nav">
                <input
                    className="dim-input"
                    placeholder={`Search ${ops.length} endpoints`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                {tags.map((t) => {
                    const mine = ops.filter((op) => op.tag === t.name)
                    const calls = mine.reduce((sum, op) => sum + counts(op.method, op.path).calls, 0)
                    const rate = mine.reduce((sum, op) => sum + counts(op.method, op.path).perSec, 0)
                    return (
                        <button
                            type="button"
                            key={t.name}
                            className={`api-tag ${t.name === tag && !q ? "on" : ""}`}
                            onClick={() => {
                                setTag(t.name)
                                setQuery("")
                            }}
                        >
                            <span className="api-tag-name">{t.name}</span>
                            <span className="api-tag-meta">
                                {mine.length} · <Live value={calls} format={(n) => n.toLocaleString()} /> calls
                                {rate > 0 && <span className="pulse" title={formatRate(rate, " calls/s")} />}
                            </span>
                        </button>
                    )
                })}
                <div className="api-source dim-muted">
                    from <a className="dim-link" href={source} target="_blank" rel="noreferrer">{source}</a>
                    <br />
                    {doc.info.title} {doc.info.version} · OpenAPI {doc.openapi}
                </div>
            </nav>
            <div className="api-main">
                {aside}
                {!q && current && (
                    <div className="group-doc dim-card">
                        <h3>{current.name}</h3>
                        {current.description
                            ? <Markdown text={current.description} />
                            : <p className="dim-muted">No group doc.</p>}
                    </div>
                )}
                {q && <div className="dim-muted small">{shown.length} matching “{query}”</div>}
                <div className="endpoints">
                    {shown.map(({ method, path, op }) => {
                        const id = `${method} ${path}`
                        const c = counts(method, path)
                        const key = `${family} ${method} ${url(path)}`
                        return (
                            <div key={id} className={`ep ${open === id ? "open" : ""}`}>
                                <button
                                    type="button"
                                    className="ep-row"
                                    onClick={() => setOpen(open === id ? null : id)}
                                >
                                    <Method method={method} />
                                    <span className="ep-path">{url(path)}</span>
                                    <span className="ep-summary">{op.summary}</span>
                                    {op["x-agent"] && (
                                        <span
                                            className="dim-badge"
                                            title="the agent finds this through search_endpoints"
                                        >
                                            agent
                                        </span>
                                    )}
                                    {op["x-mcp-tool"] && (
                                        <span className="dim-badge info" title="also an MCP tool">
                                            mcp: {op["x-mcp-tool"]}
                                        </span>
                                    )}
                                    <Sparkline values={live.history[key]} width={64} height={18} />
                                    <span className="ep-count" title="calls since Desktop started">
                                        <Live value={c.calls} format={(n) => n.toLocaleString()} />
                                    </span>
                                    {c.errors > 0 && (
                                        <span className="dim-badge danger" title="responses ≥ 400">{c.errors} err</span>
                                    )}
                                </button>
                                {open === id && (
                                    <OperationDoc op={op} method={method} path={url(path)} counts={c} now={now} />
                                )}
                            </div>
                        )
                    })}
                </div>
                {untracked.length > 0 && (
                    <details className="dim-card untracked">
                        <summary>
                            {untracked.length} request path{untracked.length === 1 ? "" : "s"}{" "}
                            that matched no documented endpoint
                        </summary>
                        <table className="dim-table compact">
                            <tbody>
                                {untracked.map((row) => (
                                    <tr key={`${row.method} ${row.path}`}>
                                        <td className="dim-mono">{row.method} {row.path}</td>
                                        <td className="num">{row.calls}</td>
                                        <td className="num">{row.errors ? `${row.errors} err` : ""}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </details>
                )}
            </div>
        </div>
    )
}

function OperationDoc({ op, method, path, counts, now }: {
    op: Operation
    method: string
    path: string
    counts: ReturnType<typeof countsFor>
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
        <div className="ep-doc">
            <div className="ep-stats">
                <span>
                    <b>{counts.calls.toLocaleString()}</b> calls
                </span>
                <span>
                    <b>{counts.errors}</b> errors
                </span>
                <span>
                    <b>{formatRate(counts.perSec)}</b> now
                </span>
                <span>
                    mean <b>{counts.meanMs.toFixed(1)} ms</b>
                </span>
                <span>
                    last call <b>{ago(counts.lastCall, now)}</b>
                </span>
                {!counts.tracked && <span className="dim-muted">(not called yet)</span>}
            </div>
            {op.description && op.description !== op.summary && <Markdown text={op.description} />}
            {params.length > 0 && (
                <table className="dim-table compact">
                    <thead>
                        <tr>
                            <th>param</th>
                            <th>in</th>
                            <th>type</th>
                            <th>description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {params.map((p) => (
                            <tr key={p.name}>
                                <td className="dim-mono">
                                    {p.name}
                                    {p.required ? <span className="req">*</span> : null}
                                </td>
                                <td>{p.in}</td>
                                <td className="dim-mono">{p.schema?.type ?? ""}</td>
                                <td>{p.description}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {op.requestBody && (
                <div>
                    <div className="dim-label">request body</div>
                    {op.requestBody.description && <Markdown text={op.requestBody.description} />}
                    {body?.schema !== undefined && (
                        <pre className="code-block">{JSON.stringify(body.schema, null, 2)}</pre>
                    )}
                </div>
            )}
            {op.responses && (
                <div className="responses">
                    <div className="dim-label">responses</div>
                    {Object.entries(op.responses).map(([status, r]) => (
                        <div key={status} className="response">
                            <span className={`dim-badge ${status.startsWith("2") ? "ok" : "warn"}`}>{status}</span>
                            <Markdown text={r.description} className="inline-md" />
                        </div>
                    ))}
                </div>
            )}
            {method === "GET" && !unsafeGet(path) && <TryIt url={path} params={tryParams} />}
            {method === "GET" && unsafeGet(path) && (
                <div className="dim-muted small">A stream: open it with EventSource, not Try it.</div>
            )}
        </div>
    )
}
