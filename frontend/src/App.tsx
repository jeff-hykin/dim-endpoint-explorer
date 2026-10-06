// Endpoint Explorer: every endpoint family of the running dimOS system, live, and how data flows between them.
// Sections are hash routes (#overview, #zenoh, #desktop, #dimos, #agent, #apps[/<focus>]) so Desktop's agent or a link
// can open one directly.
import { useEffect, useState } from "react"
import { AppsSection } from "./Apps.tsx"
import { familyRate, formatRate } from "./desktop.ts"
import { startLive, useLive } from "./live.ts"
import { Overview } from "./Overview.tsx"
import { AgentSection, DesktopSection, DimosSection } from "./Sections.tsx"
import { ZenohSection } from "./Zenoh.tsx"

export type Section = "overview" | "zenoh" | "desktop" | "dimos" | "agent" | "apps"
const SECTIONS: { id: Section; label: string; hint: string }[] = [
    { id: "overview", label: "Overview", hint: "the whole system as a live data-flow map" },
    { id: "zenoh", label: "zenoh-web", hint: "robot topics: rates, payloads, how zenoh works" },
    { id: "desktop", label: "Desktop", hint: "Desktop's own HTTP API" },
    { id: "dimos", label: "dimos server", hint: "blueprints, runs, logs, config" },
    { id: "agent", label: "Agent gateway", hint: "dimcode's API and the MCP tools" },
    { id: "apps", label: "Apps", hint: "every installed app's endpoints" },
]

function readHash(): { section: Section; focus?: string } {
    const [section, ...rest] = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/")
    const known = SECTIONS.some((s) => s.id === section)
    return { section: known ? section as Section : "overview", focus: rest.join("/") || undefined }
}

export function App() {
    const [route, setRoute] = useState(readHash)
    const live = useLive()
    useEffect(() => {
        startLive()
        const onHash = () => setRoute(readHash())
        addEventListener("hashchange", onHash)
        return () => removeEventListener("hashchange", onHash)
    }, [])
    const go = (section: Section, focus?: string) => {
        location.hash = focus ? `${section}/${encodeURIComponent(focus)}` : section
        scrollTo({ top: 0 })
    }
    const rate = (section: Section): string | null => {
        const s = live.stats
        switch (section) {
            case "zenoh":
                return live.rates ? `${live.rates.topics.length}` : null
            case "desktop":
                return formatRate(familyRate(s, "desktop"))
            case "dimos":
                return formatRate(familyRate(s, "dimos"))
            case "agent":
                return formatRate(familyRate(s, "agent"))
            case "apps":
                return formatRate(
                    Object.keys(s?.families ?? {}).filter((f) => f.startsWith("app:")).reduce(
                        (sum, f) => sum + familyRate(s, f),
                        0,
                    ),
                )
            default:
                return null
        }
    }
    const connected = live.stats !== null && !live.statsError
    return (
        <div className="shell">
            <header className="top">
                <div className="brand">
                    <span className="brand-mark" />
                    <span className="brand-name">Endpoint Explorer</span>
                </div>
                <nav className="tabs" role="tablist">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            role="tab"
                            aria-selected={route.section === s.id}
                            className="tab"
                            title={s.hint}
                            onClick={() => go(s.id)}
                        >
                            {s.label}
                            {rate(s.id) && <span className="tab-rate">{rate(s.id)}</span>}
                        </button>
                    ))}
                </nav>
                <div className="top-right">
                    <span
                        className={`conn ${connected ? "on" : "off"}`}
                        title={live.statsError ?? "reading /api/endpoints/stats + endpoint-stats events (zenoh)"}
                    >
                        <span className="dot" />
                        {connected ? "live" : live.statsError ? "no stats" : "connecting"}
                    </span>
                </div>
            </header>
            {live.statsError && (
                <div className="banner">
                    Desktop's call counts aren't available (<code>/api/endpoints/stats</code>:{" "}
                    {live.statsError}). Docs and lists still work; counts stay at 0.
                </div>
            )}
            <main className="content">
                <h1 className="section-title">
                    {SECTIONS.find((s) => s.id === route.section)?.label}
                    <span className="section-hint">{SECTIONS.find((s) => s.id === route.section)?.hint}</span>
                </h1>
                {route.section === "overview" && <Overview go={go} />}
                {route.section === "zenoh" && <ZenohSection />}
                {route.section === "desktop" && <DesktopSection />}
                {route.section === "dimos" && <DimosSection />}
                {route.section === "agent" && <AgentSection focus={route.focus} />}
                {route.section === "apps" && <AppsSection focus={route.focus} />}
            </main>
        </div>
    )
}
