# dim-endpoint-explorer

A [dimOS Desktop](https://github.com/jeff-hykin/dimos-desktop) app that shows every component's **dimos.yaml**: Desktop,
the dimos gateway, and each installed app. For each: its description, the endpoints it `provides` (method, path,
description, params, role), the endpoints it `uses` and whose they are, and who uses each of its endpoints.

```sh
dimos-desktop install https://github.com/jeff-hykin/dim-endpoint-explorer
```

It reads only dimos.yaml, as Desktop serves it (same origin):

| source                                 | what                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/desktop/dimos.yaml`          | Desktop's dimos.yaml; its `/dimos-gateway/*` endpoints are the gateway |
| `GET /api/apps`                        | the installed apps                                                     |
| `GET /api/apps/{pkg}/dimos-yaml-check` | each app's declared `provides` and `uses`                              |
| `GET /api/endpoints`                   | descriptions and params of each app's provided endpoints               |

A component without a dimos.yaml (the agent gateway) isn't shown. The backend only serves the page.

## Development

```sh
deno task test                          # the parsing and cross-reference (frontend/src/model_test.ts)
cd frontend && deno task build         # deno check, then vite (deno 2.6.10, nixos-25.11's; frontend/deno.json holds every dependency)
cd frontend && deno task dev            # vite, proxying /api to DESKTOP (default http://127.0.0.1:5555)
nix build .#dimosApp                    # what Desktop builds: bin/dimos-app-server
deno task update-hashes                 # after frontend/deno.json, deno.lock or the dimos-react tag change: flake.nix's hashes
```

Licensed under Apache-2.0.
