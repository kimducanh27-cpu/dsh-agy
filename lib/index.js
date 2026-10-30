/**
 * Antigravity one-shot subagent provider.
 *
 * Every accepted run starts a fresh, package-independent Antigravity CLI
 * (`agy`) in headless mode in the delegating Session's workspace. Authentication
 * and settings come from the CLI's own store; this plugin never reads or
 * rewrites them. The run is published only after the child process starts and
 * the task reaches its stdin pipe.
 *
 * @module dsh-subagent-antigravity
 */

import { randomUUID } from "node:crypto"
import { statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import {
  NO_START_CAPABILITIES,
  assertPositiveFinite,
  assertUsableCwd,
  settleRunResult,
  subprocessRunHandle,
} from "./seam.js"
import { antigravityDiagnostic, createAntigravityEvents, mapAntigravityResult } from "./wire.js"

export const name = "subagent-antigravity"
export const inject = ["subagents", "subprocess"]

const PREFIX = "subagent-antigravity"
const DEFAULT_PROVIDER_NAME = "antigravity"
const DEFAULT_EXECUTABLE = "agy"
const DEFAULT_DISPOSE_GRACE_MS = 3000
/** Largest accepted teardown grace, matching the shared timer ceiling. */
const MAX_DISPOSE_GRACE_MS = 2147483647
const EFFORTS = ["low", "medium", "high", "xhigh", "max"]
const PERMISSION_MODES = ["settings", "bypass"]

/**
 * Node 20-compatible replacement for Promise.withResolvers (Node 22+).
 * @returns the promise together with its resolve and reject functions.
 */
function withResolvers() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Model-facing guidance registered beside the subagent tool. It teaches the
 * delegating agent what a usable one-shot brief looks like and how to keep its
 * own context small by offloading heavy work.
 */
const ANTIGRAVITY_DELEGATION_GUIDANCE = `## Delegating to Antigravity

\`subagent_antigravity\` runs one self-contained task in an isolated agent that cannot see this conversation or your tool results. Offload heavy, bounded work (file audits, research, triage) to keep this context small.

Brief every task with these fields:
- Goal: one sentence, one deliverable.
- Context: versions, errors, or pasted excerpts it cannot infer.
- Files / paths: exact paths to read or write; for reviews, "report only; do not edit".
- Constraints: conventions, limits, and that it runs once with no follow-up.
- Acceptance criteria: objective checks the answer must satisfy.
- Output format: exact shape (table, diff, JSON) with a length cap.
- Verify before answering: the check it must run first.

Never include secrets. Verify the answer before relying on it.`

class AntigravityRunFailure extends Error {
  /**
   * @param facts - fixed safe failure facts for the diagnostic.
   * @param cause - the internal cause retained outside model-visible text.
   */
  constructor(facts, cause) {
    super(`${PREFIX}: ${antigravityDiagnostic({ ...facts, message: facts.message ?? causeMessage(cause) })}`, cause === undefined ? undefined : { cause })
    this.name = "AntigravityRunFailure"
    this.facts = facts
  }
}

/**
 * @param value - unknown thrown value.
 * @returns a message safe to inspect internally.
 */
function causeMessage(value) {
  return value instanceof Error ? value.message : undefined
}

/**
 * @param value - unknown thrown value.
 * @returns an Error, preserving the original when possible.
 */
function thrown(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * Wait for a promise no longer than the given grace period.
 * @param promise - the promise to observe.
 * @param ms - upper bound in milliseconds.
 * @returns when the promise settles or the bound elapses.
 */
function boundedWait(promise, ms) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * @param value - candidate value.
 * @param field - config field name for the diagnostic.
 * @returns the value when it is a non-blank string.
 */
function requireString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${PREFIX}: config.${field} must be a non-empty string`)
  }
  return value
}

/**
 * @param value - candidate value.
 * @param field - config field name for the diagnostic.
 * @param fallback - value used when the field is absent.
 * @returns the resolved non-blank string.
 */
function optionalString(value, field, fallback) {
  if (value === undefined) return fallback
  return requireString(value, field)
}

/**
 * Resolve and validate the plugin row configuration.
 * @param input - raw Loader row config.
 * @returns the fully resolved configuration.
 */
function resolveConfig(input) {
  const raw = input === undefined || input === null ? {} : input
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${PREFIX}: config must be an object`)

  const permissionMode = raw.permissionMode === undefined ? "settings" : raw.permissionMode
  if (!PERMISSION_MODES.includes(permissionMode)) {
    throw new Error(`${PREFIX}: config.permissionMode must be one of ${PERMISSION_MODES.join(", ")}`)
  }
  const effort = raw.effort
  if (effort !== undefined && !EFFORTS.includes(effort)) {
    throw new Error(`${PREFIX}: config.effort must be one of ${EFFORTS.join(", ")}`)
  }
  const sandbox = raw.sandbox === undefined ? false : raw.sandbox
  if (typeof sandbox !== "boolean") throw new Error(`${PREFIX}: config.sandbox must be a boolean`)
  const allowSlashCommands = raw.allowSlashCommands === undefined ? false : raw.allowSlashCommands
  if (typeof allowSlashCommands !== "boolean") {
    throw new Error(`${PREFIX}: config.allowSlashCommands must be a boolean`)
  }
  const disposeGraceMs = raw.disposeGraceMs === undefined ? DEFAULT_DISPOSE_GRACE_MS : raw.disposeGraceMs
  if (typeof disposeGraceMs !== "number") throw new Error(`${PREFIX}: config.disposeGraceMs must be a number`)

  const env = {}
  if (raw.env !== undefined) {
    if (raw.env === null || typeof raw.env !== "object" || Array.isArray(raw.env)) {
      throw new Error(`${PREFIX}: config.env must be an object of string values`)
    }
    for (const [key, value] of Object.entries(raw.env)) {
      if (typeof value !== "string") throw new Error(`${PREFIX}: config.env.${key} must be a string`)
      env[key] = value
    }
  }

  return {
    providerName: optionalString(raw.providerName, "providerName", DEFAULT_PROVIDER_NAME),
    executable: optionalString(raw.executable, "executable", DEFAULT_EXECUTABLE),
    model: raw.model === undefined ? undefined : requireString(raw.model, "model"),
    effort,
    agent: raw.agent === undefined ? undefined : requireString(raw.agent, "agent"),
    permissionMode,
    sandbox,
    allowSlashCommands,
    env,
    disposeGraceMs,
  }
}

/**
 * Known install locations used only when the CLI is not on the service PATH.
 * @returns platform-specific candidate executable paths.
 */
function platformCandidates() {
  if (process.platform === "win32") {
    const candidates = []
    if (process.env.LOCALAPPDATA) candidates.push(join(process.env.LOCALAPPDATA, "agy", "bin", "agy.exe"))
    if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, "Antigravity", "bin", "agy.exe"))
    return candidates
  }
  return [join(homedir(), ".local", "bin", "agy"), "/usr/local/bin/agy", "/opt/homebrew/bin/agy"]
}

/**
 * @param path - candidate executable path.
 * @returns whether the path names a file.
 */
function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Resolve the CLI through the shared subprocess seam, then known locations.
 * @param ctx - context carrying the subprocess service.
 * @param config - resolved plugin config.
 * @param signal - unpublished-start cancellation.
 * @returns the absolute executable path.
 */
async function resolveAntigravityExecutable(ctx, config, signal) {
  if (config.executable !== DEFAULT_EXECUTABLE) {
    return ctx.subprocess.resolveExecutable(config.executable, config.env, signal)
  }
  try {
    return await ctx.subprocess.resolveExecutable(DEFAULT_EXECUTABLE, config.env, signal)
  } catch (error) {
    for (const candidate of platformCandidates()) {
      if (isFile(candidate)) return candidate
    }
    throw new Error(
      `${PREFIX}: Antigravity CLI was not found; install the CLI or set executable in the plugin config`,
      { cause: error },
    )
  }
}

/**
 * Build the fixed headless argv for one run.
 * @param executable - absolute CLI path.
 * @param config - resolved plugin config.
 * @returns the executable and arguments.
 */
function buildArgv(executable, config) {
  const argv = [executable, "--input-format", "stream-json", "--output-format", "stream-json"]
  if (!config.allowSlashCommands) argv.push("--disable-slash-commands")
  if (config.model !== undefined) argv.push("--model", config.model)
  if (config.effort !== undefined) argv.push("--effort", config.effort)
  if (config.agent !== undefined) argv.push("--agent", config.agent)
  if (config.permissionMode === "bypass") argv.push("--dangerously-skip-permissions")
  if (config.sandbox) argv.push("--sandbox")
  return argv
}

/**
 * Validate and preserve the one-shot task before crossing the process boundary.
 * @param prompt - task content accepted from the shared subagent service.
 * @returns the exact non-empty text block contents.
 */
function textTask(prompt) {
  if (!Array.isArray(prompt) || prompt.length === 0) {
    throw new Error(`${PREFIX}: the one-shot task must contain only text blocks`)
  }
  const texts = []
  for (const block of prompt) {
    if (block === null || typeof block !== "object" || block.type !== "text" || typeof block.text !== "string") {
      throw new Error(`${PREFIX}: the one-shot task must contain only text blocks`)
    }
    texts.push(block.text)
  }
  if (texts.every((text) => text.trim().length === 0)) {
    throw new Error(`${PREFIX}: the one-shot task must not be empty`)
  }
  return texts
}

/**
 * Fully resolved inputs for one Antigravity run.
 * @typedef {object} AntigravityRunSpec
 * @property {string} cwd - validated absolute child directory.
 * @property {object} config - resolved plugin configuration.
 * @property {(signal: AbortSignal) => Promise<string>} resolveExecutable - CLI lookup.
 * @property {(spec: object) => object} spawn - shared subprocess spawn operation.
 * @property {(error: Error, stopReason: string) => void} [onError] - diagnostic sink.
 */

/**
 * Start one Antigravity child, publish its run handle, and settle its result.
 * @param request - resolved shared subagent request.
 * @param spec - workspace, config, process seam, and diagnostic policy.
 * @returns the published run handle.
 */
async function startAntigravityRun(request, spec) {
  const texts = textTask(request.prompt)
  if (request.signal.aborted) throw new Error(`${PREFIX}: request was aborted before Antigravity startup`)

  let executable
  try {
    executable = await spec.resolveExecutable(request.signal)
  } catch (error) {
    if (request.signal.aborted) throw new Error(`${PREFIX}: request was aborted before Antigravity startup`)
    throw new AntigravityRunFailure({ stage: "executable", category: "executable-not-found" }, error)
  }

  let child
  try {
    child = spec.spawn({
      argv: buildArgv(executable, spec.config),
      cwd: spec.cwd,
      stdio: { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
      graceMs: spec.config.disposeGraceMs,
      env: spec.config.env,
    })
  } catch (error) {
    throw new AntigravityRunFailure({ stage: "spawn", category: "process" }, error)
  }

  const completion = withResolvers()
  const events = createAntigravityEvents(() => completion.resolve())
  const fatal = withResolvers()
  fatal.promise.catch(() => {})
  let fatalSettled = false
  let processOutcome
  let closed = false
  let diagnostic

  const fail = (error) => {
    if (fatalSettled) return
    fatalSettled = true
    fatal.reject(thrown(error))
  }

  const reader = child.stdout === undefined ? undefined : createInterface({ input: child.stdout, crlfDelay: Infinity })
  reader?.on("line", (line) => {
    try {
      events.push(line)
    } catch (error) {
      fail(error)
    }
  })

  const onStderr = (chunk) => {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk
    try {
      process.stderr.write(bytes)
    } catch {}
  }
  const onStderrError = () => {}
  child.stderr?.on("data", onStderr)
  child.stderr?.on("error", onStderrError)
  child.stdin?.on("error", (error) => fail(error))
  child.stdout?.on("error", (error) => fail(error))

  const outcomeSettled = withResolvers()
  child.done.then(
    (outcome) => {
      processOutcome = outcome
      outcomeSettled.resolve()
      if (events.terminal === undefined) {
        fail(new Error(`${PREFIX}: Antigravity CLI exited before reporting a result`))
      }
    },
    (error) => {
      outcomeSettled.resolve()
      fail(error)
    },
  )

  child.stdout?.on("end", () => {
    if (closed || events.terminal !== undefined) return
    fail(new Error(`${PREFIX}: Antigravity CLI protocol stream closed`))
  })

  const runAbort = new AbortController()
  const requestCancel = () => {
    if (runAbort.signal.aborted) return
    runAbort.abort(new Error(`${PREFIX}: run cancelled locally`))
    // Wake the settlement race before the child proves it exited.
    fail(runAbort.signal.reason)
    child.terminate()
  }
  const onAbort = () => requestCancel()
  request.signal.addEventListener("abort", onAbort, { once: true })

  let teardown
  const disposeProcess = () => {
    if (teardown !== undefined) return teardown
    teardown = (async () => {
      closed = true
      request.signal.removeEventListener("abort", onAbort)
      try {
        reader?.close()
      } catch {}
      child.stderr?.off("data", onStderr)
      child.stderr?.off("error", onStderrError)
      try {
        child.stdin?.end()
      } catch {}
      child.terminate()
      try {
        await child.waitForExit()
      } catch (error) {
        throw new AntigravityRunFailure({ stage: "teardown", category: "unknown", outcome: processOutcome }, error)
      }
      await child.done.catch(() => {})
    })()
    return teardown
  }

  try {
    const stdin = child.stdin
    if (stdin === undefined) throw new Error(`${PREFIX}: Antigravity CLI has no stdin pipe`)
    stdin.write(`${JSON.stringify({
      event: "user",
      message: { content: texts.map((text) => ({ type: "text", text })) },
    })}\n`)
    stdin.end()
  } catch (error) {
    request.signal.removeEventListener("abort", onAbort)
    try {
      await disposeProcess()
    } catch (disposeError) {
      const cleanupFailure = thrown(disposeError)
      throw new AggregateError(
        [new AntigravityRunFailure({ stage: "prompt", category: "protocol" }, error), cleanupFailure],
        `${PREFIX}: could not deliver the task; ${cleanupFailure.message}`,
      )
    }
    throw new AntigravityRunFailure({ stage: "prompt", category: "protocol" }, error)
  }

  const collectOutput = () => events.output()
  const attempt = async () => {
    try {
      await Promise.race([completion.promise, fatal.promise])
      // The CLI reports `result` just before exiting. Wait briefly for the exit
      // facts so a failure diagnostic can carry the exit code and signal; a
      // child that lingers is still torn down by dispose().
      await boundedWait(outcomeSettled.promise, spec.config.disposeGraceMs)
      const result = mapAntigravityResult(events, {
        cancelled: runAbort.signal.aborted,
        outcome: processOutcome,
      })
      if (result.stopReason !== "completed" && result.diagnostic !== undefined) diagnostic = result.diagnostic
      return result
    } catch (error) {
      const message = causeMessage(error)
      diagnostic = antigravityDiagnostic({
        stage: runAbort.signal.aborted ? "run" : "process",
        category: runAbort.signal.aborted ? "cancelled" : "protocol",
        outcome: processOutcome,
        conversationId: events.conversationId,
        permissionMode: events.permissionMode,
        message: message ?? "Antigravity CLI terminated unexpectedly",
      })
      throw error
    }
  }

  const result = settleRunResult({
    attempt,
    collectOutput,
    collectDiagnostic: () => diagnostic,
    cancelled: () => runAbort.signal.aborted,
    onError: spec.onError,
    signal: request.signal,
    onAbort,
  })

  return subprocessRunHandle({
    id: randomUUID(),
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown: disposeProcess,
  })
}

class AntigravityProvider {
  /**
   * @param providerName - registry name.
   * @param ctx - context carrying shared services.
   * @param config - resolved plugin config.
   */
  constructor(providerName, ctx, config) {
    this.name = providerName
    this.ctx = ctx
    this.config = config
    this.capabilities = NO_START_CAPABILITIES
    this.inheritsParentContext = false
  }

  /**
   * @param request - resolved shared subagent request.
   * @returns the published run handle.
   */
  start(request) {
    let cwd
    try {
      cwd = assertUsableCwd(PREFIX, "child cwd", request.cwd)
    } catch (error) {
      if (request.signal.aborted) throw new Error(`${PREFIX}: request was aborted before Antigravity startup`)
      throw new AntigravityRunFailure({ stage: "cwd", category: "invalid-cwd" }, error)
    }
    return startAntigravityRun(request, {
      cwd,
      config: this.config,
      resolveExecutable: (signal) => resolveAntigravityExecutable(this.ctx, this.config, signal),
      spawn: (spec) => this.ctx.subprocess.spawn(spec),
      onError: (error, stopReason) => {
        this.ctx.logger?.warn?.(`${PREFIX} "${this.name}": child run failed (${stopReason}): ${error.message}`)
      },
    })
  }
}

/**
 * Register one Profile-named Antigravity provider.
 * @param ctx - context carrying shared subagent and subprocess services.
 * @param config - registry name, CLI options, environment, and disposal grace.
 */
export function apply(ctx, config) {
  const resolved = resolveConfig(config)
  assertPositiveFinite(PREFIX, "disposeGraceMs", resolved.disposeGraceMs)
  if (resolved.disposeGraceMs > MAX_DISPOSE_GRACE_MS) {
    throw new Error(`${PREFIX}: disposeGraceMs must be no greater than ${MAX_DISPOSE_GRACE_MS}`)
  }
  const provider = new AntigravityProvider(resolved.providerName, ctx, resolved)
  ctx.effect(() => ctx.subagents.registerProvider(provider))

  // Optional: teach the delegating agent how to brief this backend. The prompt
  // registry is not a hard dependency, so wait for it in a child fiber rather
  // than requiring it in this plugin's `inject`.
  const registerGuidance = (promptContext) => {
    let order = 2801
    try {
      const base = promptContext.systemPrompt.getSectionOrder?.("TOOL_SUBAGENT")
      if (typeof base === "number" && Number.isFinite(base)) order = base + 1
    } catch {}
    promptContext.effect(() => promptContext.systemPrompt.section({
      name: "delegation:antigravity",
      order,
      text: ANTIGRAVITY_DELEGATION_GUIDANCE,
      interpolate: false,
    }))
  }
  if (typeof ctx.inject === "function") {
    ctx.inject(["systemPrompt"], registerGuidance)
  } else if (ctx.systemPrompt !== undefined) {
    registerGuidance(ctx)
  }
}
