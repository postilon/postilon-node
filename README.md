# @postilon/node

Node.js client for the [Postilon](https://postilon.com) transactional email API. Typed, no dependencies, ESM and CommonJS. Needs Node.js 18 or later (it uses the built-in `fetch`).

Full API documentation: [postilon.com/docs](https://postilon.com/docs).

## Install

```bash
npm install @postilon/node
```

## Send an email

Create an API key in the dashboard under **API Keys**, and keep it in an environment variable.

```ts
import { Postilon } from "@postilon/node";

const postilon = new Postilon(process.env.POSTILON_API_KEY!);

const email = await postilon.emails.send({
  from: "Acme <hello@acme.com>",
  to: "jane@example.com",
  subject: "Your sign-in code",
  html: "<p>Your code is <strong>482913</strong>.</p>",
  text: "Your code is 482913.",
});
// { id: "msg_…", status: "queued", … }
```

`send` takes every field of [`POST /v1/emails`](https://postilon.com/docs/sending): `cc`, `bcc`, `reply_to`, `headers`, `tags`, `attachments` (Base64 `content`, or a `file_id` from `postilon.files.upload`), `template_id` with `variables`, and `scheduled_at`. CommonJS works too: `const { Postilon } = require("@postilon/node")`.

The client also covers `emails.sendBatch`, `get`, `list` and `cancel`, and `domains`, `templates`, `files`, `suppressions`, `webhooks` and `inbound`.

## Test keys

`ps_test_…` keys are for development: emails are accepted, rendered and reported like real ones, but nothing is delivered and no credits are used, and any `from` address works. `ps_live_…` keys send real mail from a [verified domain](https://postilon.com/docs/domains). The SDK treats both the same.

## Idempotency

Pass an idempotency key, such as the order or event ID the email is for, so a retried request never sends twice. It is sent as the `Idempotency-Key` header:

```ts
await postilon.emails.send(
  { from: "billing@acme.com", to: "jane@example.com", subject: "Receipt for order #123", text: "Thanks." },
  { idempotencyKey: "receipt-order-123" },
);
```

A retry with the same key and body returns the original response. The same key with a different body fails with `409 idempotency_key_reused`, so use one key per email.

## Errors

When the API answers with an error, the promise rejects with a `PostilonError` carrying the HTTP `status`, the `code` and the `message` ([list of codes](https://postilon.com/docs/errors)). Network failures reject with the error `fetch` threw.

```ts
import { PostilonError } from "@postilon/node";

try {
  await postilon.emails.send({ from: "hello@acme.com", to: "jane@example.com", subject: "Hi", text: "Hi" });
} catch (err) {
  if (err instanceof PostilonError && err.code === "rate_limit_exceeded") {
    // err.rateLimitReset: when the window resets, in Unix seconds (X-RateLimit-Reset)
  } else if (err instanceof PostilonError) {
    console.error(err.status, err.code, err.message); // 403 domain_not_verified …
  } else {
    throw err;
  }
}
```

A workspace can make 100 requests per second; use `emails.sendBatch` for many emails at once. `429 daily_limit_reached` means the daily sending limit is reached, and retrying within the second will not help. An error response that is not JSON (from a proxy, say) gets the code `http_error`.

## Pagination

Lists return `{ object: "list", data, count, total, has_more }` and take `limit` (default 100, at most 1000) and `offset`, newest first:

```ts
let offset = 0;
for (;;) {
  const page = await postilon.emails.list({ status: "bounced", limit: 100, offset });
  for (const email of page.data) console.log(email.id, email.to);
  if (!page.has_more) break;
  offset += page.count;
}
```

## Verify webhooks

Each webhook request carries `X-Postilon-Signature: t=<unix>,v1=<hex>`. Verify it against the **raw** body, before any JSON parsing, with the endpoint's signing secret (`whsec_…`, returned when the endpoint is created). Signatures older than 5 minutes are refused; change that with `{ toleranceSeconds }`.

```ts
import express from "express";
import { verifyWebhookSignature, type WebhookEvent } from "@postilon/node";

const app = express();

app.post("/webhooks/postilon", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifyWebhookSignature(req.body, req.get("X-Postilon-Signature"), process.env.POSTILON_WEBHOOK_SECRET!);
  if (!ok) return res.sendStatus(400);

  const event = JSON.parse(req.body.toString("utf8")) as WebhookEvent;
  if (event.type === "email.bounced") {
    // event.data.recipient bounced
  }
  res.sendStatus(200);
});
```

`postilon.webhooks.verifySignature(...)` is the same function. Answer with a `2xx` within 8 seconds and do slow work afterwards. Events can arrive more than once and out of order, so use the event `id` to ignore duplicates. See [Webhooks](https://postilon.com/docs/webhooks).

## Receive email

Turn on inbound for a verified domain (or a subdomain of it), and add the MX record it returns:

```ts
const domain = await postilon.domains.update("dom_…", { inbound_domain: "reply.acme.com" });
// domain.inbound_record: { type: "MX", name: "reply.acme.com", value: "inbound.postilon.com", priority: 10, … }
```

Each message then reaches your webhooks as `email.received`, with its text and HTML (up to 256 KB), attachment list, SPF, DKIM and DMARC results and a `spam` flag. Narrow on `event.type === "email.received"` to get `event.data` typed. Read received email with `postilon.inbound.list`, `get`, `attachment(id, index)` (a `Uint8Array`) and `raw(id)` (the message as received). See [Inbound email](https://postilon.com/docs/inbound).

## License

MIT, see [LICENSE](./LICENSE).
