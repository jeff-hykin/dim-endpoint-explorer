# dim-endpoint-explorer

A [dimOS Desktop](https://github.com/jeff-hykin/dimos-desktop) app that maps **every endpoint family of the running
system**, live, and teaches how data flows between them: Desktop's own API, the dimos server, the agent gateway
(dimcode), every app's endpoints, and zenoh-web's robot topics.

```sh
dimos-desktop install https://github.com/jeff-hykin/dim-endpoint-explorer
```

## Sections

| section       | reads                                                                                | shows                                                                    |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Overview      | `/api/endpoints/stats`, `/api/topics/rates`, Desktop's events (zenoh), `/dimos/runs` | an animated data-flow map, each link carrying live calls/s or messages/s |
| zenoh-web     | `/api/topics`, `/api/topics/rates`, `/api/topics/sample`                             | topics with Hz, bandwidth, sparklines, a sampled payload; zenoh docs     |
| Desktop       | `/api/desktop/openapi`, `/api/desktop/dimos.yaml`                                    | Desktop's API by group, per-endpoint docs and counts, Try it for GETs    |
| dimos server  | `/api/desktop/openapi` (dimos family), `/dimos/runs`, `/dimos/blueprints`            | the same, plus the running blueprint, its phase and the blueprint count  |
| Agent gateway | `/agent/api/openapi`, `POST /mcp` `tools/list`                                       | the gateway's API and the MCP tools the agent calls                      |
| Apps          | `/api/endpoints` (re-read on `endpoints` / `apps` events)                            | every app's endpoints, counts, errors, last call; the events contract    |

The page reads Desktop directly (same origin). Counts update from Desktop's `{type:"endpoint-stats"}` events and a
re-read every 4 s; topic rates are polled every second.

## Endpoints (for Desktop's agent)

| endpoint            | what                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `GET api/summary`   | families with endpoint counts, calls, errors, calls/s; busiest endpoints; topics; the run |
| `GET api/endpoints` | `family=desktop\|dimos\|agent\|app:<name>` (+ `q`): endpoints with live counts            |
| `GET api/stats`     | Desktop's call counts, top endpoints per family (`family`, `top`)                         |

They are built from Desktop's APIs at `DIMOS_APP`'s `desktopUrl` (older Desktops: `--desktop-url`).

## Development

```sh
deno task test && deno task check     # backend tests (against a stand-in Desktop), dimos.yaml ↔ routes check
cd frontend && npm install && npm run typecheck && npm run build
deno task mock                        # a stand-in Desktop on :7399 with live-looking traffic (tests/fixtures);
                                      # the built page at http://127.0.0.1:7399/apps/dim-endpoint-explorer/
cd frontend && npm run dev            # vite, proxying Desktop's paths to DESKTOP (default the mock)
deno run -A scripts/shots.ts <page url> <dir>   # screenshots of every section, both themes
nix build .#dimosApp                  # what Desktop builds: bin/dimos-app-server
```

Licensed under Apache-2.0.
