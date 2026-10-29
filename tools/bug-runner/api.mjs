// Thin client for the production queue API. All runner → server calls are authenticated with the Bearer
// token (app_secrets.BUG_QUEUE_TOKEN). Screenshot bytes come from the public-by-link /api/media/<id>.
export function makeApi({ baseUrl, token }) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  const hdr = { "content-type": "application/json", authorization: `Bearer ${token}` };
  const post = (p, body) => fetch(base + p, { method: "POST", headers: hdr, body: body ? JSON.stringify(body) : undefined });
  return {
    base,
    async claim() {
      const r = await post("/api/queue/claim");
      if (r.status === 401) throw new Error("Unauthorized — check QUEUE_TOKEN matches BUG_QUEUE_TOKEN in the vault.");
      return r.json();
    },
    heartbeat(id) { return post("/api/queue/heartbeat", { id }).then((r) => r.json()).catch(() => null); },
    result(id, payload) { return post("/api/queue/result", { id, ...payload }).then((r) => r.json()); },
    mediaUrl(rel) { return /^https?:\/\//i.test(rel) ? rel : base + rel; },
  };
}
