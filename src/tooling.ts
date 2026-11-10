/**
 * Helpers for registering MCP tools with consistent error handling, read-only gating and
 * JSON output.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { describeError, redact, redactForLog, UserFacingError } from "./util/errors.js";

export type ZodShape = Record<string, z.ZodType>;

export interface ToolContext {
  server: McpServer;
  config: AppConfig;
  log: (message: string) => void;
  /** Called after every tool call (used for the per-user activity log in web mode). */
  onToolCall?: (tool: string, ok: boolean, durationMs: number) => void;
  /** Called before every tool call; throwing turns the call into a tool error (e.g. "connect PADI first"). */
  beforeToolCall?: (tool: string) => void;
}

export interface ToolSpec<Shape extends ZodShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  /** Mutating tools are not registered when the server runs in read-only mode. */
  kind: "read" | "write" | "destructive";
  idempotent?: boolean;
  /** Tool reaches a third party (for example, it sends a dive to a PADI Pro for verification). */
  openWorld?: boolean;
}

type Output<Shape extends ZodShape> = { [K in keyof Shape]: z.output<Shape[K]> };

export type ToolHandler<Shape extends ZodShape> = (args: Output<Shape>) => Promise<unknown>;

export function jsonResult(data: unknown): CallToolResult {
  if (isCallToolResult(data)) return data;
  const text = typeof data === "string" ? data : JSON.stringify(data, jsonReplacer, 2);
  return { content: [{ type: "text", text }] };
}

function isCallToolResult(data: unknown): data is CallToolResult {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { content?: unknown }).content) &&
    (data as { __raw?: boolean }).__raw === true
  );
}

/** Mark a value as an already-built tool result (e.g. with image or resource content). */
export function rawResult(result: CallToolResult): CallToolResult {
  return Object.assign(result, { __raw: true });
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Set) return [...value];
  if (value instanceof Map) return Object.fromEntries(value);
  if (value === undefined) return undefined;
  return value;
}

export function errorResult(error: unknown, secrets: readonly string[]): CallToolResult {
  const message = error instanceof UserFacingError ? error.message : `Error: ${describeError(error)}`;
  return { isError: true, content: [{ type: "text", text: redact(message, secrets) }] };
}

export function registerTool<Shape extends ZodShape>(
  ctx: ToolContext,
  spec: ToolSpec<Shape>,
  handler: ToolHandler<Shape>,
): void {
  if (ctx.config.readOnly && spec.kind !== "read") return;
  const annotations: ToolAnnotations = {
    title: spec.title,
    readOnlyHint: spec.kind === "read",
    destructiveHint: spec.kind === "destructive",
    idempotentHint: spec.idempotent ?? spec.kind === "read",
    openWorldHint: spec.openWorld ?? false,
  };
  ctx.server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      // Strict: a mistyped argument name (e.g. "occurence") is an error instead of being ignored,
      // which could otherwise fall back to a more destructive default.
      inputSchema: z.strictObject(spec.inputSchema),
      annotations,
    },
    // The SDK infers argument types from the shape; we re-type the handler to keep call sites simple.
    (async (args: Output<Shape>) => {
      const started = Date.now();
      try {
        ctx.beforeToolCall?.(spec.name);
        const result = await handler(args);
        const out = jsonResult(result);
        delete (out as { __raw?: boolean }).__raw;
        ctx.onToolCall?.(spec.name, true, Date.now() - started);
        return out;
      } catch (error) {
        // Log lines must not hold e-mail addresses either.
        ctx.log(`Tool ${spec.name} failed: ${redactForLog(describeError(error), ctx.config.secrets)}`);
        ctx.onToolCall?.(spec.name, false, Date.now() - started);
        return errorResult(error, ctx.config.secrets);
      }
    }) as never,
  );
}
