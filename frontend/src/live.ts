// The page's live view of the system, shared by every section: call counts (GET /api/endpoints/stats, then Desktop's
// `endpoint-stats` events on zenoh, which also carry rates decaying to 0; re-read after the zenoh-gateway connection comes
// back), topic rates (GET /api/topics/rates every second: Desktop has no event for them, and the reads keep its counting
// subscriber alive), and every Desktop event seen (onDesktopEvent: `<ns>/desktop/events/**` on the page's one zenoh-gateway
// connection).
import { useEffect, useState, useSyncExternalStore } from "react"
import { onDesktopEvent, onDesktopReconnect } from "./dim-app/source/desktop_events.js"
import { getJson, type Rates, type Stats } from "./desktop.ts"

const HISTORY = 60
export type DesktopEvent = { type: string; at: number; [key: string]: unknown }

type State = {
    stats: Stats | null
    statsError: string | null
    rates: Rates | null
    ratesError: string | null
    /** "<family>" or "<family> <METHOD> <path>" → calls/s, one sample a second, oldest first */
    history: Record<string, number[]>
    events: DesktopEvent[]
    eventsPerSec: number
    eventHistory: number[]
    /** bumps on every change, for components that only need to re-render */
    tick: number
}

let state: State = {
    stats: null,
    statsError: null,
    rates: null,
    ratesError: null,
    history: {},
    events: [],
    eventsPerSec: 0,
    eventHistory: [],
    tick: 0,
}
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
    state = { ...state, ...patch, tick: state.tick + 1 }
    listeners.forEach((listener) => listener())
}

let started = false
let eventsThisSecond = 0

async function readStats() {
    try {
        set({ stats: await getJson<Stats>("/api/endpoints/stats"), statsError: null })
    } catch (error) {
        set({ statsError: (error as Error).message })
    }
}

async function readRates() {
    try {
        set({ rates: await getJson<Rates>("/api/topics/rates"), ratesError: null })
    } catch (error) {
        set({ ratesError: (error as Error).message })
    }
}

type Changed = {
    family: string
    method: string
    path: string
    calls: number
    errors: number
    perSec: number
    lastCall: number | null
}

function applyStatsEvent(event: { totals?: Stats["totals"]; changed?: Changed[]; at?: number }) {
    if (!state.stats) {
        return
    }
    const families = { ...state.stats.families }
    for (const { family, ...row } of event.changed ?? []) {
        const rows = [...(families[family] ?? [])]
        const index = rows.findIndex((r) => r.method === row.method && r.path === row.path)
        if (index === -1) {
            rows.push({ meanMs: 0, matched: true, ...row })
        } else {
            rows[index] = { ...rows[index], ...row }
        }
        families[family] = rows
    }
    set({
        stats: { ...state.stats, now: event.at ?? Date.now(), totals: event.totals ?? state.stats.totals, families },
    })
}

function sample() {
    const history = { ...state.history }
    const push = (key: string, value: number) => {
        history[key] = [...(history[key] ?? []), value].slice(-HISTORY)
    }
    for (const [family, rows] of Object.entries(state.stats?.families ?? {})) {
        push(family, rows.reduce((sum, row) => sum + row.perSec, 0))
        for (const row of rows) {
            push(`${family} ${row.method} ${row.path}`, row.perSec)
        }
    }
    push("total", state.stats?.totals.perSec ?? 0)
    push("zenoh", (state.rates?.topics ?? []).reduce((sum, t) => sum + t.hz, 0))
    const eventsPerSec = eventsThisSecond
    eventsThisSecond = 0
    set({ history, eventsPerSec, eventHistory: [...state.eventHistory, eventsPerSec].slice(-HISTORY) })
}

/** App calls this once */
export function startLive() {
    if (started) {
        return
    }
    started = true
    readStats()
    readRates()
    const visible = () => document.visibilityState !== "hidden"
    setInterval(() => visible() && readRates(), 1000)
    onDesktopReconnect(readStats) // events sent while the link was down are gone
    setInterval(sample, 1000)
    onDesktopEvent("*", (event: { type?: string }) => {
        eventsThisSecond++
        const entry = { ...event, type: String(event.type ?? "?"), at: Date.now() } as DesktopEvent
        set({ events: [entry, ...state.events].slice(0, 40) })
        if (event.type === "endpoint-stats") {
            applyStatsEvent(event as Parameters<typeof applyStatsEvent>[0])
        }
    })
}

export function useLive(): State {
    return useSyncExternalStore((listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => state)
}

/** GET a Desktop path as JSON, again whenever one of `refreshOn` Desktop events arrives */
export function useJson<T>(path: string | null, refreshOn: string[] = [], init?: () => RequestInit) {
    const [data, setData] = useState<T | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loads, setLoads] = useState(0)
    const [refreshedBy, setRefreshedBy] = useState<string | null>(null)
    useEffect(() => {
        if (!path) {
            return
        }
        let live = true
        getJson<T>(path, init?.()).then(
            (value) => live && (setData(value), setError(null)),
            (e) => live && setError(e.message),
        )
        return () => {
            live = false
        }
    }, [path, loads])
    useEffect(() => {
        const offs = refreshOn.map((type) =>
            onDesktopEvent(type, () => {
                setRefreshedBy(`${type} event · ${new Date().toLocaleTimeString()}`)
                setLoads((n) => n + 1)
            })
        )
        offs.push(onDesktopReconnect(() => setLoads((n) => n + 1)))
        return () => offs.forEach((off: () => void) => off())
    }, [refreshOn.join(",")])
    return { data, error, reload: () => setLoads((n) => n + 1), refreshedBy }
}

/** re-render every `ms` (for "3s ago" labels) */
export function useNow(ms = 1000): number {
    const [now, setNow] = useState(Date.now())
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), ms)
        return () => clearInterval(id)
    }, [ms])
    return now
}
