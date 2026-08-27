import { BadRequestException, Body, Controller, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { ProductsService } from "../products/products.service";

const ShopperBody = z.object({
  message: z.string().min(1).max(1000),
});

/**
 * AI Personal Shopper endpoint — MVP stub.
 *
 * Production shape: an agent loop (Vercel AI SDK / Claude) whose ONLY tools
 * are the Scopie Commerce MCP server's (packages/mcp). The agent assembles a
 * cart; checkout is always a human-confirmed Scopie Pay sheet.
 *
 * The stub runs the same search tool deterministically so the UI, event flow,
 * and product cards work before an LLM key is configured.
 */
@Controller("v1/agents")
export class AgentsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Post("shopper")
  async shopper(@Body() body: unknown) {
    const parsed = ShopperBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { message } = parsed.data;

    // TODO: swap for the real agent loop when ANTHROPIC_API_KEY is set.
    const results = await this.products.search(message, 4);
    const reply =
      results.length > 0
        ? `Here's what I found for you — ${results.length === 1 ? "one pick that matches" : `${results.length} picks that match`}. Tap one to see details, or tell me a budget and I'll narrow it down.`
        : `I couldn't find that yet — our sellers add new items daily. Try a different word, or tell me the style you're after and I'll keep an eye out.`;
    return { reply, products: results };
  }
}
