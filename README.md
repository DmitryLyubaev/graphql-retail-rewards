# GraphQL retail rewards

[![CI](https://github.com/DmitryLyubaev/graphql-retail-rewards/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/DmitryLyubaev/graphql-retail-rewards/actions/workflows/ci.yml)

Bounded synthetic portfolio demonstration of server-side GraphQL, business permissions,
stable history pagination and conditional DynamoDB transactions. The API runs locally
with synthetic accounts and integer points.

[Public repository](https://github.com/DmitryLyubaev/graphql-retail-rewards)

On 1 November 2026 the final-source A1-A7 sample passed on 2aefcef: 80 business
requests, 20 stored effects, actual SIGKILL/restart/replay and owned cleanup in 195.510
seconds. All 86 software tests pass locally and in hosted CI. Fifteen direct SDK protocol
tests cover adapter error classification. Both historical and final-source evidence are
preserved; owned database volumes, app images and seven exact cache records were removed.
These are bounded local observations.
See the [dated report](docs/local-report.md) and [access patterns](docs/access-patterns.md).

GitHub Actions runs the locked install, typecheck/build and existing unit, actual
DynamoDB Local and actual HTTP tests in one Ubuntu job. It uses synthetic credentials
and attempts owned-resource cleanup even after a failed step. The canonical A1-A7
demo is separate from software CI.

## Local setup

Use Node 24, npm and existing Docker/Compose. On Windows the helper uses Docker in
Ubuntu WSL if docker is not selected with the absolute `P26_DOCKER` executable path.
Nothing installs or reconfigures a daemon. Keep an Ubuntu WSL session active while running
host-side checks, so WSL lifecycle shutdown does not stop Docker. Published inspection
ports bind to loopback.

1. `npm ci --ignore-scripts` then `npm run build`.
2. `npm run local:up` starts the file-backed database and writes generated local
   tokens/ports into ignored `.local/runtime.env` and `.local/runtime.json`.
3. `npm run check` runs typecheck/build, unit, actual DynamoDB and actual HTTP checks.
4. `npm run demo` builds the app and runs a new separately bounded A1-A7 sample from
   committed source/frozen fixtures. Previous outputs remain in separate ignored run folders.
5. `npm run local:down` removes only the owned Compose containers/network and retains
   its named database volume and private evidence. No global prune or volume removal.

Windows npm behind a locally trusted TLS inspection root can use
`$env:NODE_OPTIONS='--use-system-ca'` in that shell before installation. TLS verification
stays enabled. The Docker build copies the host's locked, built JavaScript and installed
dependencies; run npm ci/build first. Runtime dependencies are JavaScript, with no native
application modules. The actual pinned Linux image is checked separately.

Schema: [src/schema.graphql](src/schema.graphql). One query reads an account and nested
history; one mutation adjusts points. Alice reads A, Bob reads B; Op can read/adjust
either. Use a generated token from the ignored env as `Authorization: Bearer <token>`.
Caller-supplied role/account headers do not establish identity. Token fixtures are not
an external identity provider. Runtime setup is local Docker Compose.

```graphql
query { account(id: "A") { id balance history(first: 2) {
  upperBound edges { node { sequence delta balanceAfter } cursor }
  pageInfo { hasNextPage endCursor }
} } }
```

```graphql
mutation { adjustPoints(input: {accountId: "A", delta: 7,
  reason: "correction", requestId: "example-1"}) { sequence balanceAfter } }
```

Integer deltas are -1,000..1,000 excluding zero; balances stay 0..1,000,000. Successful
requests retain actor/key/payload receipts and the original result. Failed requests have
no durable receipt. A timeout can mean an unknown outcome; retry the same key/payload.
History traversal captures an upper sequence; newer adjustments require a new traversal.
Use at most one root field, depth six, forty expanded fields and page size 1..20.

Local emulation does not prove managed DynamoDB IAM, durability, throughput or actual
managed transaction-conflict behavior. Loopback protocol fixtures exercise actual SDK
exception mapping with injected responses; process interruption and actual local races
are reported separately in the measured report. Source and safe reports are public;
generated credentials, raw evidence and database files remain outside Git.
