// Small shared pieces: sparklines, method badges, numbers that flash when they change, doc cards, and "Try it".
import { type ReactNode, useEffect, useRef, useState } from "react"
import { formatBytes } from "./desktop.ts"

export function Sparkline({ values, width = 90, height = 22, className = "" }: {
    values?: number[]
    width?: number
    height?: number
    className?: string
}) {
    const data = values?.length ? values : [0]
    const max = Math.max(...data, 0.0001)
    const step = data.length > 1 ? width / (data.length - 1) : width
    const points = data.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`)
    const flat = data.every((v) => v === 0)
    return (
        <svg
            className={`spark ${flat ? "flat" : ""} ${className}`}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
        >
            {!flat && <polygon className="spark-fill" points={`0,${height} ${points.join(" ")} ${width},${height}`} />}
            <polyline className="spark-line" points={points.join(" ")} />
        </svg>
    )
}

export function Method({ method }: { method: string }) {
    return <span className={`method m-${method.toLowerCase()}`}>{method}</span>
}

/** a number that briefly lights up when it changes (live counts) */
export function Live({ value, format = String, className = "" }: {
    value: number
    format?: (n: number) => string
    className?: string
}) {
    const last = useRef(value)
    const [flash, setFlash] = useState(0)
    useEffect(() => {
        if (value !== last.current) {
            last.current = value
            setFlash((n) => n + 1)
        }
    }, [value])
    return <span key={flash} className={`live-num ${flash ? "flash" : ""} ${className}`}>{format(value)}</span>
}

export function Doc(
    { title, children, open = false, icon }: { title: string; children: ReactNode; open?: boolean; icon?: ReactNode },
) {
    return (
        <details className="doc dim-card" open={open}>
            <summary>
                {icon}
                <span>{title}</span>
            </summary>
            <div className="doc-body">{children}</div>
        </details>
    )
}

export function Notice({ kind = "info", children }: { kind?: "info" | "warn" | "danger"; children: ReactNode }) {
    return <div className={`notice ${kind}`}>{children}</div>
}

export type TryParam = { name: string; in: "path" | "query"; required?: boolean; description?: string }

/** GET endpoints only: fills the path/query params, calls Desktop, shows status, time and the body */
export function TryIt({ url, params = [] }: { url: string; params?: TryParam[] }) {
    const [values, setValues] = useState<Record<string, string>>({})
    const [result, setResult] = useState<
        | { status: number; ms: number; type: string; body?: string; image?: string; bytes: number }
        | { error: string }
        | null
    >(null)
    const [busy, setBusy] = useState(false)
    const build = () => {
        let path = url
        const query = new URLSearchParams()
        for (const p of params) {
            const value = values[p.name] ?? ""
            if (p.in === "path") {
                path = path.replace(`{${p.name}}`, encodeURIComponent(value))
            } else if (value) {
                query.set(p.name, value)
            }
        }
        return query.size ? `${path}?${query}` : path
    }
    const missing = params.filter((p) => p.required && !values[p.name])
    const run = async () => {
        setBusy(true)
        const started = performance.now()
        try {
            const response = await fetch(build(), { signal: AbortSignal.timeout(12_000) })
            const type = response.headers.get("content-type") ?? ""
            const ms = Math.round(performance.now() - started)
            if (type.startsWith("image/")) {
                const blob = await response.blob()
                setResult({ status: response.status, ms, type, image: URL.createObjectURL(blob), bytes: blob.size })
            } else {
                const text = await response.text()
                let body = text
                try {
                    body = JSON.stringify(JSON.parse(text), null, 2)
                } catch {
                    // not JSON
                }
                setResult({
                    status: response.status,
                    ms,
                    type,
                    body: body.length > 20000 ? body.slice(0, 20000) + "\n…" : body,
                    bytes: text.length,
                })
            }
        } catch (error) {
            setResult({ error: (error as Error).message })
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className="tryit">
            <div className="tryit-row">
                {params.map((p) => (
                    <label key={p.name} className="tryit-param" title={p.description}>
                        <span className="dim-mono">{p.name}{p.required ? "*" : ""}</span>
                        <input
                            className="dim-input"
                            value={values[p.name] ?? ""}
                            placeholder={p.description ?? p.in}
                            onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && !missing.length && run()}
                        />
                    </label>
                ))}
                <button
                    type="button"
                    className="dim-btn primary sm"
                    disabled={busy || missing.length > 0}
                    onClick={run}
                >
                    {busy ? "Calling…" : "Try it"}
                </button>
                <code className="tryit-url">GET {build()}</code>
            </div>
            {result && "error" in result && <Notice kind="danger">{result.error}</Notice>}
            {result && !("error" in result) && (
                <div className="tryit-result">
                    <div className="tryit-meta">
                        <span className={`dim-badge ${result.status < 400 ? "ok" : "danger"}`}>{result.status}</span>
                        <span>{result.ms} ms</span>
                        <span>{formatBytes(result.bytes)}</span>
                        <span className="dim-muted">{result.type}</span>
                    </div>
                    {result.image
                        ? <img className="tryit-img" src={result.image} />
                        : <pre className="code-block">{result.body}</pre>}
                </div>
            )}
        </div>
    )
}

/** the paths "Try it" won't call: streams that never end */
export const unsafeGet = (path: string) => /events|\/ws$|stream/.test(path)

/** the arrowhead the docs diagrams' lines end in (`markerEnd="url(#arrow)"`) */
export function Arrow() {
    return (
        <defs>
            <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
            >
                <path className="arrowhead" d="M0,1 L9,5 L0,9 Z" />
            </marker>
        </defs>
    )
}
