// zenoh-gateway: the live topics (GET /api/topics/rates every second, merged with /api/topics' keys), one real sampled
// message per topic (GET /api/topics/sample), and docs on how robot data moves. Facts are from Desktop's
// src/server/topics.rs + src/zenoh_gateway.rs, the zenoh-gateway 0.5.0 crate and dimos's zenoh pubsub.
import { useEffect, useState } from "react"
import {
    Alert,
    Badge,
    Button,
    Card,
    CodeBlock,
    EmptyState,
    Heading,
    KeyValue,
    LiveValue,
    Markdown,
    Panel,
    Row,
    Sparkline,
    Stat,
    Table,
    Text,
} from "dimos-react"
import { openApp } from "./dim-app/source/desktop.js"
import { formatBytes, getJson, type Topic } from "./desktop.ts"
import { useJson, useLive } from "./live.ts"
import { Arrow, Doc } from "./ui.tsx"

type Sample = {
    topic: string
    type: string
    key: string
    bytes: number
    width?: number
    height?: number
    encoding?: string
    frameId?: string
    image?: { mimeType: string; data: string }
    cloud?: { count: number; min: number[]; max: number[]; centroid: number[]; sample: number[][] }
    note?: string
    [field: string]: unknown
}
type Status = {
    enabled?: boolean
    up?: boolean
    url?: string
    version?: string
    encoder?: string
    error?: string | null
}

const KEY_EXAMPLE = "/odom  →  dimos/odom/nav_msgs.Odometry\n/cmd_vel  →  dimos/cmd_vel/geometry_msgs.Twist"

const launcher = (
    <Button variant="primary" onClick={() => openApp("launcher", { kind: "blueprint" })}>Open the Launcher</Button>
)

export function ZenohSection() {
    const { rates, ratesError } = useLive()
    const topics = useJson<{ topics: { topic: string; type: string; key: string }[] }>("/api/topics")
    const status = useJson<Status>("/api/zenoh-gateway")
    const [selected, setSelected] = useState<string | null>(null)
    const keys = new Map((topics.data?.topics ?? []).map((t) => [t.topic, t.key]))
    const list = rates?.topics ?? []
    const total = list.reduce((sum, t) => sum + t.hz, 0)
    const bps = list.reduce((sum, t) => sum + t.bps, 0)
    const pick = list.find((t) => t.topic === selected)
    return (
        <>
            <Card>
                <Markdown text="A running blueprint's modules talk over **zenoh**, a pub/sub network. Desktop joins it as a peer and embeds **zenoh-gateway**, which carries topics to browser pages. Everything below is live: rates are counted by Desktop's subscriber on `dimos/**`, which this page keeps awake by asking every second (it stops 20 s after the last ask)." />
            </Card>
            <div className="ee-grid ee-grid--stats">
                <Card>
                    <Stat
                        label="zenoh-gateway"
                        value={
                            <Badge tone={rates?.up ? "ok" : "danger"}>
                                {rates ? (rates.up ? "up" : "down") : "…"}
                            </Badge>
                        }
                        hint={status.data
                            ? `v${status.data.version ?? "?"} · ${status.data.encoder ?? "no encoder yet"}`
                            : status.error
                            ? "status unavailable"
                            : ""}
                    />
                </Card>
                <Card>
                    <Stat label="topics publishing" value={list.length} />
                </Card>
                <Card>
                    <Stat label="messages / s" value={<LiveValue value={Math.round(total)} />} />
                </Card>
                <Card>
                    <Stat label="bandwidth" value={`${formatBytes(bps)}/s`} />
                </Card>
            </div>
            {ratesError && <Alert tone="warn">/api/topics/rates: {ratesError}</Alert>}
            {rates && !rates.up && (
                <EmptyState
                    data-testid="onboard-link-lost"
                    icon="warn"
                    tone="warn"
                    title="Desktop's zenoh-gateway isn't up, so there are no topics"
                    message="It's what brings robot topics to browser pages. Turn it on or check it in Settings → zenoh-gateway."
                    actions={<Button onClick={() => openApp("settings")}>Open Settings</Button>}
                />
            )}
            {rates?.up && !list.length && (
                <EmptyState
                    data-testid="onboard-no-topics"
                    icon="signal"
                    title="No topic is publishing"
                    message="Start a blueprint (or a replay, no robot needed) and its topics appear here with live rates."
                    actions={launcher}
                />
            )}
            <div className="ee-grid ee-grid--wide">
                <Card padded={false}>
                    <Table
                        compact
                        rows={list}
                        rowKey="topic"
                        selected={selected}
                        onRowClick={(t: Topic) => setSelected(t.topic)}
                        empty="No topic is publishing. Start a blueprint (or a replay) and they appear here."
                        columns={[
                            {
                                key: "topic",
                                label: "topic",
                                render: (t: Topic) => (
                                    <>
                                        <Text mono>{t.topic}</Text>
                                        <br />
                                        <Text mono small muted>{keys.get(t.topic) ?? `dimos${t.topic}/${t.type}`}</Text>
                                    </>
                                ),
                            },
                            { key: "type", label: "type", render: (t: Topic) => <Text mono small>{t.type}</Text> },
                            {
                                key: "hz",
                                label: "Hz",
                                align: "right",
                                render: (t: Topic) => <LiveValue value={t.hz} format={(n: number) => n.toFixed(1)} />,
                            },
                            {
                                key: "bps",
                                label: "bandwidth",
                                align: "right",
                                render: (t: Topic) => `${formatBytes(t.bps)}/s`,
                            },
                            {
                                key: "history",
                                label: "last 32 s",
                                sort: false,
                                render: (t: Topic) => (
                                    <Sparkline values={t.history ?? []} width={110} color="var(--accent-alt)" />
                                ),
                            },
                        ]}
                    />
                </Card>
                <SamplePanel topic={pick?.topic ?? null} type={pick?.type} />
            </div>
            <Heading level={2}>How it works</Heading>
            <div className="ee-grid ee-grid--wide">
                <Doc title="How a Desktop page gets topic data" open>
                    <PathDiagram />
                    <Markdown
                        text={[
                            '- **Live streams (apps):** the page imports zenoh-gateway\'s JS client and connects to its own Desktop: `connect(new URL("../../zenoh-gateway", location.href).href)`, then `subscribe`, `publisher`, `listTopics`, `get`, `lease`. Data arrives over WebRTC.',
                            "- **Quick looks (this page, the HUD, the agent):** plain HTTP. `/api/topics` lists, `/api/topics/rates` counts, `/api/topics/sample` returns the next message. The MCP tools `list_topics` / `sample_topic` are the same code.",
                            "- **App backends** get `zenohGatewayUrl` and `zenohConnect` in the `DIMOS_APP` env var to reach the same data.",
                        ].join("\n")}
                    />
                </Doc>
                <Doc title="Keys: how /odom becomes a zenoh key" open>
                    <Markdown text="dimos strips the leading `/`, prefixes `dimos/` and appends the message type:" />
                    <CodeBlock code={KEY_EXAMPLE} language="text" copy={false} />
                    <Markdown text="The type travels *only* in that last segment: no encoding field, no attachment. Desktop discovers topics by subscribing to `dimos/**` plus liveliness queries, listening for about 1.2 s, and keeping keys shaped `dimos/…/pkg.Type`. RPC uses queryables on `dimos/rpc/<name>`." />
                </Doc>
                <Doc title="Encodings: what the bytes are" open>
                    <Markdown
                        text={[
                            "- On the wire: **LCM** (big-endian, packed, an 8-byte type fingerprint first), from `msg.lcm_encode()`. Types without an LCM encoder go out pickled.",
                            "- `/api/topics/sample` decodes three: `sensor_msgs.Image` (rgb8, bgr8, rgba8, bgra8, mono8 → JPEG q85), `CompressedImage` (passed through), and `PointCloud2` (float32 x/y/z → count, bounds, centroid, ≤ 200 sample points). Anything else: the raw size and a note.",
                            "- zenoh-gateway's encodings (`dimos_lcm_*`, `ros2_*`) turn images into **H.264 video** and depth / point clouds into zstd-compressed fields (clouds thinned and quantized to int16), so a browser can keep up.",
                        ].join("\n")}
                    />
                </Doc>
                <Doc title="Leases and liveliness" open>
                    <Markdown
                        text={[
                            "- **Liveliness:** Desktop queries liveliness tokens when it discovers topics, but dimos declares none today, so a topic shows up only while it publishes. In the rates, a quiet topic reads 0 Hz and disappears after 5 s of zeros.",
                            "- **zenoh-gateway leases** are a gateway feature: one browser client's exclusive right to publish on a group of keys (e.g. one driver for `cmd_vel`). Desktop defines no lease groups.",
                            "- **Deadmen:** a publisher arms a message ahead of time (say, a zero velocity); the gateway sends it if that client misses heartbeats, disconnects (15 s grace) or the gateway stops.",
                        ].join("\n")}
                    />
                </Doc>
                <Doc title="ACL: who may publish" open>
                    <Markdown text="No zenoh `access_control` is configured in Desktop or dimos. zenoh-gateway would honor one from a zenoh config, and has an `authorize` hook (none set, so every client may do everything). What guards `/zenoh-gateway` is Desktop's own HTTP auth: loopback is trusted, other machines need the network-access password." />
                </Doc>
                <Doc title="WebRTC" open>
                    <Markdown text="zenoh-gateway *is* the WebRTC path: each subscription or publisher is a data channel, images are H.264 video tracks. Signaling is one non-trickle `POST …/zenoh-gateway/offer`; there are also `/zenoh-gateway/ice` and `/zenoh-gateway/health`. The encoder is VideoToolbox, then GStreamer hardware, then openh264 (Settings: hardware encode off forces software). dimos's separate `WebRTCPubSub` is unrelated." />
                </Doc>
                <Doc title="Relays, routers and other machines" open>
                    <Markdown
                        text={[
                            "- dimos defaults to `zenoh_mode: peer`, scouting off (multicast stays on loopback), and connects to `tcp/<robot_ip>:7447` for each robot IP, because many access points filter multicast.",
                            "- Desktop's session is zenoh's default (a peer with multicast scouting) plus `zenoh_gateway.connect` if set; the HUD shows \"peer\" or that endpoint.",
                            "- No `zenohd` router ships with either. Client mode keeps one link; router mode needs an explicit listen endpoint.",
                        ].join("\n")}
                    />
                </Doc>
            </div>
        </>
    )
}

function SamplePanel({ topic, type }: { topic: string | null; type?: string }) {
    const [sample, setSample] = useState<Sample | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [forTopic, setForTopic] = useState<string | null>(null)
    const take = async () => {
        if (!topic) {
            return
        }
        setBusy(true)
        setError(null)
        try {
            const query = new URLSearchParams({ topic, timeout: "5", ...(type ? { type } : {}) })
            setSample(await getJson<Sample>(`/api/topics/sample?${query}`))
            setForTopic(topic)
        } catch (e) {
            setError((e as Error).message)
            setSample(null)
        } finally {
            setBusy(false)
        }
    }
    useEffect(() => {
        if (topic && topic !== forTopic) {
            take()
        }
    }, [topic])
    const fields = sample
        ? Object.entries(sample).filter(([k]) =>
            !["image", "cloud", "topic", "type", "key", "bytes", "note"].includes(k)
        )
        : []
    return (
        <Card
            title="Example payload"
            actions={
                <Button size="sm" icon="refresh" disabled={!topic} loading={busy} onClick={take}>
                    {busy ? "Waiting for the next message…" : "Sample again"}
                </Button>
            }
        >
            {!topic && (
                <Text as="p" muted>
                    Pick a topic: Desktop subscribes to its key and returns the very next message (no replay of old
                    ones).
                </Text>
            )}
            {error && <Alert tone="warn">{error}</Alert>}
            {sample && (
                <>
                    <KeyValue
                        items={[
                            ["key", sample.key],
                            ["type", sample.type],
                            ["size", `${formatBytes(sample.bytes)} on the wire`],
                            ...fields.map(([k, v]) =>
                                [k, typeof v === "object" ? JSON.stringify(v) : String(v)] as const
                            ),
                        ]}
                    />
                    {sample.image && (
                        <img
                            className="ee-sample-img"
                            src={`data:${sample.image.mimeType};base64,${sample.image.data}`}
                            alt={sample.topic}
                        />
                    )}
                    {sample.cloud && <CloudView cloud={sample.cloud} />}
                    {sample.note && <Text as="p" small muted>{sample.note}</Text>}
                    <Panel title="raw JSON" collapsible defaultOpen={false}>
                        <CodeBlock
                            language="json"
                            maxHeight={360}
                            code={JSON.stringify(
                                {
                                    ...sample,
                                    image: sample.image
                                        ? {
                                            ...sample.image,
                                            data: `${
                                                sample.image.data.slice(0, 40)
                                            }… (${sample.image.data.length} chars)`,
                                        }
                                        : undefined,
                                },
                                null,
                                2,
                            )}
                        />
                    </Panel>
                </>
            )}
        </Card>
    )
}

/** a point-cloud summary: bounds, centroid and the ≤ 200 sample points from above (x right, y up) */
function CloudView({ cloud }: { cloud: NonNullable<Sample["cloud"]> }) {
    const [minX, minY] = cloud.min
    const [maxX, maxY] = cloud.max
    const span = Math.max(maxX - minX, maxY - minY, 0.001)
    const S = 220
    const px = (x: number) => 10 + ((x - minX) / span) * (S - 20)
    const py = (y: number) => S - 10 - ((y - minY) / span) * (S - 20)
    const fmt = (v: number[]) => `[${v.map((n) => n.toFixed(2)).join(", ")}]`
    return (
        <Row gap={14} align="start" wrap>
            <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
                <rect className="cloud-frame" x={0.5} y={0.5} width={S - 1} height={S - 1} rx={8} />
                {cloud.sample.map(([x, y], i) => (
                    <circle key={i} className="cloud-point" cx={px(x)} cy={py(y)} r={1.8} />
                ))}
                <circle className="cloud-centroid" cx={px(cloud.centroid[0])} cy={py(cloud.centroid[1])} r={4} />
            </svg>
            <KeyValue
                items={[
                    ["points", cloud.count.toLocaleString()],
                    ["min", fmt(cloud.min)],
                    ["max", fmt(cloud.max)],
                    ["centroid", fmt(cloud.centroid)],
                    ["shown", `${cloud.sample.length} sample points, top-down`],
                ]}
            />
        </Row>
    )
}

function PathDiagram() {
    const box = (x: number, y: number, w: number, label: string, sub: string, cls = "") => (
        <g className={`dnode ${cls}`}>
            <rect x={x} y={y} width={w} height={44} rx={8} />
            <text x={x + w / 2} y={y + 19} textAnchor="middle" className="node-title">{label}</text>
            <text x={x + w / 2} y={y + 34} textAnchor="middle" className="node-sub">{sub}</text>
        </g>
    )
    return (
        <svg className="ee-diagram" viewBox="0 0 470 160">
            <Arrow />
            {box(0, 58, 92, "module", "publishes LCM", "zenoh")}
            {box(122, 58, 96, "zenoh", "dimos/odom/…", "zenoh")}
            {box(256, 8, 110, "zenoh-gateway", "inside Desktop")}
            {box(256, 108, 110, "topics API", "/api/topics/*")}
            {box(396, 8, 74, "app page", "WebRTC")}
            {box(396, 108, 74, "this page", "fetch")}
            <path markerEnd="url(#arrow)" className="dline msg" d="M92,80 L120,80" />
            <path markerEnd="url(#arrow)" className="dline msg" d="M218,74 C240,74 236,30 254,30" />
            <path markerEnd="url(#arrow)" className="dline msg" d="M218,86 C240,86 236,130 254,130" />
            <path markerEnd="url(#arrow)" className="dline" d="M366,30 L394,30" />
            <path markerEnd="url(#arrow)" className="dline" d="M366,130 L394,130" />
        </svg>
    )
}
