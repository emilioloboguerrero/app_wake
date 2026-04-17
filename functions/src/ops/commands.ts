import {runLogsDigest} from "./logsDigest.js";
import {sendTelegram} from "./telegram.js";

export interface CommandContext {
  botToken: string;
  chatId: string;
  projectId: string;
}

export interface CommandHandler {
  description: string;
  run: (ctx: CommandContext) => Promise<void>;
}

const registry: Record<string, CommandHandler> = {
  logs: {
    description: "Run the logs digest (last 24h warnings+)",
    run: (ctx) => runLogsDigest(ctx),
  },
  help: {
    description: "List available commands",
    run: async (ctx) => {
      const lines = ["[signals_wake] available commands:"];
      for (const [name, handler] of Object.entries(registry)) {
        lines.push(`/${name} — ${handler.description}`);
      }
      await sendTelegram(ctx.botToken, ctx.chatId, lines.join("\n"));
    },
  },
};

registry.all = {
  description: "Run all collectors in sequence",
  run: async (ctx) => {
    const errors: string[] = [];
    for (const [name, handler] of Object.entries(registry)) {
      if (name === "all" || name === "help") continue;
      try {
        await handler.run(ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`/${name}: ${msg}`);
      }
    }
    if (errors.length > 0) {
      await sendTelegram(
        ctx.botToken,
        ctx.chatId,
        `[signals_wake] /all completed with errors:\n${errors.join("\n")}`
      );
    }
  },
};

export const commands = registry;
