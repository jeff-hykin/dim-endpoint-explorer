// Endpoint Explorer: every endpoint family of the running dimOS system, live, and how data flows between them.
// Sections are hash routes (#overview, #zenoh, #desktop, #dimos, #agent, #apps[/<focus>]) so Desktop's agent or a link
// can open one directly.
import { useEffect, useRef, useState } from "react"
import { Alert, AppShell, ConnectionStatus, Heading, Row, Tabs, Text, TopBar } from "dimos-react"
import { AppsSection } from "./Apps.tsx"
import { familyRate, formatRate } from "./desktop.ts"
import { startLive, useLive } from "./live.ts"
import { Overview } from "./Overview.tsx"
import { AgentSection, DesktopSection, DimosSection } from "./Sections.tsx"
import { ZenohSection } from "./Zenoh.tsx"

export type Section = "overview" | "zenoh" | "desktop" | "dimos" | "agent" | "apps"
const SECTIONS: { id: Section; label: string; hint: string }[] = [
    { id: "overview", label: "Overview", hint: "the whole system as a live data-flow map" },
    { id: "zenoh", label: "zenoh-gateway", hint: "robot topics: rates, payloads, how zenoh works" },
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

// inside Desktop, its window bar already shows the app's icon and name
const standalone = globalThis.top === globalThis.self

export function App() {
    const [route, setRoute] = useState(readHash)
    const live = useLive()
    const content = useRef<HTMLDivElement>(null)
    useEffect(() => {
        startLive()
        const onHash = () => setRoute(readHash())
        addEventListener("hashchange", onHash)
        return () => removeEventListener("hashchange", onHash)
    }, [])
    const go = (section: Section, focus?: string) => {
        location.hash = focus ? `${section}/${encodeURIComponent(focus)}` : section
        content.current?.closest(".dr-shell-content")?.scrollTo({ top: 0 })
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
    const current = SECTIONS.find((s) => s.id === route.section)
    return (
        <AppShell
            topBar={
                <TopBar
                    title={standalone ? "Endpoint Explorer" : undefined}
                    icon={standalone ? "activity" : undefined}
                    left={
                        <Tabs
                            label="Sections"
                            value={route.section}
                            onChange={(section: Section) => go(section)}
                            items={SECTIONS.map((s) => ({
                                value: s.id,
                                label: s.label,
                                title: s.hint,
                                badge: rate(s.id),
                            }))}
                        />
                    }
                    right={
                        <ConnectionStatus
                            state={connected ? "connected" : live.statsError ? "lost" : "connecting"}
                            label={connected ? "live" : live.statsError ? "no stats" : "connecting"}
                            title={live.statsError ?? "reading /api/endpoints/stats + endpoint-stats events (zenoh)"}
                        />
                    }
                />
            }
        >
            <div className="ee-content" ref={content}>
                {live.statsError && (
                    <Alert tone="warn" title="Desktop's call counts aren't available">
                        <Text mono>/api/endpoints/stats</Text>:{" "}
                        {live.statsError}. Docs and lists still work; counts stay at 0.
                    </Alert>
                )}
                <Row gap={12} align="baseline" wrap>
                    <Heading level={1}>{current?.label}</Heading>
                    <Text muted>{current?.hint}</Text>
                </Row>
                {route.section === "overview" && <Overview go={go} />}
                {route.section === "zenoh" && <ZenohSection />}
                {route.section === "desktop" && <DesktopSection />}
                {route.section === "dimos" && <DimosSection />}
                {route.section === "agent" && <AgentSection focus={route.focus} />}
                {route.section === "apps" && <AppsSection focus={route.focus} />}
            </div>
        </AppShell>
    )
}
