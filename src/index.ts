import type { Plugin } from "@opencode-ai/plugin";
import { AgentsMdInjector } from "./AgentsMdInjector";

const AgentsMdInjectorPlugin: Plugin = async function (context) {
  const injector = new AgentsMdInjector(context.client, context.worktree);

  return {
    "tool.execute.before": async function (input, output) {
      if (input.tool !== "read") {
        return;
      }

      const filePath = output.args?.filePath;
      if (typeof filePath !== "string") {
        return;
      }

      injector.storeFilePathForCall(input.callID, filePath);
    },

    "tool.execute.after": async function (input, _output) {
      if (input.tool !== "read") {
        return;
      }

      await injector.handleFileReadComplete(input.callID, input.sessionID);
    },
  };
};

export default AgentsMdInjectorPlugin;
