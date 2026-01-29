import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { AgentsMdInjector, AgentsMdInjectorPlugin } from "../index"

const TEST_DIR = join(import.meta.dir, ".test-fixtures")

function createMockClient() {
  const logCalls: Array<{ service: string; level: string; message: string }> = []
  const promptCalls: Array<{ sessionId: string; text: string }> = []

  const client = {
    app: {
      log: mock(async (params: { body: { service: string; level: string; message: string } }) => {
        logCalls.push(params.body)
      }),
    },
    session: {
      prompt: mock(async (params: { path: { id: string }; body: { noReply: boolean; parts: Array<{ type: string; text: string }> } }) => {
        promptCalls.push({
          sessionId: params.path.id,
          text: params.body.parts[0]?.text ?? "",
        })
      }),
    },
  }

  return { client, logCalls, promptCalls }
}

function setupTestDirectory() {
  mkdirSync(TEST_DIR, { recursive: true })
  mkdirSync(join(TEST_DIR, "src"), { recursive: true })
  mkdirSync(join(TEST_DIR, "src", "components"), { recursive: true })
  mkdirSync(join(TEST_DIR, "lib"), { recursive: true })
}

function teardownTestDirectory() {
  rmSync(TEST_DIR, { recursive: true, force: true })
}

describe("AgentsMdInjector", () => {
  beforeEach(() => {
    setupTestDirectory()
  })

  afterEach(() => {
    teardownTestDirectory()
  })

  test("injects AGENTS.md from parent directory when reading a file", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    writeFileSync(join(TEST_DIR, "src", "AGENTS.md"), "src agents content")

    injector.storeFilePathForCall("call-1", join(TEST_DIR, "src", "file.ts"))
    await injector.handleFileReadComplete("call-1", "session-1")

    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0]?.text).toContain("src agents content")
    expect(promptCalls[0]?.text).toContain('path="src/AGENTS.md"')
  })

  test("injects multiple AGENTS.md files from nested directories", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    writeFileSync(join(TEST_DIR, "src", "AGENTS.md"), "src agents")
    writeFileSync(join(TEST_DIR, "src", "components", "AGENTS.md"), "components agents")

    injector.storeFilePathForCall("call-1", join(TEST_DIR, "src", "components", "Button.tsx"))
    await injector.handleFileReadComplete("call-1", "session-1")

    expect(promptCalls.length).toBe(2)
    expect(promptCalls[0]?.text).toContain("src agents")
    expect(promptCalls[1]?.text).toContain("components agents")
  })

  test("skips root AGENTS.md since OpenCode handles it automatically", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    writeFileSync(join(TEST_DIR, "AGENTS.md"), "root agents - should be skipped")
    writeFileSync(join(TEST_DIR, "src", "AGENTS.md"), "src agents")

    injector.storeFilePathForCall("call-1", join(TEST_DIR, "src", "file.ts"))
    await injector.handleFileReadComplete("call-1", "session-1")

    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0]?.text).toContain("src agents")
    expect(promptCalls[0]?.text).not.toContain("root agents")
  })

  test("does not duplicate injections within same session", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    writeFileSync(join(TEST_DIR, "src", "AGENTS.md"), "src agents")

    injector.storeFilePathForCall("call-1", join(TEST_DIR, "src", "file1.ts"))
    await injector.handleFileReadComplete("call-1", "session-1")

    injector.storeFilePathForCall("call-2", join(TEST_DIR, "src", "file2.ts"))
    await injector.handleFileReadComplete("call-2", "session-1")

    expect(promptCalls.length).toBe(1)
  })

  test("injects separately for different sessions", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    writeFileSync(join(TEST_DIR, "src", "AGENTS.md"), "src agents")

    injector.storeFilePathForCall("call-1", join(TEST_DIR, "src", "file.ts"))
    await injector.handleFileReadComplete("call-1", "session-1")

    injector.storeFilePathForCall("call-2", join(TEST_DIR, "src", "file.ts"))
    await injector.handleFileReadComplete("call-2", "session-2")

    expect(promptCalls.length).toBe(2)
    expect(promptCalls[0]?.sessionId).toBe("session-1")
    expect(promptCalls[1]?.sessionId).toBe("session-2")
  })

  test("handles relative file paths", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    writeFileSync(join(TEST_DIR, "src", "AGENTS.md"), "src agents")

    injector.storeFilePathForCall("call-1", "src/file.ts")
    await injector.handleFileReadComplete("call-1", "session-1")

    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0]?.text).toContain("src agents")
  })

  test("does nothing for files outside worktree", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    injector.storeFilePathForCall("call-1", "/some/other/path/file.ts")
    await injector.handleFileReadComplete("call-1", "session-1")

    expect(promptCalls.length).toBe(0)
  })

  test("does nothing when callId has no stored path", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    await injector.handleFileReadComplete("unknown-call", "session-1")

    expect(promptCalls.length).toBe(0)
  })

  test("logs each injection at debug level", async () => {
    const { client, logCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    writeFileSync(join(TEST_DIR, "src", "AGENTS.md"), "src agents")

    injector.storeFilePathForCall("call-1", join(TEST_DIR, "src", "file.ts"))
    await injector.handleFileReadComplete("call-1", "session-1")

    expect(logCalls.length).toBe(1)
    expect(logCalls[0]?.level).toBe("debug")
    expect(logCalls[0]?.service).toBe("opencode-agents-md-injector")
    expect(logCalls[0]?.message).toContain("src/AGENTS.md")
  })

  test("cleans up pending call after processing", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    writeFileSync(join(TEST_DIR, "src", "AGENTS.md"), "src agents")

    injector.storeFilePathForCall("call-1", join(TEST_DIR, "src", "file.ts"))
    await injector.handleFileReadComplete("call-1", "session-1")
    await injector.handleFileReadComplete("call-1", "session-1")

    expect(promptCalls.length).toBe(1)
  })

  test("does nothing when reading file in root directory", async () => {
    const { client, promptCalls } = createMockClient()
    const injector = new AgentsMdInjector(client as never, TEST_DIR)

    writeFileSync(join(TEST_DIR, "AGENTS.md"), "root agents")

    injector.storeFilePathForCall("call-1", join(TEST_DIR, "file.ts"))
    await injector.handleFileReadComplete("call-1", "session-1")

    expect(promptCalls.length).toBe(0)
  })
})

describe("AgentsMdInjectorPlugin", () => {
  beforeEach(() => {
    setupTestDirectory()
  })

  afterEach(() => {
    teardownTestDirectory()
  })

  test("ignores non-read tools", async () => {
    const { client, promptCalls } = createMockClient()
    const context = {
      client: client as never,
      worktree: TEST_DIR,
      directory: TEST_DIR,
      project: { id: "test", worktree: TEST_DIR, time: { created: "", updated: "" } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    }

    const hooks = await AgentsMdInjectorPlugin(context as never)

    await hooks["tool.execute.before"]?.(
      { tool: "write", sessionID: "session-1", callID: "call-1" },
      { args: { filePath: join(TEST_DIR, "src", "file.ts") } }
    )

    await hooks["tool.execute.after"]?.(
      { tool: "write", sessionID: "session-1", callID: "call-1" },
      { title: "", output: "", metadata: {} }
    )

    expect(promptCalls.length).toBe(0)
  })

  test("injects AGENTS.md through hook flow", async () => {
    const { client, promptCalls } = createMockClient()
    const context = {
      client: client as never,
      worktree: TEST_DIR,
      directory: TEST_DIR,
      project: { id: "test", worktree: TEST_DIR, time: { created: "", updated: "" } },
      serverUrl: new URL("http://localhost:4096"),
      $: {} as never,
    }

    writeFileSync(join(TEST_DIR, "src", "AGENTS.md"), "src agents content")

    const hooks = await AgentsMdInjectorPlugin(context as never)

    await hooks["tool.execute.before"]?.(
      { tool: "read", sessionID: "session-1", callID: "call-1" },
      { args: { filePath: join(TEST_DIR, "src", "file.ts") } }
    )

    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "session-1", callID: "call-1" },
      { title: "", output: "", metadata: {} }
    )

    expect(promptCalls.length).toBe(1)
    expect(promptCalls[0]?.text).toContain("src agents content")
  })
})
