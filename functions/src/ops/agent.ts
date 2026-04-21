// Agent core — Claude tool-calling loop.
//
// runAgent(mode, input, runtime) drives a single Claude completion, letting
// the model call AGENT_TOOLS as needed. The loop stops when Claude stops
// requesting tools or when we hit safety caps (step count or tokens).
//
// This function posts nothing to Telegram on its own. Its return value
// carries the final text; the caller decides whether to send it (mention
// handler does, synthesis cron does, test harness does not).

import Anthropic from "@anthropic-ai/sdk";
import * as functions from "firebase-functions";
import {
  AGENT_TOOLS,
  runTool,
  toolDefinitionsForClaude,
  type AgentRuntime,
} from "./agentTools.js";
import {buildSystemPrompt, type AgentMode} from "./agentPrompt.js";

const MODEL = "claude-opus-4-7";
const MAX_STEPS = 12;
const MAX_OUTPUT_TOKENS = 2048;

export interface RunAgentOptions {
  mode: AgentMode;
  input: string; // operator message for mention, empty/context for synthesis
  runtime: AgentRuntime;
  anthropicApiKey: string;
  maxInputTokens?: number;
}

export interface RunAgentResult {
  finalText: string;
  stopReason: string;
  stepCount: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: Array<{name: string; input: unknown}>;
}

type AnyContentBlock = Anthropic.Messages.ContentBlock;
type AnyInputBlock = Anthropic.Messages.MessageParam["content"] extends infer T
  ? T extends Array<infer U>
    ? U
    : never
  : never;

export async function runAgent(
  opts: RunAgentOptions
): Promise<RunAgentResult> {
  const client = new Anthropic({apiKey: opts.anthropicApiKey});
  const system = buildSystemPrompt(opts.mode);
  const tools = toolDefinitionsForClaude();

  const messages: Anthropic.Messages.MessageParam[] = [];
  const userText = opts.input && opts.input.trim().length > 0 ?
    opts.input :
    "(no input — perform your scheduled work for this mode)";
  messages.push({role: "user", content: userText});

  let inputTokens = 0;
  let outputTokens = 0;
  const toolCalls: Array<{name: string; input: unknown}> = [];
  let stopReason = "max_steps";
  let finalText = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
      })),
      messages,
    });

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    if (opts.maxInputTokens && inputTokens > opts.maxInputTokens) {
      stopReason = "input_token_budget";
      functions.logger.warn("agent hit input token budget", {inputTokens});
      break;
    }

    const assistantBlocks = response.content;
    messages.push({role: "assistant", content: assistantBlocks});

    // Collect tool_use blocks; if none, this is the terminal response.
    const toolUseBlocks = assistantBlocks.filter(
      (b): b is Extract<AnyContentBlock, {type: "tool_use"}> =>
        b.type === "tool_use"
    );
    const textBlocks = assistantBlocks.filter(
      (b): b is Extract<AnyContentBlock, {type: "text"}> => b.type === "text"
    );

    if (toolUseBlocks.length === 0) {
      stopReason = response.stop_reason ?? "end_turn";
      finalText = textBlocks.map((b) => b.text).join("\n").trim();
      return {
        finalText,
        stopReason,
        stepCount: step + 1,
        inputTokens,
        outputTokens,
        toolCalls,
      };
    }

    // Execute each tool_use and append a user message with tool_result blocks.
    const toolResults: AnyInputBlock[] = [];
    for (const tu of toolUseBlocks) {
      toolCalls.push({name: tu.name, input: tu.input});
      // Guard against tool names Claude might hallucinate.
      const known = AGENT_TOOLS.some((t) => t.name === tu.name);
      if (!known) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify({error: `unknown tool: ${tu.name}`}),
          is_error: true,
        });
        continue;
      }
      const result = await runTool(opts.runtime, tu.name, tu.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result).slice(0, 32_000),
      });
    }
    messages.push({role: "user", content: toolResults});
  }

  return {
    finalText,
    stopReason,
    stepCount: MAX_STEPS,
    inputTokens,
    outputTokens,
    toolCalls,
  };
}
