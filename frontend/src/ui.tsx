// Small shared pieces built on dimos-react: method badges, doc panels, "Try it", parameter tables, and the arrowhead
// the diagrams use.
import { type ReactNode, useState } from "react"
import { Alert, Badge, Button, CodeBlock, Panel, Row, Table, Text, TextInput } from "dimos-react"
import { formatBytes } from "./desktop.ts"

const METHOD_TONES: Record<string, string> = { GET: "info", POST: "ok", PUT: "warn", PATCH: "warn", DELETE: "danger" }

export function Method({ method }: { method: string }) {
    return <Badge tone={METHOD_TONES[method.toUpperCase()] ?? "default"} solid>{method}</Badge>
}

/** a collapsible doc card */
export function Doc({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
    return <Panel title={title} collapsible defaultOpen={open}>{children}</Panel>
}

/** name / type / description rows (a required name gets a *) */
export function ParamTable({ rows, showIn = false }: {
    rows: { name: string; in?: string; type?: string; description?: string; required?: boolean }[]
    showIn?: boolean
}) {
    return (
        <Table
            compact
            rowKey="name"
            rows={rows}
            columns={[
                {
                    key: "name",
                    label: "param",
                    render: (p: { name: string; required?: boolean }) => (
                        <Text mono>
                            {p.name}
                            {p.required ? <Text tone="danger">*</Text> : null}
                        </Text>
                    ),
                },
                ...(showIn ? [{ key: "in", label: "in" }] : []),
                { key: "type", label: "type", render: (p: { type?: string }) => <Text mono>{p.type ?? ""}</Text> },
                { key: "description", label: "description" },
            ]}
        />
    )
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
        <Panel title="Try it" icon="play">
            <Row wrap gap={10} align="end">
                {params.map((p) => (
                    <label key={p.name} title={p.description}>
                        <Text mono small>{p.name}{p.required ? "*" : ""}</Text>
                        <TextInput
                            size="sm"
                            value={values[p.name] ?? ""}
                            placeholder={p.description ?? p.in}
                            onChange={(value: string) => setValues({ ...values, [p.name]: value })}
                            onEnter={() => !missing.length && run()}
                        />
                    </label>
                ))}
                <Button variant="primary" size="sm" loading={busy} disabled={missing.length > 0} onClick={run}>
                    Try it
                </Button>
                <Text mono small muted>GET {build()}</Text>
            </Row>
            {result && "error" in result && <Alert tone="danger">{result.error}</Alert>}
            {result && !("error" in result) && (
                <>
                    <Row gap={10} wrap>
                        <Badge tone={result.status < 400 ? "ok" : "danger"}>{result.status}</Badge>
                        <Text small>{result.ms} ms</Text>
                        <Text small>{formatBytes(result.bytes)}</Text>
                        <Text small muted>{result.type}</Text>
                    </Row>
                    {result.image
                        ? <img className="ee-sample-img" src={result.image} />
                        : <CodeBlock code={result.body ?? ""} language="json" maxHeight={420} />}
                </>
            )}
        </Panel>
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
