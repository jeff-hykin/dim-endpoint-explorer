// Writes tests/fixtures/*.json: stand-ins for Desktop's APIs, shaped as the IcyStingray design says (used by the
// backend tests and by `deno task mock`, a fake Desktop for working on the page without one).
const dir = new URL("../tests/fixtures/", import.meta.url)
await Deno.mkdir(dir, { recursive: true })
const write = (name: string, value: unknown) =>
    Deno.writeTextFile(new URL(name, dir), JSON.stringify(value, null, 4) + "\n")

type Op = [method: string, path: string, tag: string, summary: string, params?: [string, string, boolean, string][]]
const tags = [
    [
        "Apps",
        "desktop",
        "Install, update, start and stop apps. Each app is a git repo with a `dimos.yaml`; Desktop builds it with nix (`dimosApp`) and serves it under `/apps/<name>/`.",
    ],
    [
        "Notifications",
        "desktop",
        'The notification center. Apps post with `POST /api/notifications` (the dim-app SDK\'s `notify()`); every page hears `{type:"notification"}` on the events stream.',
    ],
    [
        "UI settings",
        "desktop",
        "Desktop-wide settings shared by every page: theme, OS notifications, network access (read-only here).",
    ],
    [
        "Topics (zenoh-web)",
        "desktop",
        "Live robot topics: the list, publish rates and one sampled message, read from zenoh through zenoh-web.",
    ],
    [
        "Events",
        "desktop",
        "`GET /api/events` is one Server-Sent Events stream for every page: apps, endpoints, blueprints, runs, notification, ui-settings, endpoint-stats.",
    ],
    [
        "Endpoints",
        "desktop",
        "The endpoint registry (Desktop's own + every app's manifest) and per-endpoint call counts.",
    ],
    [
        "MCP",
        "desktop",
        "`POST /mcp`: the Model Context Protocol server the agent uses. Its tools search and call the endpoints in the registry.",
    ],
    [
        "Blueprints",
        "dimos",
        "**Enumeration.** The dimos server lists every blueprint the checkout can run.\n\n**File watching.** A `notify` watcher on the checkout's blueprint sources and the venv's packages, debounced, sends `{type:\"blueprints\", added, removed}`.",
    ],
    [
        "Runs",
        "dimos",
        "Launch and stop blueprints. A launch goes through phases: `starting` → `running` → `stopped` or `failed`.",
    ],
    ["Logs", "dimos", "A run's structured log records, paged by offset and filtered by level or text."],
    [
        "Config",
        "dimos",
        "Config introspection: `introspect.py` runs in the checkout's python and reads each module's configurable args.",
    ],
]
const ops: Op[] = [
    ["get", "/api/apps", "Apps", "Installed apps and whether each is running"],
    ["post", "/api/apps", "Apps", "Install an app from a git URL"],
    ["post", "/api/open-app", "Apps", "Open an app's window", [["app", "string", true, "app name"]]],
    ["get", "/api/notifications", "Notifications", "Recent notifications"],
    ["post", "/api/notifications", "Notifications", "Post a notification"],
    ["get", "/api/ui-settings", "UI settings", "The shared UI settings"],
    ["put", "/api/ui-settings", "UI settings", "Change UI settings"],
    ["get", "/api/hud", "UI settings", "What the HUD shows"],
    ["get", "/api/topics", "Topics (zenoh-web)", "Every topic zenoh-web sees: topic, type, key"],
    ["get", "/api/topics/rates", "Topics (zenoh-web)", "Per-topic Hz, bytes/s and a short history"],
    ["get", "/api/topics/sample", "Topics (zenoh-web)", "The next message on a topic", [[
        "topic",
        "string",
        true,
        "e.g. /odom",
    ]]],
    ["get", "/api/events", "Events", "The Server-Sent Events stream"],
    ["get", "/api/search", "Apps", "Search apps, endpoints and settings", [["q", "string", true, "text"]]],
    ["get", "/api/endpoints", "Endpoints", "The endpoint registry", [["app", "string", false, "only this app"]]],
    ["get", "/api/endpoints/stats", "Endpoints", "Per-endpoint call counts"],
    ["get", "/api/desktop/openapi", "Endpoints", "This document"],
    ["get", "/api/desktop/dimos.yaml", "Endpoints", "Desktop's own manifest"],
    ["post", "/mcp", "MCP", "MCP JSON-RPC (tools/list, tools/call)"],
    ["get", "/dimos/info", "Blueprints", "The dimos checkout: dir, version, installed"],
    ["get", "/dimos/blueprints", "Blueprints", "Every blueprint dimos can run"],
    ["get", "/dimos/blueprints/{name}", "Blueprints", "A blueprint's modules and streams", [[
        "name",
        "string",
        true,
        "blueprint name",
    ]]],
    ["get", "/dimos/blueprints/{name}/config", "Config", "A blueprint's configurable args per module", [[
        "name",
        "string",
        true,
        "blueprint name",
    ]]],
    ["get", "/dimos/global-config", "Config", "GlobalConfig schema, defaults and overrides"],
    ["get", "/dimos/runs", "Runs", "Running blueprints and Desktop's launch"],
    ["post", "/dimos/runs", "Runs", "Launch a blueprint"],
    ["post", "/dimos/runs/stop", "Runs", "Stop the launched blueprint"],
    ["get", "/dimos/runs/{runId}/log", "Logs", "A run's log records", [["runId", "string", true, "run id or latest"]]],
]
const familyOf = new Map(tags.map(([name, family]) => [name, family]))
const paths: Record<string, Record<string, unknown>> = {}
for (const [method, path, tag, summary, params] of ops) {
    paths[path] ??= {}
    paths[path][method] = {
        operationId: `${method}_${path.replace(/[^a-z]+/gi, "_")}`,
        summary,
        description: summary + ".",
        tags: [tag],
        parameters: (params ?? []).map(([name, type, required, description]) => ({
            name,
            in: path.includes(`{${name}}`) ? "path" : "query",
            required,
            description,
            schema: { type },
        })),
        responses: { "200": { description: "JSON" } },
        "x-family": familyOf.get(tag),
        ...(path === "/api/notifications" && method === "post" ? { "x-mcp-tool": "notify" } : {}),
    }
}
await write("openapi.json", {
    openapi: "3.1.0",
    info: { title: "dimOS Desktop", version: "0.9.0" },
    servers: [{ url: "/" }],
    tags: tags.map(([name, family, description]) => ({ name, description, "x-family": family })),
    paths,
})

await write("agent_openapi.json", {
    openapi: "3.1.0",
    info: { title: "dimcode gateway", version: "0.3.0" },
    tags: [
        { name: "Sessions", description: "Agent chat sessions: one per conversation, streamed to the portal." },
        { name: "Settings", description: "Model choice and API keys." },
        { name: "Portal", description: "The portal page Desktop frames." },
    ],
    paths: {
        "/api/sessions": {
            get: { summary: "List sessions", tags: ["Sessions"] },
            post: { summary: "Start a session", tags: ["Sessions"] },
        },
        "/api/sessions/{id}": {
            get: {
                summary: "One session's transcript",
                tags: ["Sessions"],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            },
        },
        "/api/settings": { get: { summary: "The agent's settings", tags: ["Settings"] } },
        "/api/model": { put: { summary: "Pick the model", tags: ["Settings"] } },
        "/api/openapi": { get: { summary: "This document", tags: ["Portal"] } },
        "/": { get: { summary: "The portal page", tags: ["Portal"] } },
    },
})

const builtins = ops.map(([method, path, , summary]) => ({ method: method.toUpperCase(), path, description: summary }))
await write("endpoints.json", {
    apps: [
        {
            app: "desktop",
            title: "Desktop",
            description: "dimOS Desktop's own API",
            source: "builtin",
            endpoints: builtins,
        },
        {
            app: "dim-rerun",
            title: "Rerun",
            description: "Shows a Rerun web viewer inside Desktop",
            source: "dimos.yaml",
            manifestUrl: "/apps/dim-rerun/agent.json",
            endpoints: [
                { method: "GET", path: "api/state", description: "Rerun's state", role: "context" },
                {
                    method: "POST",
                    path: "api/viewer",
                    description: "Connect to a viewer",
                    params: { host: { type: "string", description: "viewer host" } },
                },
                { method: "POST", path: "api/open", description: "Show a stream or recording" },
                {
                    method: "GET",
                    path: "api/recording/{name}",
                    description: "The open .rrd's bytes",
                    params: { name: { type: "string", required: true, description: "file name" } },
                },
            ],
        },
        {
            app: "controller",
            title: "Controller",
            description: "Drive the robot",
            source: "agent.json",
            endpoints: [
                { method: "GET", path: "api/state", description: "Controller state" },
                {
                    method: "POST",
                    path: "api/move",
                    description: "Send a velocity",
                    params: { x: { type: "number" }, yaw: { type: "number" } },
                },
            ],
        },
        {
            app: "dim-endpoint-explorer",
            title: "Endpoint Explorer",
            source: "dimos.yaml",
            endpoints: [
                { method: "GET", path: "api/summary", description: "System summary" },
                {
                    method: "GET",
                    path: "api/endpoints",
                    description: "Endpoints by family",
                    params: { family: { type: "string" } },
                },
                { method: "GET", path: "api/stats", description: "Call counts" },
            ],
        },
    ],
})

const now = Date.UTC(2026, 9, 4, 12)
const row = (method: string, path: string, calls: number, perSec: number, errors = 0, matched = true) => ({
    method,
    path,
    calls,
    errors,
    lastCall: calls ? now - 1500 : null,
    meanMs: 3.2,
    perSec,
    matched,
})
await write("stats.json", {
    since: now - 600_000,
    now,
    totals: { calls: 1890, errors: 6, perSec: 3.9 },
    families: {
        desktop: [
            row("GET", "/api/topics/rates", 600, 1),
            row("GET", "/api/apps", 40, 0.1),
            row("POST", "/mcp", 12, 0, 1),
            row("GET", "/api/nope", 3, 0, 3, false),
        ],
        dimos: [row("GET", "/dimos/runs", 120, 0.2), row("GET", "/dimos/blueprints/{name}/config", 4, 0)],
        agent: [row("GET", "/agent/api/sessions", 30, 0.1), row("GET", "/agent/api/sessions/abc", 5, 0, 0, false)],
        "app:dim-rerun": [
            row("GET", "api/state", 900, 2.5),
            row("POST", "api/open", 3, 0, 2),
            row("GET", "(frontend)", 22, 0),
        ],
        "app:controller": [row("POST", "api/move", 250, 0)],
    },
})

await write("topics.json", {
    topics: [
        { topic: "/odom", type: "nav_msgs.Odometry", key: "dimos/odom" },
        { topic: "/color_image", type: "sensor_msgs.Image", key: "dimos/color_image" },
        { topic: "/lidar", type: "sensor_msgs.PointCloud2", key: "dimos/lidar" },
    ],
})
const wave = (base: number) =>
    Array.from({ length: 32 }, (_, i) => Math.round((base + Math.sin(i / 3) * base * 0.1) * 10) / 10)
await write("rates.json", {
    up: true,
    topics: [
        { topic: "/odom", type: "nav_msgs.Odometry", hz: 50, bps: 36_000, history: wave(50) },
        { topic: "/color_image", type: "sensor_msgs.Image", hz: 15, bps: 1_400_000, history: wave(15) },
        { topic: "/lidar", type: "sensor_msgs.PointCloud2", hz: 10, bps: 2_100_000, history: wave(10) },
    ],
})
await write("runs.json", {
    runs: [{
        runId: "20261004-120000-unitree-go2",
        pid: 4242,
        blueprint: "unitree-go2",
        startedAt: "2026-10-04T12:00:00Z",
        logDir: "/tmp/runs/x",
    }],
    launch: {
        blueprint: "unitree-go2",
        phase: "running",
        startedAt: "2026-10-04T12:00:00Z",
        pid: 4242,
        output: "",
        runId: "20261004-120000-unitree-go2",
        logDir: null,
        error: null,
    },
})
await write("blueprints.json", {
    blueprints: [{ name: "unitree-go2", kind: "builtin" }, { name: "unitree-go2-basic", kind: "builtin" }, {
        name: "my-bot",
        kind: "external",
    }],
})
await write("apps.json", {
    apps: [{ name: "dim-rerun", title: "Rerun", running: true }, {
        name: "controller",
        title: "Controller",
        running: true,
    }, { name: "dim-endpoint-explorer", title: "Endpoint Explorer", running: true }],
})
await write("mcp_tools.json", {
    jsonrpc: "2.0",
    id: 1,
    result: {
        tools: [
            {
                name: "list_endpoints",
                description: "Every endpoint in the registry",
                inputSchema: { type: "object", properties: { app: { type: "string" } } },
            },
            {
                name: "search_endpoints",
                description: "Search endpoints by text",
                inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
            },
            {
                name: "call_endpoint",
                description: "Call one endpoint",
                inputSchema: {
                    type: "object",
                    properties: { app: { type: "string" }, method: { type: "string" }, path: { type: "string" } },
                },
            },
            {
                name: "notify",
                description: "Post a notification",
                inputSchema: { type: "object", properties: { title: { type: "string" } } },
            },
        ],
    },
})
await Deno.writeTextFile(
    new URL("dimos.yaml", dir),
    "title: dimOS Desktop\nagent:\n    description: Desktop's own API\n    endpoints:\n        - method: GET\n          path: /api/apps\n          description: Installed apps\n",
)
console.log("wrote tests/fixtures")
// the next message on a topic (topics.rs): JSON always; images come back base64 inside it, clouds as a summary
const png1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
await write("samples.json", {
    "/odom": {
        topic: "/odom",
        type: "nav_msgs.Odometry",
        key: "dimos/odom/nav_msgs.Odometry",
        bytes: 720,
        note: "no decoder for this type here; an app may show it",
    },
    "/color_image": {
        topic: "/color_image",
        type: "sensor_msgs.Image",
        key: "dimos/color_image/sensor_msgs.Image",
        bytes: 921_664,
        width: 640,
        height: 480,
        encoding: "rgb8",
        frameId: "camera",
        image: { mimeType: "image/png", data: png1x1 },
    },
    "/lidar": {
        topic: "/lidar",
        type: "sensor_msgs.PointCloud2",
        key: "dimos/lidar/sensor_msgs.PointCloud2",
        bytes: 210_000,
        cloud: {
            count: 13_000,
            min: [-8.2, -6.1, -0.3],
            max: [9.4, 7.7, 2.1],
            centroid: [0.4, 0.2, 0.6],
            sample: [[1.2, 0.3, 0.1], [2.5, -1.1, 0.4], [-3.0, 2.2, 1.0]],
        },
    },
})
