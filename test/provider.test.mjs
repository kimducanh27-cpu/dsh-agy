import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import test from "node:test"
import { apply } from "../lib/index.js"

/** Node 20-compatible Promise.withResolvers stand-in. */
function withResolvers() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/**
 * Build a fake subprocess handle the provider cannot distinguish from a real one.
 * @returns the handle plus test-side controls.
 */
function fakeChild() {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const done = withResolvers()
  const state = { terminated: 0, stdinText: "" }
  stdin.setEncoding("utf8")
  stdin.on("data", (chunk) => {
    state.stdinText += chunk
  })
  const exit = (exitCode = 0, signal = null) => done.resolve({ exitCode, signal })
  return {
    state,
    exit,
    stdout,
    stderr,
    handle: {
      stdin,
      stdout,
      stderr,
      done: done.promise,
      terminate() {
        state.terminated += 1
        exit(0)
      },
      async waitForExit() {
        return true
      },
    },
  }
}

/**
 * Install the plugin into a fake Host context.
 * @param {object} [options] - resolver behavior and config overrides.
 * @returns fake context, registered providers, and captured spawns.
 */
function fakeHost(options = {}) {
  const providers = new Map()
  const children = []
  const spawns = []
  const injectedDeps = []
  const ctx = {
    subagents: {
      registerProvider(provider) {
        providers.set(provider.name, provider)
        return () => providers.delete(provider.name)
      },
    },
    subprocess: {
      async resolveExecutable(command) {
        if (options.missingExecutable) throw new Error(`not found: ${command}`)
        return `C:/fake/${command}`
      },
      spawn(spec) {
        const child = fakeChild()
        spawns.push(spec)
        children.push(child)
        return child.handle
      },
    },
    logger: { warn() {} },
    effect(callback) {
      return callback()
    },
  }
  if (options.systemPrompt !== undefined) ctx.systemPrompt = options.systemPrompt
  if (options.useInject) {
    ctx.inject = (deps, callback) => {
      injectedDeps.push(...deps)
      callback(ctx)
    }
  }
  apply(ctx, { executable: "agy-test", disposeGraceMs: 1000, ...options.config })
  return { providers, children, spawns, injectedDeps }
}

/**
 * Start one run against the fake provider.
 * @param {string} text - task text.
 * @param {AbortSignal} [signal] - caller signal.
 * @returns the provider run handle.
 */
async function start(host, text, signal = new AbortController().signal) {
  const provider = host.providers.get("antigravity")
  assert.ok(provider)
  return provider.start({
    cwd: process.cwd(),
    prompt: [{ type: "text", text }],
    parent: {},
    signal,
  })
}

test("publishes a run and completes with the CLI answer", async () => {
  const host = fakeHost()
  const run = await start(host, "do the thing")
  assert.match(host.children[0].state.stdinText, /"event":"user"/)
  assert.match(host.children[0].state.stdinText, /do the thing/)
  assert.ok(host.spawns[0].argv.includes("--disable-slash-commands"))
  host.children[0].stdout.write(`${JSON.stringify({ event: "init", init: { permission_mode: "always-proceed" } })}\n`)
  host.children[0].stdout.write(`${JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "done\n" } })}\n`)
  host.children[0].exit(0)
  assert.deepEqual(await run.result, { output: [{ type: "text", text: "done\n" }], stopReason: "completed" })
  await run.dispose()
  await run.dispose()
})

test("builds the headless argv from configuration", async () => {
  const host = fakeHost({
    config: {
      model: "gemini-x",
      effort: "high",
      agent: "reviewer",
      permissionMode: "bypass",
      sandbox: true,
      allowSlashCommands: true,
      env: { FOO: "bar" },
    },
  })
  const run = await start(host, "x")
  assert.deepEqual(host.spawns[0].argv, [
    "C:/fake/agy-test",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--model",
    "gemini-x",
    "--effort",
    "high",
    "--agent",
    "reviewer",
    "--dangerously-skip-permissions",
    "--sandbox",
  ])
  assert.equal(host.spawns[0].cwd, process.cwd())
  assert.deepEqual(host.spawns[0].env, { FOO: "bar" })
  assert.equal(host.spawns[0].graceMs, 1000)
  host.children[0].exit(0)
  await run.result
  await run.dispose()
})

test("maps an error envelope and keeps partial output", async () => {
  const host = fakeHost()
  const run = await start(host, "do the thing")
  host.children[0].stdout.write(`${JSON.stringify({ event: "step_update", step_update: { step_type: "agent_response", text_delta: "partial" } })}\n`)
  host.children[0].stdout.write(`${JSON.stringify({ event: "result", result: { status: "ERROR", error: "boom" } })}\n`)
  host.children[0].exit(1)
  const result = await run.result
  assert.equal(result.stopReason, "error")
  assert.deepEqual(result.output, [{ type: "text", text: "partial" }])
  assert.match(result.diagnostic, /category: product-error/)
  assert.match(result.diagnostic, /exit code: 1/)
  await run.dispose()
})

test("aborts the run and terminates the child", async () => {
  const host = fakeHost()
  const controller = new AbortController()
  const run = await start(host, "hang", controller.signal)
  controller.abort()
  const result = await run.result
  assert.equal(result.stopReason, "aborted")
  assert.equal(host.children[0].state.terminated, 1)
  await run.dispose()
})

test("reports an early exit with safe facts and no stderr text", async () => {
  const originalWrite = process.stderr.write
  const forwarded = []
  process.stderr.write = (chunk) => {
    forwarded.push(String(chunk))
    return true
  }
  try {
    const host = fakeHost()
    const run = await start(host, "x")
    host.children[0].stdout.write(`${JSON.stringify({
      event: "init",
      conversation_id: "c-early",
      init: { permission_mode: "request-review" },
    })}\n`)
    host.children[0].stderr.write("SECRET_TOKEN=do-not-leak\n")
    host.children[0].exit(3)
    const result = await run.result
    assert.equal(result.stopReason, "error")
    assert.match(result.diagnostic, /category: protocol/)
    assert.match(result.diagnostic, /exit code: 3/)
    assert.match(result.diagnostic, /conversation: c-early/)
    assert.match(result.diagnostic, /permission mode: request-review/)
    assert.doesNotMatch(result.diagnostic, /SECRET_TOKEN/)
    assert.equal(forwarded.join("").includes("SECRET_TOKEN"), true)
    await run.dispose()
  } finally {
    process.stderr.write = originalWrite
  }
})

test("fails the run when the prompt pipe errors", async () => {
  const host = fakeHost()
  const run = await start(host, "x")
  host.children[0].handle.stdin.emit("error", new Error("EPIPE from test"))
  const result = await run.result
  assert.equal(result.stopReason, "error")
  assert.match(result.diagnostic, /EPIPE from test/)
  await run.dispose()
})

test("rejects before publication when the CLI is missing", async () => {
  const host = fakeHost({ missingExecutable: true })
  const provider = host.providers.get("antigravity")
  await assert.rejects(
    provider.start({ cwd: process.cwd(), prompt: [{ type: "text", text: "x" }], parent: {}, signal: new AbortController().signal }),
    /subagent-antigravity/,
  )
})

test("rejects non-text and empty tasks before startup", async () => {
  const host = fakeHost()
  const provider = host.providers.get("antigravity")
  const signal = new AbortController().signal
  await assert.rejects(provider.start({ cwd: process.cwd(), prompt: [{ type: "image" }], parent: {}, signal }), /text blocks/)
  await assert.rejects(provider.start({ cwd: process.cwd(), prompt: [{ type: "text", text: "   " }], parent: {}, signal }), /must not be empty/)
})

test("rejects a relative or missing child directory", async () => {
  const host = fakeHost()
  const provider = host.providers.get("antigravity")
  await assert.rejects(
    async () => provider.start({ cwd: "relative/dir", prompt: [{ type: "text", text: "x" }], parent: {}, signal: new AbortController().signal }),
    /absolute path/,
  )
})

test("rejects invalid configuration at activation", async () => {
  assert.throws(() => fakeHost({ config: { effort: "ultra" } }), /config\.effort/)
  assert.throws(() => fakeHost({ config: { env: { A: 1 } } }), /config\.env\.A/)
  assert.throws(() => fakeHost({ config: { disposeGraceMs: 0 } }), /positive finite/)
  assert.throws(() => fakeHost({ config: { providerName: "  " } }), /config\.providerName/)
  assert.throws(() => fakeHost({ config: { permissionMode: "always" } }), /config\.permissionMode/)
})

test("registers a delegation guidance section beside the tool", () => {
  const sections = []
  const host = fakeHost({
    systemPrompt: {
      getSectionOrder(name) {
        return name === "TOOL_SUBAGENT" ? 2800 : 0
      },
      section(section) {
        sections.push(section)
        return () => {}
      },
    },
  })
  assert.ok(host.providers.get("antigravity"))
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, "delegation:antigravity")
  assert.equal(sections[0].order, 2801)
  assert.equal(sections[0].interpolate, false)
  assert.match(sections[0].text, /subagent_antigravity/)
  assert.match(sections[0].text, /one self-contained task/)
  assert.match(sections[0].text, /do not edit/)
  assert.match(sections[0].text, /Verify before answering/)
})

test("works when the system-prompt service is absent", () => {
  const host = fakeHost()
  assert.ok(host.providers.get("antigravity"))
  assert.deepEqual(host.injectedDeps, [])
})

test("waits for the system-prompt service instead of requiring it", () => {
  const sections = []
  const host = fakeHost({
    useInject: true,
    systemPrompt: {
      getSectionOrder() {
        return 2800
      },
      section(section) {
        sections.push(section)
        return () => {}
      },
    },
  })
  assert.deepEqual(host.injectedDeps, ["systemPrompt"])
  assert.ok(host.providers.get("antigravity"))
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, "delegation:antigravity")
})
