import { assert, assertEquals } from "@std/assert"
import { buildComponents, ownerOf, samePath, usedBy } from "./model.ts"

const desktop = {
    title: "DimOS Desktop",
    requires: { dimos: ">=0.0.14b1 <0.1" },
    agent: {
        description: "Desktop",
        endpoints: [
            { app: "desktop", method: "GET", path: "/api/apps", description: "apps", params: {} },
            { app: "desktop", method: "GET", path: "/recordings/{id}", description: "one recording" },
            { app: "desktop", method: "GET", path: "/dimos-gateway/active", description: "what runs" },
        ],
    },
}
const apps = [
    {
        pkg: "dim-rerun",
        title: "Rerun",
        declared: { public: ["POST api/open"], requires: ["GET /dimos-gateway/active", "GET /api/apps"] },
        registry: {
            description: "a viewer",
            endpoints: [{ method: "POST", path: "api/open", description: "open one" }],
        },
    },
    {
        pkg: "dim-recordings",
        declared: {
            public: [],
            requires: [
                "POST /apps/dim-rerun/api/open",
                "GET /recordings/{id}",
                "GET /agent-gateway/api/x",
                "POST /mcp",
            ],
            zenohGateway: true,
        },
    },
]

Deno.test("paths match across {params}, and belong to a component by prefix", () => {
    assert(samePath("/recordings/{id}", "/recordings/abc"))
    assert(samePath("/a/b", "a/b/"))
    assert(!samePath("/recordings/{id}", "/recordings/abc/file"))
    assertEquals(ownerOf("/apps/dim-rerun/api/open"), "dim-rerun")
    assertEquals(ownerOf("/dimos-gateway/active"), "dimos-gateway")
    assertEquals(ownerOf("/api/apps"), "desktop")
})

Deno.test("Desktop's dimos.yaml splits into Desktop and the dimos gateway; apps get full paths and descriptions", () => {
    const components = buildComponents(desktop, apps)
    assertEquals(components.map((c) => c.id), ["desktop", "dimos-gateway", "dim-rerun", "dim-recordings"])
    assertEquals(components[0].provides.map((e) => e.path), ["/api/apps", "/recordings/{id}"])
    assertEquals(components[0].requires, { dimos: ">=0.0.14b1 <0.1" })
    assertEquals(components[1].provides.map((e) => e.path), ["/dimos-gateway/active"])
    assertEquals(components[2].provides, [{
        method: "POST",
        path: "/apps/dim-rerun/api/open",
        description: "open one",
    }])
})

Deno.test("uses resolve to their provider's endpoint; unknown ones stay null", () => {
    const components = buildComponents(desktop, apps)
    const recordings = components.find((c) => c.id === "dim-recordings")!
    assertEquals(recordings.uses.map((u) => [u.provider, u.endpoint?.path ?? null]), [
        ["dim-rerun", "/apps/dim-rerun/api/open"],
        ["desktop", "/recordings/{id}"],
        [null, null],
        ["desktop", null],
    ])
    const users = usedBy(components)
    assertEquals(users.get("GET /dimos-gateway/active"), ["dim-rerun"])
    assertEquals(users.get("GET /api/apps"), ["dim-rerun"])
    assertEquals(users.get("POST /apps/dim-rerun/api/open"), ["dim-recordings"])
})

Deno.test("no Desktop dimos.yaml: just the apps", () => {
    assertEquals(buildComponents(null, apps).map((c) => c.id), ["dim-rerun", "dim-recordings"])
})
