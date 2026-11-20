# Realtime events over HTTP

Publish to named topics and deliver updates to your app as they happen. Use Livetime for live chat, agent responses and app events.
## [`https://zen.api.whatee.io/livetime?lang=en#use-cases`](Use Cases)
## Use the SDK and skills

| File | Purpose |
| --- | --- |
| [`sdk/livetime.mjs`](sdk/livetime.mjs) | Dependency-free JavaScript SDK for modern browsers and Node.js 20+ |
| [Livetime skill](skills/livetime/SKILL.md) | Subscribe, publish, and receive events in your own app |
| [Chat demo skill](skills/livetime-chat/SKILL.md) | Build a shared chat with automatic guest sign-in and message receipts |
| [`demo/`](demo/) | Standalone HTML and JavaScript chat example |

Give your AI agent the Livetime skill and try this prompt.

> Use the Livetime skill to add live updates to my app.

The SDK defaults to the sandbox. Pass `createLivetime({ baseUrl })` to use a different deployment.

## Run the chat demo

With Node.js 20+ installed, run this from the repository root.

```bash
npm start
```

Open [the chat demo](http://localhost:8000/demo/). Two panels open automatically. Each panel gets its own random guest name and subscription to the shared room. Select **Open another tab** to add two more guests to that room. Each panel logs its subscribe, publish, and poll calls.

Type in one panel to see the typing indicator in the other panels. **Delivered** means at least one other guest received the message. **Read** means at least one other guest focused or interacted with the chat while the message was available. To see both states in order, send a message, wait for **Delivered**, then click a receiving panel in the same tab or another tab.

The start command uses Node.js built-ins to serve the HTML and JavaScript.

The demo uses `https://livetime.sandbox.whatee.io`. The page derives the topic from the demo directory URL, so everyone who opens the same deployment joins the same public room. Use synthetic messages in the sandbox.


## Three endpoints for realtime delivery

Subscribers choose topics and poll for new events. Publishers send updates to the same topics.

**Sandbox host** `https://livetime.sandbox.whatee.io` · [Download JS SDK](sdk/livetime.mjs) · [AI guide](skills/livetime/SKILL.md)

Send POST requests with `Content-Type: application/json`.

### Subscribe · `POST /subs`

Send the topics you want to follow in the `events` array. Use the returned token to start polling.

```json
{ "events": ["demo:updates"] }
```

### Publish · `POST /publish2`

Encode your JSON payload as UTF-8 Base64 and publish it to one or more topics.

```json
{
  "Topics": ["demo:updates"],
  "Payload": "<base64>"
}
```

### Poll · `GET /poll`

The server can hold this request open while waiting for events. When it responds, start the next poll with the returned `sequential_token`. Reuse the current token if the response omits a replacement.

```http
GET /poll?token=<token>
```