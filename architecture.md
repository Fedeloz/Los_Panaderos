# Cloudflare deployment architecture

## Baseline

This plan is based on Fede's latest delivered `origin/main` commit `6f76e89`. The application already contains a multi-page CECOP frontend, a stochastic Python simulation with scouts, extinguisher drones and fire engines, a local threaded HTTP controller, HappyRobot MCP integration, and a separate JavaScript Cloudflare KV state API.

The target account is reported to have the $5/month Workers Paid plan. The account itself cannot be inspected from this repository, so plan status and usage must be confirmed in the Cloudflare dashboard before production. At normal demo traffic, the design is expected to add no cost beyond the existing subscription and optional domain registration; overages remain possible if included quotas are exceeded.

## Target system

```text
Browser
  ├─ static CECOP assets ──> Workers Static Assets
  └─ /api/* ──────────────> Python Worker
                                  └─ Durable Object per browser session
                                       ├─ Simulation
                                       ├─ DeterministicFleetPolicy
                                       ├─ controller/playback state
                                       ├─ bounded recording
                                       └─ SQLite-backed checkpoint
```

The deployment requires no HappyRobot account, MCP proxy, AI model API, phone integration, Telegram integration, external database, conventional server, container, or long-running thread.

## Main decisions

### Keep the simulation engine

`simulator/engine.py` remains authoritative for:

- stochastic fire spread and suppression;
- terrain and wind;
- shared observations and stale memory;
- route planning and stand-off safety;
- scouts, extinguisher drones and trucks;
- district warning delivery and evacuation movement;
- command validation and coordination conflict handling.

The engine remains Cloudflare-independent and locally testable.

### Replace HappyRobot with deterministic policy code

A new `simulator/policy.py` returns the same complete decision structure accepted by `Simulation.apply()`:

- one order for every extinguisher drone;
- one order for every scout;
- one order for every truck;
- mission and reason strings.

The policy only reads the same observation-bounded state already exposed by the simulation. It never reads hidden fire truth to choose strategic targets. The engine continues to reject stale, unsafe, incomplete, duplicate or invalid orders.

The policy priorities are:

1. physically warn unwarned districts at urgent downwind risk;
2. send scouts to safe smoke-report approaches or useful patrol sectors;
3. send extinguisher drones to validated containment positions after confirmation;
4. approach unconfirmed smoke from a safe flank without blind suppression;
5. assign trucks to confirmed sectors, or the reported sector while mobilizing;
6. avoid duplicate district reservations;
7. hold safely when no useful validated target exists.

Human-readable explanations are deterministic templates. The UI describes this as an autonomous decision policy, not AI.

### One Durable Object per anonymous browser session

The Worker sets a random `HttpOnly; Secure; SameSite=Lax` session cookie. Its UUID names a `SimulationSession` Durable Object. This gives each browser an isolated incident, serialized mutations, in-memory speed while active and durable restoration after eviction.

The Durable Object is request-driven. It does not run a Python background thread. While Live is playing, requests apply bounded elapsed-time catch-up. Paused or absent clients perform no simulation work. One expiry alarm removes abandoned session storage.

### Retire the separate KV state API from the web deployment

The current `state-api/` Worker exists to exchange incident state with HappyRobot. Once HappyRobot is removed, that network hop, bearer token and KV writes are unnecessary.

The deployed app builds archive/shared-state views directly from the session's `Simulation` using `build_state()`. The existing `state-api/` source may remain temporarily as historical/legacy code, but production does not call it and no `STATE_API_TOKEN` is required.

### Client-side replay

The Durable Object stores only the authoritative current checkpoint. Timeline and recording frames belong exclusively to the browser; `seek` is not a server action and never invokes Python, the policy or Durable Object storage. Browser replay may use memory or IndexedDB and returning to Live fetches the authoritative state. Durable Object eviction therefore cannot lose authoritative state and carries no replay-memory cost.

## Request lifecycle

### Static requests

Matched static files are served directly by Workers Static Assets without Python execution. Page aliases are handled by the Worker only where the existing local server maps extensionless routes:

- `/` and `/situacion` -> `situacion.html`;
- `/incidente` and `/incidente/brunete` -> `incidente.html`;
- `/medios` -> `medios.html`;
- `/archivo` -> `archivo.html`.

### API requests

The Python Worker handles:

- `GET /api/health` without waking a session;
- `GET /api/state` for authoritative state;
- `POST /api/action` for validated mutations;
- `GET /api/recording` for an explicit bounded recording;
- `GET /api/shared` for a trimmed local `build_state()` view;
- `GET /api/config` for non-secret public configuration only.

For session requests the Worker validates the cookie, method, same-origin POST, JSON content type, body size, action and fields, then invokes one Durable Object RPC method.

### Persistence

`Simulation` gains a versioned JSON-safe checkpoint. It includes all future-driving state plus both seeded random generator states. Restore tests must prove that an original and JSON-round-tripped simulation produce identical future states.

A session checkpoint adds controller state such as running, automatic decisions, speed, next decision tick, last-update time and a bounded `decisions[]` audit trail. Each decision records its triggering event, tick, per-vehicle orders, mission, reason, result and `accepted`/`rejected` status. Rejected orders pause and are persisted; unexpected action failures roll back in-memory mutations before returning an error.

## Code changes

### `simulator/engine.py`

- add `checkpoint()` and `restore()`;
- serialize `random.Random.getstate()` for both RNGs;
- preserve sets, tuples, vehicle aliases and satellite blocks across JSON round trips;
- replace HappyRobot-specific wording in runtime rules/logs with policy-neutral wording.

### `simulator/policy.py`

- add `DeterministicFleetPolicy`;
- cover every configured vehicle exactly once;
- use only observation-bounded operational inputs;
- produce stable output for identical simulation state.

### `simulator/session.py`

- add a thread-independent controller;
- implement action dispatch, elapsed-time catch-up, policy scheduling and checkpoints;
- provide the same public state shape required by the current frontend.

### `simulator/server.py`

- remain an optional thin HTTP adapter around `SimulatorSession`;
- remove all HappyRobot imports, subprocess calls, modes and duplicate controller logic;
- stop publishing to or polling the external state API;
- retain existing local page/API routes while replay remains browser-owned.

### `simulator/cloudflare.py`

- export the Python `Default(WorkerEntrypoint)` and `SimulationSession(DurableObject)`;
- route API/page aliases;
- manage cookies and validation;
- store and restore session checkpoints;
- serve aliases through the static asset binding.

### Frontend

- replace HappyRobot/agent wording with deterministic policy wording in Spanish and English;
- remove workflow links, deliberation latency and MCP evidence;
- stop unconditional 600 ms polling when paused, replaying or hidden;
- keep replay local where practical;
- preserve all CECOP pages and visual behavior.

### Tests

Keep all engine safety/physics tests. Replace HappyRobot parser/transport tests with:

- policy completeness and deterministic decisions;
- urgent district warning behavior;
- confirmed-fire containment behavior;
- checkpoint round trip and future equivalence;
- session isolation and bounded catch-up;
- Worker API validation and Durable Object restoration;
- static page alias behavior.

## Cloudflare configuration

The root `wrangler.jsonc` will declare:

- Python entry point and current compatibility date;
- `python_workers` compatibility flag while still documented by Cloudflare examples;
- static asset directory `simulator/static` with automatic HTML handling;
- Worker-first execution only for `/api/*`; page aliases and canonical redirects live in `_redirects`;
- a `_headers` policy with CSP, clickjacking, MIME, referrer and permissions protections;
- JSON content-type, same-origin, body-size, action and per-action field validation;
- structured operational logs and bounded JSON 400/500 responses;
- `SIMULATIONS` Durable Object binding;
- declarative SQLite-backed Durable Object export;
- conservative CPU limit;
- Workers Logs.

The Worker uses a dedicated `pyproject.toml` with only Workers development/runtime packages. The unrelated geospatial dependency set is not bundled.

## Domain and TLS

The initial deployment gets a free URL:

```text
los-panaderos.<account-subdomain>.workers.dev
```

This is adequate for staging and demos. A custom owned domain is not free, but Cloudflare Registrar sells registrations at registry/ICANN cost without markup. A subdomain under an already owned domain is free to create.

For production, attach an exact Custom Domain such as `fire.example.com`. Cloudflare creates its DNS record and managed TLS certificate. No origin IP, reverse proxy, Certbot or certificate renewal is needed. Root and `www` are separate hostnames and need separate attachment or a redirect.

## Cost check for Workers Paid

Pricing checked on 22 September 2026:

- Workers: 10 million requests and 30 million CPU-ms/month included;
- static asset requests: free and unlimited;
- Durable Objects: 1 million requests and 400,000 GB-s/month included;
- SQLite Durable Object storage: 25 billion rows read, 50 million rows written and 5 GB-month included;
- Workers Logs: 20 million events/month included;
- no Worker bandwidth/egress charge.

At one live update per second, one active visitor-hour creates about 3,600 Worker requests and 3,600 Durable Object RPC requests. The included Durable Object request allocation is roughly 277 aggregate active visitor-hours/month. Polling only while Live and batching elapsed steps materially increases that capacity.

Expected normal demo cost is the existing $5/month plus optional annual domain registration. This is not an unconditional guarantee. Before launch, confirm Workers Paid and Standard usage in the dashboard, configure usage notifications, set a Worker CPU limit, verify the domain zone and inspect staging CPU/request/storage telemetry.

## Delivery order

1. Add policy tests and deterministic fleet policy.
2. Add engine/session checkpoints and future-equivalence tests.
3. replace the local Controller's HappyRobot path with the shared session core.
4. Add Python Worker, Durable Object and static assets configuration.
5. Update frontend text and polling behavior.
6. Run Python, JavaScript and local Worker tests.
7. Deploy to the free `workers.dev` staging URL and measure usage.
8. Attach a custom domain only after staging validation.

## References

- https://blog.cloudflare.com/python-workers-ga/
- https://developers.cloudflare.com/workers/languages/python/how-python-workers-work/
- https://developers.cloudflare.com/durable-objects/get-started/
- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
