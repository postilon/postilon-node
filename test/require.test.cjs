// The CommonJS build loads through the package's "require" export.
const assert = require("node:assert/strict");
const { it } = require("node:test");

it("loads with require()", () => {
  const sdk = require("@postilon/node");
  assert.equal(typeof sdk.Postilon, "function");
  assert.equal(typeof sdk.PostilonError, "function");
  assert.equal(typeof sdk.verifyWebhookSignature, "function");
  assert.equal(require.resolve("@postilon/node"), require.resolve("../dist/cjs/index.js"));
  assert.equal(new sdk.Postilon("ps_test_x").webhooks.verifySignature("{}", undefined, "whsec_x"), false);
});
