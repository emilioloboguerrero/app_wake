import {runLogsDigest} from "./logsDigest.js";
import {runCronHeartbeat} from "./cronHeartbeat.js";
import {runPaymentsPulse} from "./paymentsPulse.js";
import {runQuotaWatch} from "./quotaWatch.js";
import {runClientErrors} from "./clientErrors.js";
import {sendTo, type TopicMap} from "./telegram.js";
import {setAgentPaused} from "./agentState.js";

export interface CommandContext {
  botToken: string;
  chatId: string;
  topics?: TopicMap;
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
  heartbeat: {
    description: "Scheduled-job freshness check",
    run: (ctx) => runCronHeartbeat(ctx),
  },
  payments: {
    description: "MercadoPago + subscriptions pulse (24h)",
    run: (ctx) => runPaymentsPulse(ctx),
  },
  quota: {
    description: "Firestore / Functions quotas vs 7d baseline",
    run: (ctx) => runQuotaWatch(ctx),
  },
  pwa_errors: {
    description: "Frontend errors, PWA (24h)",
    run: (ctx) => runClientErrors(ctx, {source: "pwa"}),
  },
  creator_errors: {
    description: "Frontend errors, creator dashboard (24h)",
    run: (ctx) => runClientErrors(ctx, {source: "creator"}),
  },
  agent_pause: {
    description: "Pause the smart agent (skips synthesis + @mentions)",
    run: async (ctx) => {
      await setAgentPaused(true);
      await sendTo(
        ctx,
        "signals",
        "[signals_wake] agent paused. /agent_resume to resume."
      );
    },
  },
  agent_resume: {
    description: "Resume the smart agent",
    run: async (ctx) => {
      await setAgentPaused(false);
      await sendTo(ctx, "signals", "[signals_wake] agent resumed.");
    },
  },
  help: {
    description: "List available commands",
    run: async (ctx) => {
      const lines = ["[signals_wake] available commands:"];
      for (const [name, handler] of Object.entries(registry)) {
        lines.push(`/${name} — ${handler.description}`);
      }
      await sendTo(ctx, "signals", lines.join("\n"));
    },
  },
};

registry.all = {
  description: "Run all collectors in sequence",
  run: async (ctx) => {
    const errors: string[] = [];
    for (const [name, handler] of Object.entries(registry)) {
      if (
        name === "all" ||
        name === "help" ||
        name === "agent_pause" ||
        name === "agent_resume"
      ) {
        continue;
      }
      try {
        await handler.run(ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`/${name}: ${msg}`);
      }
    }
    if (errors.length > 0) {
      await sendTo(
        ctx,
        "signals",
        `[signals_wake] /all completed with errors:\n${errors.join("\n")}`
      );
    }
  },
};

export const commands = registry;
