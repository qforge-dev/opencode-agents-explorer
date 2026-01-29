# 🔍 opencode-agents-explorer

OpenCode plugin that automatically injects AGENTS.md files from nested folders when an agent reads files.

## 🤔 Why Use This?

OpenCode automatically loads the root `AGENTS.md` file to give the AI context about your project. But what about **folder-specific instructions**?

Large codebases often have different conventions, patterns, or rules for different parts of the project:

- 📁 `src/api/` - REST endpoint conventions, authentication patterns
- 📁 `src/components/` - React component guidelines, styling rules
- 📁 `src/database/` - Migration patterns, naming conventions
- 📁 `tests/` - Testing standards, mocking strategies

Without this plugin, you'd need to either:

1. Cram everything into the root `AGENTS.md` (becomes unwieldy)
2. Manually tell the agent to read folder-specific docs (easy to forget and agents get confused)

This plugin solves that by **automatically injecting relevant `AGENTS.md` files** when the agent reads files in those directories similar to .cursorrules.

## ✨ Features

- 🎯 **Automatic injection** - No manual intervention needed
- 🚫 **No duplicates** - Each `AGENTS.md` is injected only once per session
- ⚡ **Smart skipping** - Ignores root `AGENTS.md` (OpenCode handles it)
- 📂 **Hierarchical** - Injects all parent `AGENTS.md` files up to (but not including) root

## 📦 Installation

Add to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@qforge/opencode-agents-explorer"]
}
```

## 🔧 How It Works

When an agent reads a file at path `a/b/c.json`, the plugin:

1. Searches for `a/AGENTS.md` and `a/b/AGENTS.md`
2. If any exist, reads their contents and injects them into the session context
3. Skips the root `AGENTS.md` (OpenCode already handles it automatically)
4. Tracks which `AGENTS.md` files have been added to avoid duplicates within a session

## 📁 Example

Given this file structure:

```
project/
  AGENTS.md              # ⏭️ Skipped (handled by OpenCode)
  src/
    AGENTS.md            # ✅ Injected when reading files in src/
    components/
      AGENTS.md          # ✅ Injected when reading files in src/components/
      Button.tsx
```

When the agent reads `src/components/Button.tsx`, the plugin will inject:

- `src/AGENTS.md`
- `src/components/AGENTS.md`

## 💡 Use Case: Monorepo with Multiple Packages

```
monorepo/
  AGENTS.md                    # General project context
  packages/
    api/
      AGENTS.md                # "Use Express patterns, validate with Zod"
      src/
        routes/
          AGENTS.md            # "All routes must have auth middleware"
    web/
      AGENTS.md                # "Use Next.js App Router, Tailwind CSS"
      src/
        components/
          AGENTS.md            # "Components must be server-first"
```

Now when the agent works on `packages/api/src/routes/users.ts`, it automatically gets context about:

- Express patterns and Zod validation (`packages/api/AGENTS.md`)
- Auth middleware requirements (`packages/api/src/routes/AGENTS.md`)

## 📄 License

MIT
