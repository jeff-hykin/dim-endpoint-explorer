// zenoh-gateway: the live topics (GET /api/topics/rates every second, merged with /api/topics' keys), one real sampled
// message per topic (GET /api/topics/sample), and docs on how robot data moves. Facts are from Desktop's
// src/server/topics.rs + src/zenoh_gateway.rs, the zenoh-gateway 0.5.0 crate and dimos's zenoh pubsub.
import { useEffect, useState } from "react"
import { formatBytes, getJson } from "./desktop.ts"
import { useJson, useLive } from "./live.ts"
import { EmptyState } from "./dim-app/react.js"
import { Arrow, Doc, Live, Notice, Sparkline } from "./ui.tsx"

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
        <div className="zenoh">
            <div className="intro">
                <p>
                    A running blueprint's modules talk over{" "}
                    <b>zenoh</b>, a pub/sub network. Desktop joins it as a peer and embeds{" "}
                    <b>zenoh-gateway</b>, which carries topics to browser pages. Everything below is live: rates are
                    counted by Desktop's subscriber on{" "}
                    <code>dimos/**</code>, which this page keeps awake by asking every second (it stops 20 s after the
                    last ask).
                </p>
            </div>
            <div className="totals">
                <div className="total">
                    <span className="dim-label">zenoh-gateway</span>
                    <span className={`dim-badge ${rates?.up ? "ok" : "danger"}`}>
                        {rates ? (rates.up ? "up" : "down") : "…"}
                    </span>
                    <span className="dim-muted small">
                        {status.data
                            ? `v${status.data.version ?? "?"} · ${status.data.encoder ?? "no encoder yet"}`
                            : status.error
                            ? "status unavailable"
                            : ""}
                    </span>
                </div>
                <div className="total">
                    <span className="dim-label">topics publishing</span>
                    <span className="big">{list.length}</span>
                </div>
                <div className="total">
                    <span className="dim-label">messages / s</span>
                    <Live value={Math.round(total)} className="big" />
                </div>
                <div className="total">
                    <span className="dim-label">bandwidth</span>
                    <span className="big small-big">{formatBytes(bps)}/s</span>
                </div>
            </div>
            {ratesError && <Notice kind="warn">/api/topics/rates: {ratesError}</Notice>}
            {rates && !rates.up && (
                <div className="onboard">
                    <EmptyState
                        testId="onboard-link-lost"
                        label="zenoh-gateway down"
                        tone="warn"
                        title="Desktop's zenoh-gateway isn't up, so there are no topics"
                        body="It's what brings robot topics to browser pages. Turn it on or check it in Settings → zenoh-gateway."
                        actions={[{ label: "Open Settings", app: "settings" }]}
                    />
                </div>
            )}
            {rates?.up && !list.length && (
                <div className="onboard">
                    <EmptyState
                        testId="onboard-no-topics"
                        label="No topics"
                        title="No topic is publishing"
                        body="Start a blueprint (or a replay, no robot needed) and its topics appear here with live rates."
                        actions={[{ label: "Open the Launcher", app: "launcher", params: { kind: "blueprint" } }]}
                    />
                </div>
            )}
            <div className="zenoh-grid">
                <div className="dim-card topics-card">
                    <table className="dim-table compact topics">
                        <thead>
                            <tr>
                                <th>topic</th>
                                <th>type</th>
                                <th className="num">Hz</th>
                                <th className="num">bandwidth</th>
                                <th>last 32 s</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((t) => (
                                <tr
                                    key={t.topic}
                                    className={`clickable ${selected === t.topic ? "on" : ""}`}
                                    onClick={() => setSelected(t.topic)}
                                >
                                    <td className="dim-mono">
                                        {t.topic}
                                        <div className="dim-muted tiny">
                                            {keys.get(t.topic) ?? `dimos${t.topic}/${t.type}`}
                                        </div>
                                    </td>
                                    <td className="dim-mono small">{t.type}</td>
                                    <td className="num">
                                        <Live value={t.hz} format={(n) => n.toFixed(1)} />
                                    </td>
                                    <td className="num">{formatBytes(t.bps)}/s</td>
                                    <td>
                                        <Sparkline values={t.history} width={110} className="violet" />
                                    </td>
                                </tr>
                            ))}
                            {!list.length && (
                                <tr>
                                    <td colSpan={5} className="dim-muted">
                                        No topic is publishing. Start a blueprint (or a replay) and they appear here.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <SamplePanel topic={pick?.topic ?? null} type={pick?.type} />
            </div>
            <h3 className="docs-h">How it works</h3>
            <div className="docs-grid">
                <Doc title="How a Desktop page gets topic data" open>
                    <PathDiagram />
                    <ul>
                        <li>
                            <b>Live streams (apps):</b>{" "}
                            the page imports zenoh-gateway's JS client and connects to its own Desktop:{" "}
                            <code>connect(new URL("../../zenoh-gateway", location.href).href)</code>, then{" "}
                            <code>subscribe</code>, <code>publisher</code>, <code>listTopics</code>, <code>get</code>,
                            {" "}
                            <code>lease</code>. Data arrives over WebRTC.
                        </li>
                        <li>
                            <b>Quick looks (this page, the HUD, the agent):</b> plain HTTP. <code>/api/topics</code>
                            {" "}
                            lists, <code>/api/topics/rates</code> counts, <code>/api/topics/sample</code>{" "}
                            returns the next message. The MCP tools <code>list_topics</code> / <code>sample_topic</code>
                            {" "}
                            are the same code.
                        </li>
                        <li>
                            <b>App backends</b> get <code>zenohGatewayUrl</code> and <code>zenohConnect</code> in the
                            {" "}
                            <code>DIMOS_APP</code> env var to reach the same data.
                        </li>
                    </ul>
                </Doc>
                <Doc title="Keys: how /odom becomes a zenoh key" open>
                    <p>
                        dimos strips the leading <code>/</code>, prefixes <code>dimos/</code>{" "}
                        and appends the message type:
                    </p>
                    <pre className="code-block">{KEY_EXAMPLE}</pre>
                    <p>
                        The type travels <em>only</em>{" "}
                        in that last segment: no encoding field, no attachment. Desktop discovers topics by subscribing
                        to <code>dimos/**</code>{" "}
                        plus liveliness queries, listening for about 1.2 s, and keeping keys shaped{" "}
                        <code>dimos/…/pkg.Type</code>. RPC uses queryables on <code>dimos/rpc/&lt;name&gt;</code>.
                    </p>
                </Doc>
                <Doc title="Encodings: what the bytes are" open>
                    <ul>
                        <li>
                            On the wire: <b>LCM</b> (big-endian, packed, an 8-byte type fingerprint first), from{" "}
                            <code>msg.lcm_encode()</code>. Types without an LCM encoder go out pickled.
                        </li>
                        <li>
                            <code>/api/topics/sample</code> decodes three: <code>sensor_msgs.Image</code>{" "}
                            (rgb8, bgr8, rgba8, bgra8, mono8 → JPEG q85), <code>CompressedImage</code>{" "}
                            (passed through), and <code>PointCloud2</code>{" "}
                            (float32 x/y/z → count, bounds, centroid, ≤ 200 sample points). Anything else: the raw size
                            and a note.
                        </li>
                        <li>
                            zenoh-gateway's encodings (<code>dimos_lcm_*</code>, <code>ros2_*</code>) turn images into
                            {" "}
                            <b>H.264 video</b>{" "}
                            and depth / point clouds into zstd-compressed fields (clouds thinned and quantized to
                            int16), so a browser can keep up.
                        </li>
                    </ul>
                </Doc>
                <Doc title="Leases and liveliness" open>
                    <ul>
                        <li>
                            <b>Liveliness:</b>{" "}
                            Desktop queries liveliness tokens when it discovers topics, but dimos declares none today,
                            so a topic shows up only while it publishes. In the rates, a quiet topic reads 0 Hz and
                            disappears after 5 s of zeros.
                        </li>
                        <li>
                            <b>zenoh-gateway leases</b>{" "}
                            are a gateway feature: one browser client's exclusive right to publish on a group of keys
                            (e.g. one driver for <code>cmd_vel</code>). Desktop defines no lease groups.
                        </li>
                        <li>
                            <b>Deadmen:</b>{" "}
                            a publisher arms a message ahead of time (say, a zero velocity); the gateway sends it if
                            that client misses heartbeats, disconnects (15 s grace) or the gateway stops.
                        </li>
                    </ul>
                </Doc>
                <Doc title="ACL: who may publish" open>
                    <p>
                        No zenoh <code>access_control</code>{" "}
                        is configured in Desktop or dimos. zenoh-gateway would honor one from a zenoh config, and has an
                        {" "}
                        <code>authorize</code> hook (none set, so every client may do everything). What guards{" "}
                        <code>/zenoh-gateway</code>{" "}
                        is Desktop's own HTTP auth: loopback is trusted, other machines need the network-access
                        password.
                    </p>
                </Doc>
                <Doc title="WebRTC" open>
                    <p>
                        zenoh-gateway <em>is</em>{" "}
                        the WebRTC path: each subscription or publisher is a data channel, images are H.264 video
                        tracks. Signaling is one non-trickle <code>POST …/zenoh-gateway/offer</code>; there are also
                        {" "}
                        <code>/zenoh-gateway/ice</code> and{" "}
                        <code>/zenoh-gateway/health</code>. The encoder is VideoToolbox, then GStreamer hardware, then
                        openh264 (Settings: hardware encode off forces software). dimos's separate{" "}
                        <code>WebRTCPubSub</code> is unrelated.
                    </p>
                </Doc>
                <Doc title="Relays, routers and other machines" open>
                    <ul>
                        <li>
                            dimos defaults to{" "}
                            <code>zenoh_mode: peer</code>, scouting off (multicast stays on loopback), and connects to
                            {" "}
                            <code>tcp/&lt;robot_ip&gt;:7447</code>{" "}
                            for each robot IP, because many access points filter multicast.
                        </li>
                        <li>
                            Desktop's session is zenoh's default (a peer with multicast scouting) plus{" "}
                            <code>zenoh_gateway.connect</code> if set; the HUD shows "peer" or that endpoint.
                        </li>
                        <li>
                            No <code>zenohd</code>{" "}
                            router ships with either. Client mode keeps one link; router mode needs an explicit listen
                            endpoint.
                        </li>
                    </ul>
                </Doc>
            </div>
        </div>
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
        <div className="dim-card sample">
            <div className="sample-head">
                <h3>Example payload</h3>
                <button type="button" className="dim-btn sm" disabled={!topic || busy} onClick={take}>
                    {busy ? "Waiting for the next message…" : "Sample again"}
                </button>
            </div>
            {!topic && (
                <p className="dim-muted">
                    Pick a topic: Desktop subscribes to its key and returns the very next message (no replay of old
                    ones).
                </p>
            )}
            {error && <Notice kind="warn">{error}</Notice>}
            {sample && (
                <>
                    <div className="kv">
                        <span className="k">key</span>
                        <code>{sample.key}</code>
                        <span className="k">type</span>
                        <code>{sample.type}</code>
                        <span className="k">size</span>
                        <span>{formatBytes(sample.bytes)} on the wire</span>
                        {fields.flatMap(([k, v]) => [
                            <span key={`k-${k}`} className="k">{k}</span>,
                            <code key={`v-${k}`}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</code>,
                        ])}
                    </div>
                    {sample.image && (
                        <img
                            className="sample-img"
                            src={`data:${sample.image.mimeType};base64,${sample.image.data}`}
                            alt={sample.topic}
                        />
                    )}
                    {sample.cloud && <CloudView cloud={sample.cloud} />}
                    {sample.note && <p className="dim-muted small">{sample.note}</p>}
                    <details>
                        <summary className="small">raw JSON</summary>
                        <pre className="code-block">
                            {JSON.stringify(
                                { ...sample, image: sample.image ? { ...sample.image, data: `${sample.image.data.slice(0, 40)}… (${sample.image.data.length} chars)` } : undefined },
                                null,
                                2,
                            )}
                        </pre>
                    </details>
                </>
            )}
        </div>
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
        <div className="cloud">
            <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="cloud-svg">
                <rect x={0.5} y={0.5} width={S - 1} height={S - 1} rx={8} />
                {cloud.sample.map(([x, y], i) => <circle key={i} cx={px(x)} cy={py(y)} r={1.8} />)}
                <circle className="centroid" cx={px(cloud.centroid[0])} cy={py(cloud.centroid[1])} r={4} />
            </svg>
            <div className="kv">
                <span className="k">points</span>
                <span>{cloud.count.toLocaleString()}</span>
                <span className="k">min</span>
                <code>{fmt(cloud.min)}</code>
                <span className="k">max</span>
                <code>{fmt(cloud.max)}</code>
                <span className="k">centroid</span>
                <code>{fmt(cloud.centroid)}</code>
                <span className="k">shown</span>
                <span>{cloud.sample.length} sample points, top-down</span>
            </div>
        </div>
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
        <svg className="diagram" viewBox="0 0 470 160">
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
