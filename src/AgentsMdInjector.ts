import type { PluginInput } from "@opencode-ai/plugin";
import { existsSync, readFileSync } from "fs";
import { dirname, isAbsolute, join, relative, sep } from "path";

export class AgentsMdInjector {
  private injectedPathsBySession: Map<string, Set<string>> = new Map();
  private pendingFilePathByCallId: Map<string, string> = new Map();
  private client: PluginInput["client"];
  private worktree: string;

  constructor(client: PluginInput["client"], worktree: string) {
    this.client = client;
    this.worktree = worktree;
  }

  storeFilePathForCall(callId: string, filePath: string): void {
    this.pendingFilePathByCallId.set(callId, filePath);
  }

  async handleFileReadComplete(
    callId: string,
    sessionId: string
  ): Promise<void> {
    const filePath = this.pendingFilePathByCallId.get(callId);
    this.pendingFilePathByCallId.delete(callId);

    if (filePath === undefined) {
      return;
    }

    const absoluteFilePath = this.resolveToAbsolutePath(filePath);
    const parentAgentsMdPaths = this.findParentAgentsMdPaths(absoluteFilePath);
    const newAgentsMdPaths = this.filterAlreadyInjectedPaths(
      parentAgentsMdPaths,
      sessionId
    );

    for (const agentsMdPath of newAgentsMdPaths) {
      await this.injectAgentsMdContent(agentsMdPath, sessionId);
    }
  }

  private resolveToAbsolutePath(filePath: string): string {
    if (isAbsolute(filePath)) {
      return filePath;
    }
    return join(this.worktree, filePath);
  }

  private findParentAgentsMdPaths(absoluteFilePath: string): string[] {
    const fileDirectory = dirname(absoluteFilePath);
    const relativeDirectory = this.getRelativePathFromWorktree(fileDirectory);

    if (relativeDirectory === null) {
      return [];
    }

    const pathSegments = this.splitPathIntoSegments(relativeDirectory);
    const agentsMdPaths: string[] = [];

    for (let depth = 1; depth <= pathSegments.length; depth++) {
      const partialPath = pathSegments.slice(0, depth).join(sep);
      const agentsMdPath = join(this.worktree, partialPath, "AGENTS.md");

      if (existsSync(agentsMdPath)) {
        agentsMdPaths.push(agentsMdPath);
      }
    }

    return agentsMdPaths;
  }

  private getRelativePathFromWorktree(absolutePath: string): string | null {
    if (!absolutePath.startsWith(this.worktree)) {
      return null;
    }

    const relativePath = relative(this.worktree, absolutePath);

    if (relativePath.startsWith("..")) {
      return null;
    }

    return relativePath;
  }

  private splitPathIntoSegments(relativePath: string): string[] {
    if (relativePath === "" || relativePath === ".") {
      return [];
    }
    return relativePath
      .split(sep)
      .filter((segment) => segment !== "" && segment !== ".");
  }

  private filterAlreadyInjectedPaths(
    agentsMdPaths: string[],
    sessionId: string
  ): string[] {
    const injectedPaths = this.getOrCreateInjectedPathsSet(sessionId);
    return agentsMdPaths.filter((path) => !injectedPaths.has(path));
  }

  private getOrCreateInjectedPathsSet(sessionId: string): Set<string> {
    const existingSet = this.injectedPathsBySession.get(sessionId);
    if (existingSet !== undefined) {
      return existingSet;
    }

    const newSet = new Set<string>();
    this.injectedPathsBySession.set(sessionId, newSet);
    return newSet;
  }

  private async injectAgentsMdContent(
    agentsMdPath: string,
    sessionId: string
  ): Promise<void> {
    const content = this.readAgentsMdFile(agentsMdPath);
    if (content === null) {
      return;
    }

    const relativeAgentsMdPath = relative(this.worktree, agentsMdPath);

    await this.logInjection(relativeAgentsMdPath);
    await this.showInjectionToast(relativeAgentsMdPath);
    await this.sendContextToSession(sessionId, relativeAgentsMdPath, content);
    this.markPathAsInjected(sessionId, agentsMdPath);
  }

  private readAgentsMdFile(agentsMdPath: string): string | null {
    try {
      return readFileSync(agentsMdPath, "utf-8");
    } catch {
      return null;
    }
  }

  private async logInjection(relativeAgentsMdPath: string): Promise<void> {
    await this.client.app.log({
      body: {
        service: "opencode-agents-md-injector",
        level: "debug",
        message: `Injecting ${relativeAgentsMdPath}`,
      },
    });
  }

  private async showInjectionToast(relativeAgentsMdPath: string): Promise<void> {
    await this.client.tui.showToast({
      body: {
        message: `Injected ${relativeAgentsMdPath}`,
        variant: "info",
      },
    });
  }

  private async sendContextToSession(
    sessionId: string,
    relativeAgentsMdPath: string,
    content: string
  ): Promise<void> {
    const formattedContent = `<agents-md path="${relativeAgentsMdPath}">\n${content}\n</agents-md>`;

    await this.client.session.prompt({
      path: { id: sessionId },
      body: {
        noReply: true,
        parts: [{ type: "text", text: formattedContent }],
      },
    });
  }

  private markPathAsInjected(sessionId: string, agentsMdPath: string): void {
    const injectedPaths = this.getOrCreateInjectedPathsSet(sessionId);
    injectedPaths.add(agentsMdPath);
  }
}
