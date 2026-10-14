// dimos-app-server: serves the built page on the unix socket Desktop gives (DIMOS_APP's `socket`), else --port. The page
// reads Desktop directly (same origin); this server has no API of its own.
const flag = (name: string) => {
    const index = Deno.args.indexOf(`--${name}`)
    return index === -1 ? undefined : Deno.args[index + 1]
}
const frontend = flag("frontend") ?? new URL("../frontend/dist", import.meta.url).pathname
const types: Record<string, string> = {
    html: "text/html; charset=utf-8",
    js: "text/javascript",
    css: "text/css",
    svg: "image/svg+xml",
    png: "image/png",
    woff2: "font/woff2",
}

async function serve(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.split("/").filter((part) => part && part !== "..").join("/")
    // a path without an extension is the page; a missing file (e.g. agent.json) is a 404
    const file = path.includes(".") ? path : "index.html"
    try {
        const bytes = await Deno.readFile(`${frontend}/${file}`)
        return new Response(bytes, {
            headers: { "content-type": types[file.split(".").pop()!] ?? "application/octet-stream" },
        })
    } catch {
        return new Response("not found", { status: 404 })
    }
}

const socket: string | undefined = JSON.parse(Deno.env.get("DIMOS_APP") ?? "{}").socket
if (socket) {
    try {
        Deno.removeSync(socket)
    } catch {
        // not there
    }
    Deno.serve({ path: socket, transport: "unix", onListen: () => console.error(`listening on ${socket}`) }, serve)
} else {
    Deno.serve({ port: Number(flag("port") ?? 8787) }, serve)
}
