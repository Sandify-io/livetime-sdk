export const LIVETIME_SANDBOX = "https://livetime.sandbox.whatee.io";

/** @param {unknown} event @returns {unknown} */
export function decodeEvent(event) {
  if (typeof event !== "string") return event;
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(event), (byte) => byte.charCodeAt(0))));
  } catch {
    return JSON.parse(event);
  }
}

/** @param {{ baseUrl?: string }} [options] */
export function createLivetime({ baseUrl = LIVETIME_SANDBOX } = {}) {
  const origin = baseUrl.replace(/\/+$/, "");

  /** @param {string} path @param {AbortSignal} [signal] @param {object} [body] */
  async function request(path, signal, body) {
    const response = await fetch(origin + path, body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }
      : { cache: "no-store", signal });
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    return response;
  }

  /** @param {string[]} topics @param {{ signal?: AbortSignal }} [options] */
  async function subscribe(topics, { signal } = {}) {
    const response = await request("/subs", signal, { events: topics });
    const data = await response.json();
    const token = typeof data === "string" ? data : data?.sequential_token || data?.sequentialToken ||
      data?.token || data?.initial_token || data?.initialToken || data?.Token;
    if (typeof token !== "string" || !token || token === "undefined" || token === "null") {
      throw new Error("Missing poll token");
    }
    return { status: response.status, token, events: readEvents(data) };
  }

  /** @param {string[]} topics @param {unknown} event @param {{ signal?: AbortSignal, notUrgent?: boolean }} [options] */
  async function publish(topics, event, { signal, notUrgent = false } = {}) {
    const json = JSON.stringify(event);
    if (json === undefined) throw new TypeError("The event must be JSON-serializable");
    const bytes = new TextEncoder().encode(json);
    const payload = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
    const response = await request("/publish2", signal, { Topics: topics, Payload: payload, NotUrgent: notUrgent });
    return { status: response.status };
  }

  /** @param {string} token @param {{ signal?: AbortSignal }} [options] */
  async function poll(token, { signal } = {}) {
    const response = await request(`/poll?token=${encodeURIComponent(token)}`, signal);
    const data = await response.json();
    const next = data?.sequential_token || data?.sequentialToken;
    return { status: response.status, token: typeof next === "string" && next ? next : token, events: readEvents(data) };
  }

  /** @param {string} token @param {{ signal?: AbortSignal }} [options] */
  async function* listen(token, { signal } = {}) {
    while (!signal?.aborted) {
      let batch;
      try {
        batch = await poll(token, { signal });
      } catch (error) {
        if (signal?.aborted) return;
        throw error;
      }
      if (signal?.aborted) return;
      token = batch.token;
      yield batch;
    }
  }

  return { subscribe, publish, poll, listen };
}

/** @param {{ events?: unknown } | undefined} data @returns {unknown[]} */
function readEvents(data) {
  return Array.isArray(data?.events) ? data.events : [];
}
