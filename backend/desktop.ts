// Desktop's own HTTP API, read by the backend: the URL is DIMOS_APP's `desktopUrl` (docs/apps.md), else Desktop's
// default port.
import { HttpError } from "./http.ts"
import { dimosApp } from "./dimos_app.ts"

const TIMEOUT_MS = 4000

let base = (dimosApp.desktopUrl ?? "http://127.0.0.1:7077").replace(/\/+$/, "")

export function desktopUrl(): string {
    return base
}

/** tests point the backend at a stand-in Desktop */
export function setDesktopUrl(url: string) {
    base = url.replace(/\/+$/, "")
}

/** GET (or POST with a JSON body) one of Desktop's endpoints as JSON; null when `optional` and it isn't there. */
export async function desktopJson<T = unknown>(
    path: string,
    { body, optional = false }: { body?: unknown; optional?: boolean } = {},
): Promise<T | null> {
    let response: Response
    try {
        response = await fetch(base + path, {
            method: body === undefined ? "GET" : "POST",
            headers: body === undefined ? undefined : { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
    } catch (error) {
        if (optional) {
            return null
        }
        throw new HttpError(
            502,
            `Desktop (${base}) didn't answer ${path}: ${error instanceof Error ? error.message : error}`,
        )
    }
    if (!response.ok) {
        await response.body?.cancel()
        if (optional) {
            return null
        }
        throw new HttpError(502, `Desktop answered ${response.status} for ${path}`)
    }
    return await response.json() as T
}
