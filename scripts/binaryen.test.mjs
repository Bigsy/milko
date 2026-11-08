import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { downloadVerifiedArchive } from "./binaryen.mjs";

const url = "https://api.github.com/repos/WebAssembly/binaryen/releases/assets/580050094";
const bytes = Buffer.from("verified build tool fixture");
const hash = createHash("sha256").update(bytes).digest("hex");
const wait = async () => {};

test("a gateway error retries a fresh official URL and still verifies the archive", async () => {
  const calls = [];
  const result = await downloadVerifiedArchive(url, hash, {
    wait,
    async request(target, options) {
      calls.push({ target, options });
      return calls.length === 1 ? new Response(null, { status: 504 }) : new Response(bytes);
    },
  });
  assert.deepEqual(result, bytes);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].target, url);
  assert.equal(new URL(calls[1].target).origin + new URL(calls[1].target).pathname, url);
  assert.ok(new URL(calls[1].target).searchParams.has("milko_retry"));
  assert.ok(calls.every(({ options }) => options.cache === "no-store" && options.signal));
  assert.ok(calls.every(({ options }) => options.headers.Accept === "application/octet-stream"));
});

test("network and interrupted-body failures retry within the same bounded attempt limit", async () => {
  let calls = 0;
  const result = await downloadVerifiedArchive(url, hash, {
    wait,
    async request() {
      calls++;
      if (calls === 1) throw new TypeError("connection reset");
      if (calls === 2) return { ok: true, async arrayBuffer() { throw new TypeError("interrupted body"); } };
      return new Response(bytes);
    },
  });
  assert.deepEqual(result, bytes);
  assert.equal(calls, 3);
});

test("permanent HTTP errors and checksum mismatches fail without a fallback", async () => {
  for (const [response, pattern] of [[new Response(null, { status: 404 }), /HTTP 404/], [new Response("changed bytes"), /checksum mismatch/]]) {
    let calls = 0;
    await assert.rejects(downloadVerifiedArchive(url, hash, { wait, async request() { calls++; return response; } }), pattern);
    assert.equal(calls, 1);
  }
});

test("persistent gateway errors stop after three attempts", async () => {
  let calls = 0;
  await assert.rejects(downloadVerifiedArchive(url, hash, {
    wait,
    async request() { calls++; return new Response(null, { status: 504 }); },
  }), /HTTP 504/);
  assert.equal(calls, 3);
});
