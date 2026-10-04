import { assert, assertEquals } from "@std/assert"
import { mockDesktop } from "../tests/mock_desktop.ts"
import { setDesktopUrl } from "./desktop.ts"
import { handle } from "./http.ts"
import { matchesTemplate, type Stats, statsFor, withCounts } from "./model.ts"
import { DESCRIPTION, routes } from "./routes.ts"

const call = async (method: string, path: string) => {
    const response = await handle(new Request(`http://app/${path}`, { method }), routes, DESCRIPTION)
    return { status: response!.status, json: await response!.json() }
}

/** each test gets a fresh stand-in Desktop (tests/fixtures) */
async function withDesktop(test: () => Promise<void>) {
    const desktop = mockDesktop()
    setDesktopUrl(desktop.url)
    try {
        await test()
    } finally {
        await desktop.close()
    }
}

Deno.test("api/summary: families with endpoint counts and calls, busiest endpoints, topics, the running blueprint", () =>
    withDesktop(async () => {
        const { status, json } = await call("GET", "api/summary")
        assertEquals(status, 200)
        const family = (name: string) => json.families.find((f: { family: string }) => f.family === name)
        assertEquals(family("desktop").endpoints, 18)
        assertEquals(family("dimos").endpoints, 9)
        assertEquals(family("agent").endpoints, 7)
        assertEquals(family("app:dim-rerun").endpoints, 4)
        assertEquals(family("app:dim-rerun").calls, 925)
        assertEquals(family("desktop"), { family: "desktop", endpoints: 18, calls: 655, errors: 4, perSec: 1.1 })
        assertEquals(json.busiest[0], {
            family: "app:dim-rerun",
            method: "GET",
            path: "api/state",
            calls: 900,
            errors: 0,
            perSec: 2.5,
        })
        assertEquals(json.topics.count, 3)
        assertEquals(json.topics.busiest[0].topic, "/odom")
        assertEquals(json.running, json.running && { ...json.running, blueprint: "unitree-go2", phase: "running" })
    }))

Deno.test("api/endpoints: the families, then one family's endpoints with live counts", () =>
    withDesktop(async () => {
        const list = await call("GET", "api/endpoints")
        assert(list.json.families.some((f: { family: string }) => f.family === "app:controller"))
        assert(
            !list.json.families.some((f: { family: string }) => f.family === "app:desktop"),
            "builtins aren't an app",
        )
        const dimos = await call("GET", "api/endpoints?family=dimos")
        const config = dimos.json.endpoints.find((e: { path: string }) => e.path === "/dimos/blueprints/{name}/config")
        assertEquals([config.calls, config.tracked], [4, true])
        const agent = await call("GET", "api/endpoints?family=agent")
        const session = agent.json.endpoints.find((e: { path: string }) => e.path === "/agent/api/sessions/{id}")
        assertEquals(session.calls, 5, "an unmatched raw path is counted under the template it fits")
        const rerun = await call("GET", "api/endpoints?family=app:dim-rerun&q=show")
        assertEquals(rerun.json.endpoints.map((e: { path: string; errors: number }) => [e.path, e.errors]), [[
            "api/open",
            2,
        ]])
        assertEquals((await call("GET", "api/endpoints?family=app:nope")).status, 404)
    }))

Deno.test("api/stats: totals and the top endpoints per family", () =>
    withDesktop(async () => {
        const { json } = await call("GET", "api/stats?top=1")
        assertEquals(json.families.desktop.length, 1)
        assertEquals(json.families.desktop[0].path, "/api/topics/rates")
        const only = await call("GET", "api/stats?family=app:controller")
        assertEquals(Object.keys(only.json.families), ["app:controller"])
        assertEquals((await call("GET", "api/stats?family=app:nope")).status, 404)
    }))

Deno.test("no Desktop: a readable 502", async () => {
    setDesktopUrl("http://127.0.0.1:9")
    const { status, json } = await call("GET", "api/stats")
    assertEquals(status, 502)
    assert(json.error.includes("Desktop"))
})

Deno.test("templates: {param} segments match, lengths must agree", () => {
    assert(matchesTemplate("/dimos/blueprints/{name}/config", "/dimos/blueprints/go2/config"))
    assert(matchesTemplate("api/recording/{name}", "/api/recording/a.rrd?x=1"))
    assert(!matchesTemplate("/dimos/blueprints/{name}", "/dimos/blueprints/go2/config"))
    const stats = {
        families: {
            "app:x": [{ method: "GET", path: "api/a", calls: 2, errors: 1, lastCall: 5, meanMs: 4, perSec: 1 }],
        },
    }
    assertEquals(statsFor(stats as unknown as Stats, "app:x", "GET", "/api/a").length, 1)
    const counted = withCounts(stats as unknown as Stats, "app:x", { method: "POST", path: "api/a", description: "" })
    assertEquals([counted.calls, counted.tracked, counted.lastCall], [0, false, null])
})

Deno.test("agent.json lists every route", async () => {
    const { json } = await call("GET", "agent.json")
    assertEquals(json.endpoints.length, routes.length)
})
