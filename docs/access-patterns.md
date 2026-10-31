# Rewards access patterns

One local DynamoDB table per isolated run/scenario, with string PK/SK. There are no
secondary indexes, application Scans, FilterExpressions, streams or TTLs. Opening
balances A=100/B=50 are setup state; opening balances do not create history entries.

| API/service need | Access | Reason |
|---|---|---|
| Account balance/sequence | Strong GetItem, PK ACCOUNT#A or ACCOUNT#B, SK STATE | One known account, no account-list query. |
| Bounded newest-first history | Strong Query over account PK and ADJ#0000001..ADJ#1000000 sort keys, descending, at most first+1 items | Per-account ordered immutable adjustments; first+1 establishes whether another page exists. |
| Original request result | Strong GetItem, PK REQUEST#op, SK requestId | Successful identity is operator plus request ID across both accounts. |
| Adjustment | TransactWriteItems: conditional state Update, immutable history Put, successful receipt Put | All three effects commit together; state sequence prevents lost updates and receipt absence prevents duplicate effects. |

The service checks verified-actor business permissions before accessing data or replaying
a result. Members cannot write. Every continuation reauthorizes the account and verifies
a cursor signed for that actor/account. No account header establishes identity.

State contains id, openingBalance, current balance and sequence. Each history item
contains accountId, sequence, requestId, delta, reason and balanceAfter. Receipts retain
the normalized tuple (version, actorId, accountId, delta, reason) and full original result.
Request field order and JSON whitespace are irrelevant; reason text is preserved rather
than trimmed. A valid changed payload with an existing key is CONFLICTING_REQUEST.

The transaction updates only the expected sequence, with balance/sequence bounds on the
Update. Both Puts require absent keys. A cancellation causes a strong receipt reread
and a bounded retry against fresh state. Confirmed contention is different from a
transport timeout whose commit outcome may be unknown. Receipt absence after timeout
does not establish rollback. Retrying the same identity can recover the original result.

Only successful requests retain a receipt. A formerly insufficient debit can succeed
after funding. Successful retries return the original balanceAfter/sequence, including
after subsequent adjustments. The DynamoDB client-token window is not the durable rule.

History captures an upper sequence on its first page. Each HMAC-SHA256 cursor carries
version, actor/account, upperBound and the last emitted sequence. Subsequent queries
exclude keys at/above that last sequence and above the original bound. A new adjustment
cannot shift that traversal; a new first-page request sees it. The current account
balance can be newer than continued history. There is no cross-field snapshot promise.

The operator receipt partition is deliberately sufficient for three actors/two accounts;
this is not an enterprise partitioning, hot-key, multi-tenant or throughput design.
Local transactions do not prove managed DynamoDB IAM/durability or managed conflict
exceptions. See the [dated local report](local-report.md) for actual evidence and limits.
