// Runs against the built package (dist), imported by its own name so the exports map is tested too.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Postilon, PostilonError } from "@postilon/node";

const KEY = "ps_test_abc123";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch with one that records each call and answers with `respond(call)`. */
function mockFetch(respond = () => json(200, {})) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const call = {
      url: String(input),
      method: init.method,
      headers: new Headers(init.headers),
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    };
    calls.push(call);
    return respond(call);
  };
  return calls;
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

describe("requests", () => {
  it("sends an email with auth, JSON body and Idempotency-Key header only", async () => {
    const accepted = { id: "msg_1", status: "queued", from: "hello@acme.com", to: ["jane@example.com"] };
    const calls = mockFetch(() => json(202, accepted));
    const params = {
      from: "Acme <hello@acme.com>",
      to: ["jane@example.com"],
      cc: "cc@example.com",
      bcc: ["bcc@example.com"],
      reply_to: "support@acme.com",
      subject: "Receipt",
      html: "<p>Hi</p>",
      text: "Hi",
      headers: { "X-Entity-Ref-ID": "order-123" },
      tags: [{ name: "category", value: "receipt" }],
      attachments: [
        { filename: "a.pdf", content_type: "application/pdf", content: "JVBERi0=" },
        { file_id: "file_1" },
      ],
      template_id: "tmpl_1",
      variables: { name: "Jane" },
      scheduled_at: "2026-11-01T09:00:00Z",
    };

    const res = await new Postilon(KEY).emails.send(params, { idempotencyKey: "receipt-order-123" });

    assert.deepEqual(res, accepted);
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.url, "https://api.postilon.com/v1/emails");
    assert.equal(call.method, "POST");
    assert.equal(call.headers.get("authorization"), `Bearer ${KEY}`);
    assert.equal(call.headers.get("content-type"), "application/json");
    assert.equal(call.headers.get("idempotency-key"), "receipt-order-123");
    assert.deepEqual(call.body, params);
    assert.ok(!("idempotencyKey" in call.body) && !("idempotency_key" in call.body));
  });

  it("leaves out Idempotency-Key when none is given", async () => {
    const calls = mockFetch(() => json(202, {}));
    await new Postilon(KEY).emails.send({ from: "a@acme.com", to: "b@example.com", subject: "s" });
    assert.equal(calls[0].headers.get("idempotency-key"), null);
  });

  it("sends no body or Content-Type on GET, and builds list queries", async () => {
    const calls = mockFetch(() => json(200, { object: "list", data: [], count: 0, total: 0, has_more: false }));
    await new Postilon(KEY).emails.list({ status: "bounced", q: "jane", source: "api", days: 7, limit: 50, offset: 100 });
    const [call] = calls;
    assert.equal(call.method, "GET");
    assert.equal(call.body, undefined);
    assert.equal(call.headers.get("content-type"), null);
    const url = new URL(call.url);
    assert.equal(url.pathname, "/v1/emails");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      status: "bounced",
      q: "jane",
      source: "api",
      days: "7",
      limit: "50",
      offset: "100",
    });
  });

  it("omits undefined query parameters", async () => {
    const calls = mockFetch(() => json(200, {}));
    await new Postilon(KEY).webhooks.listDeliveries({ webhook_id: undefined, limit: 10 });
    assert.equal(calls[0].url, "https://api.postilon.com/v1/webhooks/deliveries?limit=10");
  });

  it("uses a custom base URL without a trailing slash and encodes ids", async () => {
    const calls = mockFetch(() => json(200, {}));
    await new Postilon(KEY, { baseUrl: "http://localhost:8080/" }).emails.get("msg_a/b?c");
    assert.equal(calls[0].url, "http://localhost:8080/v1/emails/msg_a%2Fb%3Fc");
  });

  it("refuses a missing API key", () => {
    assert.throws(() => new Postilon(""), /API key is required/);
  });

  // [description, call, method, path, body]
  const routes = [
    ["emails.sendBatch", (p) => p.emails.sendBatch({ from: "a@acme.com", batch: [{ to: "b@example.com", variables: { n: "1" } }] }), "POST", "/v1/emails/batch", { from: "a@acme.com", batch: [{ to: "b@example.com", variables: { n: "1" } }] }],
    ["emails.get", (p) => p.emails.get("msg_1"), "GET", "/v1/emails/msg_1"],
    ["emails.cancel", (p) => p.emails.cancel("msg_1"), "POST", "/v1/emails/msg_1/cancel"],
    ["domains.create", (p) => p.domains.create({ domain_name: "acme.com" }), "POST", "/v1/domains", { domain_name: "acme.com" }],
    ["domains.list", (p) => p.domains.list(), "GET", "/v1/domains"],
    ["domains.get", (p) => p.domains.get("dom_1"), "GET", "/v1/domains/dom_1"],
    ["domains.verify", (p) => p.domains.verify("dom_1"), "POST", "/v1/domains/dom_1/verify"],
    ["domains.update", (p) => p.domains.update("dom_1", { open_tracking_enabled: false }), "PATCH", "/v1/domains/dom_1", { open_tracking_enabled: false }],
    ["domains.delete", (p) => p.domains.delete("dom_1"), "DELETE", "/v1/domains/dom_1"],
    ["templates.create", (p) => p.templates.create({ name: "Welcome", subject_template: "Hi {{ name }}" }), "POST", "/v1/templates", { name: "Welcome", subject_template: "Hi {{ name }}" }],
    ["templates.list", (p) => p.templates.list({ limit: 5 }), "GET", "/v1/templates?limit=5"],
    ["templates.get", (p) => p.templates.get("tmpl_1"), "GET", "/v1/templates/tmpl_1"],
    ["templates.update", (p) => p.templates.update("tmpl_1", { html_template: "<p/>" }), "PATCH", "/v1/templates/tmpl_1", { html_template: "<p/>" }],
    ["templates.delete", (p) => p.templates.delete("tmpl_1"), "DELETE", "/v1/templates/tmpl_1"],
    ["files.upload", (p) => p.files.upload({ filename: "a.pdf", content_type: "application/pdf", content: "JVBERi0=" }), "POST", "/v1/files", { filename: "a.pdf", content_type: "application/pdf", content: "JVBERi0=" }],
    ["files.list", (p) => p.files.list(), "GET", "/v1/files"],
    ["files.delete", (p) => p.files.delete("file_1"), "DELETE", "/v1/files/file_1"],
    ["suppressions.list", (p) => p.suppressions.list({ offset: 100 }), "GET", "/v1/suppressions?offset=100"],
    ["suppressions.create", (p) => p.suppressions.create({ email_address: "jane@example.com" }), "POST", "/v1/suppressions", { email_address: "jane@example.com" }],
    ["suppressions.delete", (p) => p.suppressions.delete("sup_1"), "DELETE", "/v1/suppressions/sup_1"],
    ["webhooks.create", (p) => p.webhooks.create({ url: "https://acme.com/hook", subscribed_events: ["email.bounced"] }), "POST", "/v1/webhooks", { url: "https://acme.com/hook", subscribed_events: ["email.bounced"] }],
    ["webhooks.list", (p) => p.webhooks.list(), "GET", "/v1/webhooks"],
    ["webhooks.get", (p) => p.webhooks.get("wh_1"), "GET", "/v1/webhooks/wh_1"],
    ["webhooks.update", (p) => p.webhooks.update("wh_1", { is_active: false }), "PATCH", "/v1/webhooks/wh_1", { is_active: false }],
    ["webhooks.delete", (p) => p.webhooks.delete("wh_1"), "DELETE", "/v1/webhooks/wh_1"],
    ["webhooks.test", (p) => p.webhooks.test("wh_1"), "POST", "/v1/webhooks/wh_1/test"],
    ["webhooks.listEventTypes", (p) => p.webhooks.listEventTypes(), "GET", "/v1/webhooks/events"],
    ["webhooks.listDeliveries", (p) => p.webhooks.listDeliveries({ webhook_id: "wh_1" }), "GET", "/v1/webhooks/deliveries?webhook_id=wh_1"],
    ["webhooks.replayDelivery", (p) => p.webhooks.replayDelivery("whd_1"), "POST", "/v1/webhooks/deliveries/whd_1/replay"],
  ];
  for (const [name, invoke, method, path, body] of routes) {
    it(`${name} → ${method} ${path}`, async () => {
      const calls = mockFetch(() => json(200, { ok: true }));
      assert.deepEqual(await invoke(new Postilon(KEY)), { ok: true });
      const [call] = calls;
      assert.equal(call.method, method);
      assert.equal(call.url, `https://api.postilon.com${path}`);
      assert.equal(call.headers.get("authorization"), `Bearer ${KEY}`);
      assert.deepEqual(call.body, body);
      assert.equal(call.headers.get("content-type"), body === undefined ? null : "application/json");
      assert.equal(call.headers.get("idempotency-key"), null);
    });
  }
});

describe("errors", () => {
  it("throws PostilonError with status, code and message", async () => {
    const message = "Sender domain acme.com is not verified in this workspace.";
    mockFetch(() => json(403, { error: { code: "domain_not_verified", message } }));
    const err = await new Postilon(KEY).emails.send({ from: "a@acme.com", to: "b@example.com", subject: "s" }).catch((e) => e);
    assert.ok(err instanceof PostilonError);
    assert.ok(err instanceof Error);
    assert.equal(err.name, "PostilonError");
    assert.equal(err.status, 403);
    assert.equal(err.code, "domain_not_verified");
    assert.equal(err.message, message);
    assert.equal(err.rateLimitReset, undefined);
  });

  it("parses X-RateLimit-Reset on 429 rate_limit_exceeded", async () => {
    mockFetch(() =>
      json(429, { error: { code: "rate_limit_exceeded", message: "Rate limit of 100 requests per second exceeded." } }, {
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "1761386404",
      }),
    );
    const err = await new Postilon(KEY).emails.list().catch((e) => e);
    assert.ok(err instanceof PostilonError);
    assert.equal(err.status, 429);
    assert.equal(err.code, "rate_limit_exceeded");
    assert.equal(err.rateLimitReset, 1761386404);
  });

  it("does not set rateLimitReset for daily_limit_reached", async () => {
    mockFetch(() => json(429, { error: { code: "daily_limit_reached", message: "Daily limit reached." } }, { "X-RateLimit-Reset": "1761386404" }));
    const err = await new Postilon(KEY).emails.send({ from: "a@acme.com", to: "b@example.com", subject: "s" }).catch((e) => e);
    assert.equal(err.code, "daily_limit_reached");
    assert.equal(err.rateLimitReset, undefined);
  });

  it("maps a non-JSON error body to http_error", async () => {
    mockFetch(() => new Response("<html>Bad gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }));
    const err = await new Postilon(KEY).domains.list().catch((e) => e);
    assert.ok(err instanceof PostilonError);
    assert.equal(err.status, 502);
    assert.equal(err.code, "http_error");
    assert.equal(err.message, "HTTP 502");
  });

  it("lets network failures through unchanged", async () => {
    const failure = new TypeError("fetch failed");
    globalThis.fetch = async () => {
      throw failure;
    };
    await assert.rejects(new Postilon(KEY).emails.get("msg_1"), (err) => err === failure);
  });
});

describe("inbound", () => {
  it("lists and gets received email as JSON", async () => {
    const calls = mockFetch(() => json(200, { object: "list", data: [], count: 0, total: 0, has_more: false }));
    const inbound = new Postilon(KEY).inbound;
    await inbound.list({ q: "order", limit: 10 });
    await inbound.get("inb_1");
    assert.equal(calls[0].url, "https://api.postilon.com/v1/inbound?q=order&limit=10");
    assert.equal(calls[1].url, "https://api.postilon.com/v1/inbound/inb_1");
  });

  it("downloads an attachment as bytes and the raw message as text", async () => {
    const bytes = new Uint8Array([0, 255, 1, 128]);
    const calls = mockFetch((call) =>
      call.url.endsWith("/raw")
        ? new Response("Subject: hi\r\n\r\nbody", { headers: { "Content-Type": "message/rfc822" } })
        : new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } })
    );
    const inbound = new Postilon(KEY).inbound;
    assert.deepEqual(await inbound.attachment("inb_1", 0), bytes);
    assert.equal(await inbound.raw("inb_1"), "Subject: hi\r\n\r\nbody");
    assert.equal(calls[0].url, "https://api.postilon.com/v1/inbound/inb_1/attachments/0");
  });

  it("throws PostilonError when the content was deleted", async () => {
    mockFetch(() => json(410, { error: { code: "content_purged", message: "Deleted after 30 days." } }));
    const err = await new Postilon(KEY).inbound.attachment("inb_1", 0).catch((e) => e);
    assert.ok(err instanceof PostilonError);
    assert.equal(err.status, 410);
    assert.equal(err.code, "content_purged");
  });

  it("turns inbound on through domains.update", async () => {
    const calls = mockFetch(() => json(200, { id: "dom_1", inbound_domain: "reply.acme.com" }));
    await new Postilon(KEY).domains.update("dom_1", { inbound_domain: "reply.acme.com" });
    assert.equal(calls[0].method, "PATCH");
    assert.deepEqual(calls[0].body, { inbound_domain: "reply.acme.com" });
  });
});
