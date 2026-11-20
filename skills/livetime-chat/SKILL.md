---
name: livetime-chat
description: Build a shared-room Livetime chat with automatic guest identities, typing indicators, and delivery and read receipts. Use when demonstrating subscribe, publish, and long polling through chat.
---

# Build a Livetime chat demo

Open the same chat page in multiple tabs. Each tab opens two independent iframe clients automatically. Every iframe creates a new guest and subscribes to the shared room. Show the guest name, connection status, message history, send form, and API log in each frame.

## Implement the room

1. Generate a new guest ID with `crypto.randomUUID()` inside each iframe when it loads. Derive a short display name from that ID. Use the full ID to identify senders and their messages.
2. Use the same topic for all tabs opening the same deployment. The starter hashes the page's directory URL with SHA-256 to derive a stable public topic. Run on localhost or HTTPS to use Web Crypto.
3. Call `subscribe([topic])` in each iframe. Render any buffered messages and open an independent `listen(token)` loop. Enable sending once that tab is connected.
4. Publish `{ type: "chat.message", sender, id, text }` through Livetime. Generate a new message ID each time. Validate received events, discard duplicate IDs, and render text with `textContent`.
5. Log SDK calls, HTTP endpoints, and response status. Abort the poll loop when the iframe leaves the page.

## Typing and receipts

- Publish `{ type: "chat.typing", sender, active, version }`. Increase the version, refresh while typing, and send a stop update on idle, blur, or submit. Track typing and expiry separately per guest.
- A receiving guest publishes `{ type: "chat.receipt", sender, id, status: "Delivered" }` after it receives a peer message during polling. Send `status: "Read"` when the receiving chat is visible and focused or the user interacts with it.
- Match receipts to outgoing message IDs. Keep status transitions monotonic from Sent to Delivered to Read, even if a receipt arrives before the sender's echo. The starter shows the highest status reported by any other guest.
- Use synthetic messages. The shared sandbox topic is public.

Use the [SDK](../../sdk/livetime.mjs) and the [Livetime integration skill](../livetime/SKILL.md) for the HTTP contract. The working reference is [`demo/index.html`](../../demo/index.html) with [`demo/chat.mjs`](../../demo/chat.mjs).

## Verify

Run `npm start`, open `http://localhost:8000/demo/`, and open the same page in a second tab. Confirm each tab shows two guests, all four names differ, and both tabs show the same shared topic. Type and send a message from any guest. Verify the message reaches a second guest in the same tab and both guests in the other tab. Click a receiving panel to verify its read receipt.
