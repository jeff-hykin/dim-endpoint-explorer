// Animated edges for the data-flow map: one requestAnimationFrame loop moves every edge's dashes at a speed that grows
// with its live rate (calls/s or messages/s); an idle edge stands still and fades.
import { useEffect, useRef } from "react"

type Edge = { path: SVGPathElement; rate: number; offset: number }
const edges = new Set<Edge>()
let running = false
let last = 0

function frame(time: number) {
    const dt = Math.min(0.1, (time - last) / 1000)
    last = time
    for (const edge of edges) {
        if (edge.rate > 0) {
            edge.offset -= dt * (18 + 34 * Math.log2(1 + edge.rate))
            edge.path.style.strokeDashoffset = edge.offset.toFixed(1)
        }
    }
    if (edges.size) {
        requestAnimationFrame(frame)
    } else {
        running = false
    }
}

export function curve(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(30, Math.abs(x2 - x1) * 0.5)
    const sx = x2 >= x1 ? 1 : -1
    return `M${x1},${y1} C${x1 + dx * sx},${y1} ${x2 - dx * sx},${y2} ${x2},${y2}`
}

export function FlowEdge({ d, rate, label, kind = "call", mid, dashed = false }: {
    d: string
    rate: number
    label?: string
    kind?: "call" | "msg" | "event" | "static"
    mid?: [number, number]
    dashed?: boolean
}) {
    const ref = useRef<SVGPathElement>(null)
    const edge = useRef<Edge | null>(null)
    useEffect(() => {
        if (!ref.current) {
            return
        }
        const mine: Edge = { path: ref.current, rate, offset: 0 }
        edge.current = mine
        edges.add(mine)
        if (!running) {
            running = true
            last = performance.now()
            requestAnimationFrame(frame)
        }
        return () => {
            edges.delete(mine)
        }
    }, [])
    useEffect(() => {
        if (edge.current) {
            edge.current.rate = rate
        }
    }, [rate])
    const active = rate > 0
    const width = active ? Math.min(4.5, 1.8 + Math.log2(1 + rate) * 0.6) : 1.6
    return (
        <g className={`edge edge-${kind} ${active ? "active" : "idle"}`}>
            <path className={`edge-base ${dashed ? "dashed" : ""}`} d={d} />
            <path ref={ref} className="edge-flow" d={d} style={{ strokeWidth: width }} />
            {label && mid && (
                <g className="edge-label" transform={`translate(${mid[0]},${mid[1]})`}>
                    <rect x={-label.length * 3.3 - 7} y={-9} width={label.length * 6.6 + 14} height={18} rx={9} />
                    <text textAnchor="middle" dy="4">{label}</text>
                </g>
            )}
        </g>
    )
}
