---
name: livetime
description: Integrate Livetime topic-based pub/sub into an app with the JavaScript SDK or raw HTTP long polling. Use when implementing topic subscriptions, publishing JSON events, or consuming Livetime poll responses.
---

# Use Livetime

Use the starter's [JavaScript SDK](../../sdk/livetime.mjs) in a modern browser or Node.js 20+. If the skill is used on its own, obtain the SDK from the [Livetime SDK repository](https://github.com/Sandify-io/livetime-sdk) or implement the HTTP calls below. The default sandbox base URL is `https://livetime.sandbox.whatee.io`.

## SDK workflow

1. Name topics for the app's domain. A sandbox test can use a fresh topic such as `demo:updates:${crypto.randomUUID()}`.
2. Call `subscribe([topic], { signal })` and process the returned `events` when present.
3. Start `for await (const batch of sdk.listen(token, { signal }))`. Decode each event with `decodeEvent(raw)` and validate its shape before updating application state.
4. Call `publish([topic], event, { signal })` with JSON-serializable data. A successful publish response indicates acceptance. A subscriber observes delivery through its poll response.
5. Abort the subscription's poll loop when the client leaves the view or switches topics. Handle transient failures with backoff when the app needs automatic retries. Resubscribe to obtain a fresh token when the current token expires.

Keep one long poll in flight for each subscription. Empty batches are valid. Use a stable application event ID when the client needs to discard duplicates.

## HTTP contract

| Endpoint | Request | Result |
| --- | --- | --- |
| `POST /subs` | `{"events":["app:updates"]}` | A poll token and optional buffered `events` |
| `POST /publish2` | `{"Topics":["app:updates"],"Payload":"<base64>","NotUrgent":false}` | A successful HTTP status indicates acceptance |
| `GET /poll?token=…` | URL-encoded current token | `events` and an optional `sequential_token` for the next poll |

Send POST requests with `Content-Type: application/json`. Encode the JSON payload as UTF-8 Base64 for `Payload`. Preserve the field casing in the table. Use the current token when the poll response omits a replacement.

Verify the integration with two independent subscribers on a fresh test topic. Start both poll loops, publish a synthetic event, and confirm both receive the expected event ID. Use your deployment's topic authorization for private data.
