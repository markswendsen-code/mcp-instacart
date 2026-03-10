#!/usr/bin/env node

/**
 * Strider Labs Instacart MCP Server
 * 
 * MCP server that gives AI agents the ability to search products, manage cart,
 * and place grocery orders on Instacart via browser automation.
 * https://striderlabs.ai
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  checkLoginStatus,
  initiateLogin,
  searchProducts,
  addToCart,
  viewCart,
  clearCart,
  previewOrder,
  placeOrder,
  setDeliveryAddress,
  getAvailableStores,
  closeBrowser,
} from "./browser.js";
import { loadSessionInfo, clearAuthData, getConfigDir } from "./auth.js";

// Initialize server
const server = new Server(
  {
    name: "strider-instacart",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "instacart_status",
        description:
          "Check Instacart login status and session info. Use this to verify authentication before performing other actions.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "instacart_login",
        description:
          "Initiate Instacart login flow. Returns a URL and instructions for the user to complete login manually. After logging in, use instacart_status to verify.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "instacart_logout",
        description:
          "Clear saved Instacart session and cookies. Use this to log out or reset authentication state.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "instacart_search",
        description:
          "Search for products on Instacart. Returns product names, prices, and availability.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., 'organic bananas', 'whole milk')",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results to return (default: 10, max: 50)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "instacart_add_to_cart",
        description:
          "Add a product to the Instacart cart. Searches for the product and adds the first matching result.",
        inputSchema: {
          type: "object",
          properties: {
            product: {
              type: "string",
              description: "Product name or search query",
            },
            quantity: {
              type: "number",
              description: "Quantity to add (default: 1)",
            },
          },
          required: ["product"],
        },
      },
      {
        name: "instacart_view_cart",
        description:
          "View current Instacart cart contents, including items, quantities, and totals.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "instacart_clear_cart",
        description:
          "Remove all items from the Instacart cart.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "instacart_preview_order",
        description:
          "Preview order before placing. Shows cart summary, delivery window, and any issues that need to be resolved.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "instacart_place_order",
        description:
          "Place the order. IMPORTANT: Set confirm=true only when you have explicit user confirmation. Without confirm=true, this returns a preview instead of placing the order.",
        inputSchema: {
          type: "object",
          properties: {
            confirm: {
              type: "boolean",
              description:
                "Set to true to actually place the order. If false or omitted, returns a preview instead. NEVER set to true without explicit user confirmation.",
            },
          },
        },
      },
      {
        name: "instacart_set_address",
        description:
          "Set delivery address or zip code for Instacart orders.",
        inputSchema: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "Full address or zip code (e.g., '123 Main St, San Francisco, CA' or '94105')",
            },
          },
          required: ["address"],
        },
      },
      {
        name: "instacart_stores",
        description:
          "Get list of available stores for the current delivery location.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "instacart_status": {
        const sessionInfo = loadSessionInfo();
        const liveStatus = await checkLoginStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  session: liveStatus,
                  configDir: getConfigDir(),
                  message: liveStatus.isLoggedIn
                    ? `Logged in${liveStatus.userEmail ? ` as ${liveStatus.userEmail}` : ""}`
                    : "Not logged in. Use instacart_login to authenticate.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "instacart_login": {
        const result = await initiateLogin();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  ...result,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "instacart_logout": {
        clearAuthData();
        await closeBrowser();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "Logged out. Session and cookies cleared.",
              }),
            },
          ],
        };
      }

      case "instacart_search": {
        const { query, maxResults = 10 } = args as {
          query: string;
          maxResults?: number;
        };

        const products = await searchProducts(query, Math.min(maxResults, 50));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  query,
                  count: products.length,
                  products,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "instacart_add_to_cart": {
        const { product, quantity = 1 } = args as {
          product: string;
          quantity?: number;
        };

        const result = await addToCart(product, quantity);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: result.success,
                  message: result.message,
                  cartCount: result.cartCount,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "instacart_view_cart": {
        const cart = await viewCart();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  cart,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "instacart_clear_cart": {
        const result = await clearCart();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: result.success,
                  message: result.message,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "instacart_preview_order": {
        const preview = await previewOrder();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  ...preview,
                  note: preview.canPlace
                    ? "Ready to place order. Use instacart_place_order with confirm=true to complete."
                    : "Cannot place order. See issues field for required actions.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "instacart_place_order": {
        const { confirm = false } = args as { confirm?: boolean };

        if (!confirm) {
          const preview = await previewOrder();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    requiresConfirmation: true,
                    preview,
                    message:
                      "Order not placed. To place the order, call instacart_place_order with confirm=true. " +
                      "IMPORTANT: Only do this after getting explicit user confirmation.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const result = await placeOrder(true);

        if ("requiresConfirmation" in result) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    requiresConfirmation: result.requiresConfirmation,
                    preview: result.preview,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  orderPlaced: true,
                  confirmation: result,
                  message: `Order ${result.orderId} placed successfully! Estimated delivery: ${result.estimatedDelivery}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "instacart_set_address": {
        const { address } = args as { address: string };
        const result = await setDeliveryAddress(address);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: result.success,
                  message: result.message,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "instacart_stores": {
        const stores = await getAvailableStores();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  count: stores.length,
                  stores,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: errorMessage,
              suggestion: errorMessage.includes("login") || errorMessage.includes("auth")
                ? "Try running instacart_login to authenticate"
                : errorMessage.includes("timeout")
                ? "The page took too long to load. Try again."
                : undefined,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Cleanup on server close
server.onclose = async () => {
  await closeBrowser();
};

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Strider Instacart MCP server running");
  console.error(`Config directory: ${getConfigDir()}`);
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
