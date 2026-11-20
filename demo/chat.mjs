import { createLivetime, decodeEvent } from "../sdk/livetime.mjs";

const TOPIC_PREFIX = "demo:livetime-starter:chat:";
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const EVENT_TYPE = "chat.message";
const TYPING_TYPE = "chat.typing";
const RECEIPT_TYPE = "chat.receipt";
const RECEIPT_RANK = { Sent: 0, Delivered: 1, Read: 2 };
const TYPING_REFRESH_MS = 1_500;
const TYPING_IDLE_MS = 2_200;
const TYPING_EXPIRY_MS = 4_500;
const MAX_MESSAGE_LENGTH = 280;
const element = (id) => document.getElementById(id);
const guestName = (id) => "Guest " + id.slice(0, 8).toUpperCase();

async function deploymentTopic() {
  const directory = new URL("./", location.href).href;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(directory));
  const prefix = [...new Uint8Array(digest, 0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return TOPIC_PREFIX + prefix;
}

if (!window.isSecureContext) {
  element("host-status").textContent = "Open this demo on localhost or HTTPS.";
} else if (window === window.parent) {
  void startHost();
} else if (new URLSearchParams(location.search).get("client") === "1") {
  document.body.classList.add("client");
  element("app").replaceChildren(element("chat-client").content.cloneNode(true));
  const participant = crypto.randomUUID();
  element("participant").textContent = guestName(participant);
  void startClient(participant);
}

async function startHost() {
  try {
    element("topic").value = await deploymentTopic();
    const clientUrl = new URL("./?client=1", location.href);
    const frames = [1, 2].map((number) => {
      const frame = document.createElement("iframe");
      frame.title = "Guest chat " + number;
      frame.src = clientUrl.href;
      return frame;
    });
    element("frames").replaceChildren(...frames);
  } catch {
    element("host-status").textContent = "Could not open the shared room. Reload the page to try again.";
  }
}

async function startClient(participant) {
  const sdk = createLivetime();
  const controller = new AbortController();
  const { signal } = controller;
  const input = element("message");
  const send = element("send");
  const messages = element("messages");
  const activity = element("activity");
  const typing = element("typing");
  const peerTyping = new Map();
  const recentIds = new Set();
  const unread = new Set();
  const outgoing = new Map();
  const lines = [];
  let connected = false;
  let sending = false;
  let localTyping = false;
  let lastTyping = 0;
  let typingVersion = 0;
  let idleTimer;
  let topic;

  input.maxLength = MAX_MESSAGE_LENGTH;

  function log(line) {
    lines.push(line);
    if (lines.length > 50) lines.shift();
    activity.textContent = lines.join("\n");
    activity.scrollTop = activity.scrollHeight;
  }

  function refresh() {
    input.disabled = signal.aborted || !connected;
    send.disabled = input.disabled || sending || !input.value.trim();
    element("connection").textContent = signal.aborted ? "Disconnected. Reload this tab to reconnect." :
      connected ? "Connected to the shared room" : "Connecting…";
  }

  async function publish(event) {
    const detail = event.type === RECEIPT_TYPE ? event.type + " (" + event.status + ")" :
      event.type === TYPING_TYPE ? event.type + (event.active ? " (start)" : " (stop)") : event.type;
    log("CALL publish() · POST /publish2 · " + detail);
    try {
      const result = await sdk.publish([topic], { ...event, sender: participant }, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      });
      log("OK publish() · HTTP " + result.status + " · " + detail);
      return true;
    } catch (failure) {
      if (!signal.aborted) log("ERROR publish() · " + detail + " · " + failure.message);
      return false;
    }
  }

  function setTyping(active) {
    clearTimeout(idleTimer);
    if (signal.aborted || !connected) return;
    const now = performance.now();
    if (active !== localTyping || (active && now - lastTyping >= TYPING_REFRESH_MS)) {
      localTyping = active;
      lastTyping = now;
      void publish({ type: TYPING_TYPE, active, version: ++typingVersion });
    }
    if (active) idleTimer = setTimeout(() => setTyping(false), TYPING_IDLE_MS);
  }

  function readVisible(requireFocus = true) {
    if (signal.aborted || document.visibilityState !== "visible" || (requireFocus && !document.hasFocus())) return;
    for (const id of unread) {
      unread.delete(id);
      void publish({ type: RECEIPT_TYPE, id, status: "Read" }).then((ok) => {
        if (!ok && !signal.aborted && recentIds.has(id)) unread.add(id);
      });
    }
  }

  function renderTyping() {
    const names = [...peerTyping].filter(([, state]) => state.active).map(([id]) => guestName(id));
    typing.textContent = names.length > 2 ? names.length + " guests are typing…" :
      names.length === 2 ? names.join(" and ") + " are typing…" :
        names.length === 1 ? names[0] + " is typing…" : "";
  }

  function receiveTyping(event) {
    if (typeof event.active !== "boolean" || !Number.isSafeInteger(event.version)) return;
    const previous = peerTyping.get(event.sender);
    if (event.version <= (previous?.version ?? 0)) return;
    clearTimeout(previous?.timer);
    const state = { active: event.active, version: event.version, timer: undefined };
    if (state.active) state.timer = setTimeout(() => {
      state.active = false;
      renderTyping();
    }, TYPING_EXPIRY_MS);
    peerTyping.delete(event.sender);
    peerTyping.set(event.sender, state);
    if (peerTyping.size > 200) {
      const oldest = peerTyping.keys().next().value;
      clearTimeout(peerTyping.get(oldest).timer);
      peerTyping.delete(oldest);
    }
    renderTyping();
  }

  function receive(events, live = true) {
    for (const raw of events) {
      let event;
      try {
        event = decodeEvent(raw);
      } catch {
        continue;
      }
      if (typeof event?.sender !== "string" || !UUID.test(event.sender)) continue;
      const own = event.sender === participant;
      if (live && event.type === TYPING_TYPE && !own) receiveTyping(event);
      if (live && event.type === RECEIPT_TYPE && !own &&
          (event.status === "Delivered" || event.status === "Read")) {
        const delivery = outgoing.get(event.id);
        if (delivery && RECEIPT_RANK[event.status] > RECEIPT_RANK[delivery.status]) {
          delivery.status = event.status;
          if (delivery.label) delivery.label.textContent = event.status;
        }
      }
      if (event?.type !== EVENT_TYPE || typeof event.id !== "string" || event.id.length > 64 ||
          typeof event.text !== "string" ||
          !event.text.trim() || event.text.length > MAX_MESSAGE_LENGTH || recentIds.has(event.id)) continue;

      recentIds.add(event.id);
      if (recentIds.size > 200) recentIds.delete(recentIds.values().next().value);
      const row = document.createElement("li");
      row.dataset.messageId = event.id;
      const name = document.createElement("strong");
      const text = document.createElement("span");
      name.textContent = own ? "You" : guestName(event.sender);
      text.textContent = event.text;
      row.append(name, text);
      if (own) {
        row.dataset.own = "";
        const receipt = document.createElement("small");
        receipt.className = "receipt";
        receipt.setAttribute("aria-live", "polite");
        const delivery = outgoing.get(event.id);
        receipt.textContent = delivery?.status ?? "Sent";
        if (delivery) delivery.label = receipt;
        row.append(receipt);
      } else if (live) {
        unread.add(event.id);
        void publish({ type: RECEIPT_TYPE, id: event.id, status: "Delivered" });
      }
      messages.append(row);
      if (messages.children.length > 60) {
        const oldest = messages.firstElementChild;
        unread.delete(oldest.dataset.messageId);
        oldest.remove();
      }
    }
    messages.scrollTop = messages.scrollHeight;
    readVisible();
  }

  input.addEventListener("input", () => {
    refresh();
    setTyping(Boolean(input.value.trim()));
  });
  input.addEventListener("blur", () => setTyping(false));
  element("compose").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (signal.aborted || !connected || sending || !text || text.length > MAX_MESSAGE_LENGTH) return;
    sending = true;
    refresh();
    setTyping(false);
    const id = crypto.randomUUID();
    outgoing.set(id, { status: "Sent", label: null });
    if (outgoing.size > 200) outgoing.delete(outgoing.keys().next().value);
    if (await publish({ type: EVENT_TYPE, id, text }) && input.value.trim() === text) input.value = "";
    sending = false;
    refresh();
  });

  window.addEventListener("focus", () => readVisible(), { signal });
  document.addEventListener("focusin", () => readVisible(), { signal });
  document.addEventListener("pointerup", () => readVisible(false), { signal });
  document.addEventListener("visibilitychange", () => readVisible(), { signal });
  window.addEventListener("pagehide", () => controller.abort(), { once: true });

  let method = "subscribe";
  try {
    topic = await deploymentTopic();
    log("CALL subscribe() · POST /subs");
    const subscription = await sdk.subscribe([topic], {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    });
    log("OK subscribe() · HTTP " + subscription.status);
    receive(subscription.events, false);
    connected = true;
    refresh();

    method = "poll";
    log("CALL poll() · GET /poll (waiting)");
    for await (const batch of sdk.listen(subscription.token, { signal })) {
      log("OK poll() · HTTP " + batch.status + " · " + batch.events.length + " event(s)");
      receive(batch.events);
      log("CALL poll() · GET /poll (waiting)");
    }
  } catch (failure) {
    if (!signal.aborted) {
      log("ERROR " + method + "() · " + failure.message);
    }
  } finally {
    controller.abort();
    clearTimeout(idleTimer);
    for (const state of peerTyping.values()) clearTimeout(state.timer);
    typing.textContent = "";
    refresh();
  }
}
