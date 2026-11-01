# Local rewards demonstration report

Date: 1 November 2026, Australia/Brisbane. One measured local runtime sample, not a
production or throughput study. One fresh whole-branch review and its bounded
correction pass are complete. Owner-approved local integration completed on 1 November 2026.

## Source and reproducibility

Measured executable source: `96dd3844b50dacb9a3bd14b51373264d80fbcc06`.
Corrected software source: `58f462046deb603ecb986caf7727e2f400c67115`.
The full runtime sample was not repeated on corrected source; its validation is the
four additional actual-database regression cases and complete software suite.

Run: `p26-mvwyd8je-run-23960313`. Runtime: Node v24.14.0, Linux/amd64 application image,
DynamoDB Local 3.3.2, existing WSL Docker 29.7.2 / Compose v5.4.0.

- Actual acceptance fixture SHA-256: `fca4ac16c8c8d030502c7a41067fbaa1a32594653bcec8b8ea2ab63d761376dc`.
- Independent expected fixture SHA-256: `660ead9be63a81255c08c0727c972fc2995ff55e61db59c11b5a48674cd0233a`.
- Dependency lock SHA-256: `0d3000e4730c71210aff81824f75f96561bd86bff9e9d396c246817dc10c3a18`.
- Measured app image: `sha256:db1dfcd12b4acf9a8659b54c60a3f48a0fb7a12840d40118726c94ee015384d0`.
- Node base: 24.14.0-bookworm-slim, pinned digest in Dockerfile.
- DynamoDB Local: 3.3.2, pinned digest in compose.yaml.

Hashes describe actual measured bytes, including line endings. The private measured
snapshot preserves and hash-verifies 70 source/fixture/compiled files; the Git bundle
preserves the immutable source history. No generated token or HMAC secret is published.

## Separate software verification

Pre-acceptance typecheck/build and 67 tests passed: 14 unit, seven actual DynamoDB
integration and 46 actual HTTP tests. Forty-three HTTP tests exercise the frozen A2
rejection manifest. A fresh post-run 67-test check also passed. Tests and their fixtures
are separate from the one runtime sample. No silent skips were used.

The pinned Linux image passed a separate manual read/write/history smoke test. That
fixture and its operations are not included in canonical runtime counts. RED/GREEN
records also cover a local listener that accepts but never responds: SDK request timeout
now throws within its bounded call budget rather than hanging setup/readback.

## Measured A1-A7 result

All seven groups passed. Runtime `2026-10-31T22:28:51.929Z` to `2026-10-31T22:32:07.131Z` UTC,
08:28:51.929 to 08:32:07.131 Brisbane, 1 November 2026.
A1-A7 including owned cleanup took 195.202 seconds. Whole command
including source-image preparation took 251.785
seconds, below the fifteen-minute bound. One sample only; no latency/throughput claim.

| Group | Observed result |
|---|---|
| A1 | A=115/B=50; two adjustments/receipts, expected reads and writes. |
| A2 | All 43 rejection cases matched expected HTTP/domain behavior; isolated before/after state unchanged. One separate setup adjustment establishes a receipt for member-replay denial. |
| A3 | Frozen pages 5/4, 3/2, 1 exclude later sequence 6; new traversal sees 6. A=115, six entries/receipts. Invalid history cursor preserves allowed sibling balance. |
| A4 | Four concurrent identical submissions produce one effect; three changed-payload reuses reject; original replay remains 107 after a later +1. Final A=108, two entries/receipts. |
| A5 | Eight unique increments with at most four in flight yield A=108/sequence 8. Of two B -40 debits, one commits and one is insufficient: B=10/sequence 1. Nine total entries/receipts. |
| A6 | Strong external receipt/state readback confirms A=109 before actual application SIGKILL and loss of the in-flight response. App/database restart with retained volume and original credentials; same-key replay returns original result. One entry/receipt, no additional effect. |
| A7 | Zero owned running containers and closed inspection ports after cleanup. Named volume and evidence retained. |

| Count | Observed |
|---|---:|
| Business HTTP requests | 80 |
| Separate setup HTTP requests | 1 |
| Business mutation submissions | 49 |
| Successful mutation responses, including replay | 24 |
| Rejected mutation responses | 24 |
| Successful replay responses | 5 |
| Actual lost mutation response | 1 |
| Independently verified business effects | 20 |
| Logged transaction submissions, including setup | 31 |
| Separate strong stored-state readback snapshots | 117 |

The 20 business effects exclude the one A2 setup effect. Transaction submissions and
HTTP requests are different counts; concurrent conditional retries can submit more
transactions than commit. A6's original request committed but returned no HTTP success.
The replay count describes this frozen sample, not distributed exactly-once delivery.

## Preparation failure retained

The original preparation command at source 293e9a8 failed before any acceptance group or
business request. Rebuilding the app tag left the old smoke container's image reference
unavailable to Compose image inventory. The exact stale-container failure was reproduced;
inventory succeeded after recreation. Source 96dd384 moves inventory after app recreation
and inside owned cleanup. Original console/metadata remain private and unchanged. Owned
preparation containers/network were stopped with the volume retained. This preparation
failure did not become an erased or passing runtime sample.

## Cleanup and limitations

Canonical cleanup retained volume `p26-mvwyd8je_data`, the project image/build cache and
private raw evidence. No other project's resources were removed. The database was then
restarted solely for separate software checks, then stopped/removed again. Final
closeout independently verified zero owned running containers and closed app/database
ports; the named volume remains. Locked offline npm ci plus the full 71-test check passed.
At local closeout there was no public remote or hosted CI. No cloud deployment,
paid model call or customer use occurred.

This proves one bounded local GraphQL/NoSQL demonstration. DynamoDB Local does not throw
managed TransactionConflictExceptions. Unit checks inject repository conflict/unknown
outcomes to verify service behavior; managed SDK exception mapping remains unverified.
Actual local conditional races and the actual process kill are separate evidence.
No managed AWS IAM, cloud durability, scale, cost, availability, financial compliance,
commercial tenure or general idempotency guarantee follows. Generated local bearer
credentials prove fixture authentication/permissions, not an external identity provider.

## Review and correction

One fresh reviewer inspected fb1db11..96dd384 against the approved design, code and
runtime evidence: zero Critical, one Important and one Minor finding. The Important
finding was receipt/balance read interleaving: an identical request committed after an
absent receipt read could cause a false insufficient/balance/sequence rejection.

All four cases failed on original source against real isolated DynamoDB: exact draining
debit, exact credit reaching the balance ceiling, exact sequence ceiling and changed-key
payload precedence. Corrected source 58f4620 rereads and resolves a successful receipt
before returning a state-derived business rejection. All four pass; one effect remains.
The full corrected suite passes 71 tests: 14 unit, eleven actual DB and 46 actual HTTP,
with zero failures or skips. The original A1-A7 evidence/snapshot remains unchanged;
no claim is made that it measures the corrected executable.

Deferred Minor: adapter-level managed SDK exception mapping tests are absent. Draft
wording was narrowed to the service-level injected repository outcomes actually tested.
Managed AWS behavior remains outside this local scope. A large-history readback utility
and other-host portability are not claimed beyond the fixed fixtures/observed setup.

The reviewer accidentally invoked the recompiling wrapper during intended read-only
review. Only ignored compiled files were rewritten, all matched the saved measured
snapshot by hash, and source/index/HEAD were unchanged. The original snapshot was untouched.

## Local integration, 1 November 2026

Dmitry chose local merge. Main fast-forwarded to 3530774, and a fresh primary-checkout
locked offline install, typecheck/build and all 71 tests passed: 14 unit, eleven actual
DynamoDB and 46 actual HTTP, zero failures/skips, test-run elapsed 25.021 seconds.
This is software verification, not another canonical A1-A7 run.

The retained volume's original A6 account/history/receipt readback matched the original
measured result exactly after software verification. Verification containers/network
were stopped/removed, with both owned ports closed. One named database volume remains.

All 116 pre-integration archive files were SHA-256 reverified, and every retained evidence/
workflow file in the worktree matched its primary archive copy before normal Git worktree
retirement. The archived source bundle verified as a complete history. The merged worktree
and codex/local-demo branch were removed; only the primary main checkout remains. The
previously blocked standalone scratch-folder deletion is historical; ordinary Git worktree
retirement occurred after the owner's explicit local-merge choice. No alternative standalone
scratch deletion command was used. At that checkpoint source/evidence were local,
with no product remote or push. Publication is recorded separately below.

## Public source publication, 1 November 2026

Dmitry authorized publication. Source, synthetic fixtures, schema, README, access-pattern
map and this safe measured report are published at
[graphql-retail-rewards](https://github.com/DmitryLyubaev/graphql-retail-rewards).
The repository has secret scanning and push protection enabled. Before publication,
all 57 historical blobs were checked for generated run credentials, private-artifact
paths and common credential signatures; all commit authors use the personal identity.
Publication changes documentation only; executable source and the prior 71-test software
verification are unchanged. The original A1-A7 sample remains tied to96dd384.

Raw evidence, private archives, generated bearer/HMAC credentials, database files,
node_modules and build output remain ignored and unpublished. No new canonical run,
paid call, cloud/application deployment or hosted CI was added for this source publication.
