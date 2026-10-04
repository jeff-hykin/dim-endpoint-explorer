// Screenshots of every section in both themes (headless Chrome): `deno run -A scripts/shots.ts <page url> <out dir>`.
import { chromium } from "playwright-core"

const [base = "http://127.0.0.1:7399/apps/dim-endpoint-explorer/", out = "shots", prefix = ""] = Deno.args
const executablePath = Deno.env.get("CHROME") ??
    `${
        Deno.env.get("HOME")
    }/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`
await Deno.mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath })
const sections = ["overview", "zenoh", "desktop", "dimos", "agent", "apps"]
for (const scheme of ["dark", "light"] as const) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: scheme,
        deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    page.on("pageerror", (error) => console.error(`[${scheme}] page error:`, error.message))
    for (const section of sections) {
        await page.goto(`${base}#${section}`)
        await page.waitForTimeout(section === "zenoh" ? 3500 : 2500)
        if (section === "zenoh") {
            await page.locator("table.topics tbody tr").nth(1).click({ timeout: 1500 }).catch(() => {})
            await page.waitForTimeout(2000)
        }
        if (section === "desktop" || section === "dimos" || section === "agent") {
            await page.locator(".ep-row").first().click({ timeout: 1500 }).catch(() => {})
            await page.waitForTimeout(400)
        }
        const file = `${out}/${prefix}${section}_${scheme === "dark" ? "portal" : "research"}.png`
        await page.screenshot({ path: file, fullPage: true })
        console.log(file)
    }
    await context.close()
}
await browser.close()
