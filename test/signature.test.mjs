import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { Postilon, verifyWebhookSignature } from "@postilon/node";

const SECRET = "whsec_test_fixture_secret";

/** Signs like the server's crypto.SignWebhookPayload: t=<unix>,v1=hex(HMAC-SHA256(secret, "<t>.<body>")). */
function sign(body, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

const body = JSON.stringify({ id: "evt_1", type: "email.delivered", data: { email_id: "msg_1" } });

describe("verifyWebhookSignature", () => {
  // Signed by the Postilon API server itself (SECRET, GO_PAYLOAD, timestamp 1761386403).
  const GO_PAYLOAD = '{"id":"evt_2bC5dE8fG1hJ4kL7mN0p","type":"email.delivered","data":{"subject":"Grüße – 🎉"}}';
  const GO_HEADER = "t=1761386403,v1=7aed1efef187a50bfc3f2cc7d81ec15fe66f294727a58336826aa6878d7b96f6";
  const anyAge = { toleranceSeconds: Number.MAX_SAFE_INTEGER };

  it("accepts a signature made by the Go server, as string, Buffer or Uint8Array", () => {
    assert.equal(verifyWebhookSignature(GO_PAYLOAD, GO_HEADER, SECRET, anyAge), true);
    assert.equal(verifyWebhookSignature(Buffer.from(GO_PAYLOAD), GO_HEADER, SECRET, anyAge), true);
    assert.equal(verifyWebhookSignature(new TextEncoder().encode(GO_PAYLOAD), GO_HEADER, SECRET, anyAge), true);
  });

  it("rejects that signature by default because its timestamp is old", () => {
    assert.equal(verifyWebhookSignature(GO_PAYLOAD, GO_HEADER, SECRET), false);
  });

  it("accepts a fresh valid signature, also through the client", () => {
    const header = sign(body);
    assert.equal(verifyWebhookSignature(body, header, SECRET), true);
    assert.equal(new Postilon("ps_test_x").webhooks.verifySignature(Buffer.from(body), header, SECRET), true);
  });

  it("rejects a tampered body", () => {
    assert.equal(verifyWebhookSignature(body.replace("msg_1", "msg_2"), sign(body), SECRET), false);
    assert.equal(verifyWebhookSignature(body + " ", sign(body), SECRET), false);
  });

  it("rejects the wrong secret", () => {
    assert.equal(verifyWebhookSignature(body, sign(body, "whsec_other"), SECRET), false);
    assert.equal(verifyWebhookSignature(body, sign(body), ""), false);
  });

  it("rejects timestamps outside the tolerance, past or future", () => {
    const now = Math.floor(Date.now() / 1000);
    assert.equal(verifyWebhookSignature(body, sign(body, SECRET, now - 301), SECRET), false);
    assert.equal(verifyWebhookSignature(body, sign(body, SECRET, now + 301), SECRET), false);
    assert.equal(verifyWebhookSignature(body, sign(body, SECRET, now - 290), SECRET), true);
    assert.equal(verifyWebhookSignature(body, sign(body, SECRET, now - 290), SECRET, { toleranceSeconds: 60 }), false);
    assert.equal(verifyWebhookSignature(body, sign(body, SECRET, now - 3000), SECRET, { toleranceSeconds: 3600 }), true);
  });

  it("returns false without throwing for missing or malformed headers", () => {
    const good = sign(body);
    const t = good.slice(2, good.indexOf(","));
    const v1 = good.slice(good.indexOf("v1=") + 3);
    for (const header of [
      undefined,
      null,
      "",
      "garbage",
      `t=${t}`,
      `v1=${v1}`,
      `t=,v1=${v1}`,
      `t=abc,v1=${v1}`,
      `t=-${t},v1=${v1}`,
      `t=${t},v1=abcd`, // too short: length mismatch
      `t=${t},v1=${v1}00`, // too long
      `t=${t},v1=${"z".repeat(64)}`, // not hex
      `t=${t},v0=${v1}`,
    ]) {
      assert.equal(verifyWebhookSignature(body, header, SECRET), false, String(header));
    }
  });

  it("tolerates spaces and accepts any matching v1", () => {
    const good = sign(body);
    const [tPart, v1Part] = good.split(",");
    assert.equal(verifyWebhookSignature(body, ` ${tPart} , ${v1Part} `, SECRET), true);
    assert.equal(verifyWebhookSignature(body, `${tPart},v1=${"0".repeat(64)},${v1Part}`, SECRET), true);
  });
});
