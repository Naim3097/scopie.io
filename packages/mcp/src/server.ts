#!/usr/bin/env node
/**
 * Scopie Commerce MCP server.
 *
 * One audited tool layer for every agent: the shopper agent, the live-host
 * brain (LiveKit Agents worker), and the seller assistant all call THESE tools
 * and nothing else. Tools are deterministic wrappers over the Scopie API;
 * the API re-validates every call server-side (agents are untrusted callers).
 *
 * MVP: tools proxy to the Scopie API (SCOPIE_API_URL). Run the API locally
 * (it has its own demo mode) before exercising these tools.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = process.env.SCOPIE_API_URL ?? "http://localhost:4000";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Identity for every tool call rides here: SCOPIE_API_TOKEN (the buyer's
  // Supabase access token) in configured mode, or the guest header mirroring
  // the web's device id in demo mode.
  const authHeaders: Record<string, string> = process.env.SCOPIE_API_TOKEN
    ? { authorization: `Bearer ${process.env.SCOPIE_API_TOKEN}` }
    : process.env.SCOPIE_GUEST_ID
      ? { "x-scopie-guest": process.env.SCOPIE_GUEST_ID }
      : {};
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...authHeaders, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Scopie API ${res.status} on ${path}`);
  return (await res.json()) as T;
}

const server = new McpServer({ name: "scopie-commerce", version: "0.1.0" });

server.tool(
  "search_products",
  "Search the Scopie catalog. Returns products with prices in RM (sen).",
  { query: z.string().min(1).max(200), limit: z.number().int().min(1).max(20).default(8) },
  async ({ query, limit }) => {
    const results = await api<unknown[]>(`/v1/products/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  },
);

server.tool(
  "get_product",
  "Fetch one product by id, including variants and stock.",
  { productId: z.string().min(1) },
  async ({ productId }) => {
    const product = await api<unknown>(`/v1/products/${encodeURIComponent(productId)}`);
    return { content: [{ type: "text", text: JSON.stringify(product) }] };
  },
);

server.tool(
  "add_to_cart",
  "Add a product to the current buyer's cart. Never charges — checkout is a separate human-confirmed step.",
  { productId: z.string().min(1), quantity: z.number().int().min(1).max(20).default(1) },
  async ({ productId, quantity }) => {
    const cart = await api<unknown>(`/v1/cart/items`, {
      method: "POST",
      body: JSON.stringify({ productId, quantity }),
    });
    return { content: [{ type: "text", text: JSON.stringify(cart) }] };
  },
);

server.tool(
  "get_order_status",
  "Look up an order's payment status for the buyer.",
  { orderId: z.string().uuid() },
  async ({ orderId }) => {
    const order = await api<unknown>(`/v1/payments/orders/${encodeURIComponent(orderId)}/status`);
    return { content: [{ type: "text", text: JSON.stringify(order) }] };
  },
);

// Deliberately absent: create_order / execute_payment. At MVP the agent
// assembles a cart and hands off to the Scopie Pay confirmation sheet —
// the human tap is the authorization (AP2-style mandates come later).

const transport = new StdioServerTransport();
await server.connect(transport);
