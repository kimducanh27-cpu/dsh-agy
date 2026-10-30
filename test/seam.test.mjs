import assert from "node:assert/strict"
import { resolve } from "node:path"
import test from "node:test"
import {
  NO_START_CAPABILITIES,
  assertPositiveFinite,
  assertUsableCwd,
  settleRunResult,
  subprocessRunHandle,
} from "../lib/seam.js"

/**
 * @returns cancellation wiring a settlement needs.
 */
function wiring() {
  return { signal: new AbortController().signal, onAbort: () => {} }
}

test("truncates an oversized multibyte diagnostic without splitting it", async () => {
  const long = "é".repeat(4000)
  const result = await settleRunResult({
    attempt: async () => ({ output: [], stopReason: "error", diagnostic: long }),
    collectOutput: () => [],
    cancelled: () => false,
    ...wiring(),
  })
  assert.ok(Buffer.byteLength(result.diagnostic) <= 4096)
  assert.match(result.diagnostic, /\[diagnostic truncated\]$/)
  assert.equal(result.diagnostic.includes("\uFFFD"), false)
})

test("never rejects after publication and keeps partial output", async () => {
  const result = await settleRunResult({
    attempt: async () => {
      throw new Error("boom")
    },
    collectOutput: () => [{ type: "text", text: "partial" }],
    collectDiagnostic: () => "x".repeat(5000),
    cancelled: () => false,
    ...wiring(),
  })
  assert.equal(result.stopReason, "error")
  assert.deepEqual(result.output, [{ type: "text", text: "partial" }])
  assert.ok(Buffer.byteLength(result.diagnostic) <= 4096)
})

test("local cancellation settles as aborted", async () => {
  const result = await settleRunResult({
    attempt: async () => {
      throw new Error("lost the race")
    },
    collectOutput: () => [{ type: "text", text: "seen" }],
    cancelled: () => true,
    ...wiring(),
  })
  assert.deepEqual(result, { output: [{ type: "text", text: "seen" }], stopReason: "aborted" })
})

test("dispose tears down once and cancels locally", async () => {
  let teardowns = 0
  let cancels = 0
  const run = subprocessRunHandle({
    id: "child-1",
    result: Promise.resolve({ output: [], stopReason: "completed" }),
    signal: new AbortController().signal,
    onAbort: () => {},
    requestCancel: () => {
      cancels += 1
    },
    teardown: async () => {
      teardowns += 1
    },
  })
  await run.dispose()
  await run.dispose()
  assert.equal(run.id, "child-1")
  assert.equal(teardowns, 1)
  assert.equal(cancels, 1)
})

test("validates timing bounds and child directories", () => {
  assert.throws(() => assertPositiveFinite("p", "ms", 0), /positive finite/)
  assert.throws(() => assertPositiveFinite("p", "ms", Number.NaN), /positive finite/)
  assert.equal(assertUsableCwd("p", "cwd", process.cwd()), process.cwd())
  assert.throws(() => assertUsableCwd("p", "cwd", "relative"), /absolute path/)
  assert.throws(() => assertUsableCwd("p", "cwd", resolve("definitely-missing-9f8e7d")), /not an accessible directory/)
  assert.equal(NO_START_CAPABILITIES.depthLimit, false)
})
