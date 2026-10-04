// A small markdown renderer for the docs Desktop writes in its openapi (tag and operation descriptions): headings,
// paragraphs, lists, fenced code, tables, `code`, **bold**, *italic*, [links](url). No HTML passes through.
import { Fragment, type ReactNode } from "react"

function inline(text: string, key = 0): ReactNode[] {
    const out: ReactNode[] = []
    const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text))) {
        if (match.index > last) {
            out.push(text.slice(last, match.index))
        }
        const token = match[0]
        const k = `${key}-${match.index}`
        if (match[1]) {
            out.push(<code key={k}>{token.slice(1, -1)}</code>)
        } else if (match[2]) {
            out.push(<strong key={k}>{inline(token.slice(2, -2), key + 1)}</strong>)
        } else if (match[3]) {
            out.push(<em key={k}>{inline(token.slice(1, -1), key + 1)}</em>)
        } else {
            const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!
            const safe = /^(https?:|\/|#|\.)/.test(href) ? href : "#"
            out.push(
                <a
                    key={k}
                    className="dim-link"
                    href={safe}
                    target={safe.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                >
                    {label}
                </a>,
            )
        }
        last = match.index + token.length
    }
    if (last < text.length) {
        out.push(text.slice(last))
    }
    return out
}

export function Markdown({ text, className = "" }: { text?: string; className?: string }) {
    if (!text) {
        return null
    }
    const lines = text.replace(/\r/g, "").split("\n")
    const blocks: ReactNode[] = []
    let i = 0
    while (i < lines.length) {
        const line = lines[i]
        if (/^```/.test(line)) {
            const body: string[] = []
            i++
            while (i < lines.length && !/^```/.test(lines[i])) {
                body.push(lines[i++])
            }
            i++
            blocks.push(<pre key={i} className="md-pre">{body.join("\n")}</pre>)
        } else if (/^#{1,6}\s/.test(line)) {
            const level = line.match(/^#+/)![0].length
            const content = inline(line.replace(/^#+\s*/, ""), i)
            blocks.push(level <= 2 ? <h4 key={i}>{content}</h4> : <h5 key={i}>{content}</h5>)
            i++
        } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
            const ordered = /^\s*\d+\./.test(line)
            const items: ReactNode[] = []
            while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) {
                const indent = lines[i].match(/^\s*/)![0].length
                let item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "")
                i++
                while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) {
                    item += " " + lines[i++].trim()
                }
                items.push(<li key={i} className={indent >= 2 ? "sub" : undefined}>{inline(item, i)}</li>)
            }
            blocks.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>)
        } else if (/^\s*\|/.test(line)) {
            const rows: string[][] = []
            while (i < lines.length && /^\s*\|/.test(lines[i])) {
                const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
                if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) {
                    rows.push(cells)
                }
                i++
            }
            blocks.push(
                <table key={i} className="dim-table md-table">
                    <thead>
                        <tr>{rows[0]?.map((c, j) => <th key={j}>{inline(c, j)}</th>)}</tr>
                    </thead>
                    <tbody>
                        {rows.slice(1).map((row, r) => (
                            <tr key={r}>{row.map((c, j) => <td key={j}>{inline(c, j)}</td>)}</tr>
                        ))}
                    </tbody>
                </table>,
            )
        } else if (line.trim() === "") {
            i++
        } else {
            const para: string[] = []
            while (
                i < lines.length && lines[i].trim() !== "" && !/^(```|#{1,6}\s|\s*([-*]|\d+\.)\s|\s*\|)/.test(lines[i])
            ) {
                para.push(lines[i++].trim())
            }
            blocks.push(<p key={i}>{inline(para.join(" "), i)}</p>)
        }
    }
    return <div className={`md ${className}`.trim()}>{blocks.map((b, k) => <Fragment key={k}>{b}</Fragment>)}</div>
}
