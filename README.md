# @striderlabs/mcp-instacart

MCP server that gives AI agents the ability to search products, manage cart, and place grocery orders on Instacart.

Built by [Strider Labs](https://striderlabs.ai) — building the action layer for AI agents.

## Features

- 🔍 **Search Products** — Find products across Instacart with prices and availability
- 🛒 **Cart Management** — Add items, view cart, clear cart
- 📦 **Place Orders** — Preview and place orders with delivery time selection
- 🔐 **Session Persistence** — Cookies saved locally for seamless re-authentication
- 🛡️ **Order Safety** — Requires explicit confirmation before placing orders

## Installation

```bash
npm install @striderlabs/mcp-instacart
```

Or install globally:

```bash
npm install -g @striderlabs/mcp-instacart
```

### Prerequisites

This package requires Playwright browsers. Install them with:

```bash
npx playwright install chromium
```

## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "instacart": {
      "command": "npx",
      "args": ["@striderlabs/mcp-instacart"]
    }
  }
}
```

### Other MCP Clients

```bash
npx @striderlabs/mcp-instacart
```

## Available Tools

### Authentication

| Tool | Description |
|------|-------------|
| `instacart_status` | Check login status and session info |
| `instacart_login` | Initiate login flow (returns URL for manual login) |
| `instacart_logout` | Clear saved session and cookies |

### Shopping

| Tool | Description |
|------|-------------|
| `instacart_search` | Search for products by name |
| `instacart_stores` | List available stores for delivery location |
| `instacart_set_address` | Set delivery address or zip code |

### Cart

| Tool | Description |
|------|-------------|
| `instacart_add_to_cart` | Add a product to cart |
| `instacart_view_cart` | View cart contents and totals |
| `instacart_clear_cart` | Remove all items from cart |

### Orders

| Tool | Description |
|------|-------------|
| `instacart_preview_order` | Preview order before placing |
| `instacart_place_order` | Place order (requires `confirm=true`) |

## Usage Examples

### Check Session Status

```
User: Am I logged into Instacart?
Agent: [calls instacart_status]
→ Returns login state, email, saved address
```

### Search for Products

```
User: Find organic bananas on Instacart
Agent: [calls instacart_search with query="organic bananas"]
→ Returns list of products with prices
```

### Build a Shopping List

```
User: Add milk, eggs, and bread to my Instacart cart
Agent: 
  [calls instacart_add_to_cart with product="milk"]
  [calls instacart_add_to_cart with product="eggs"]
  [calls instacart_add_to_cart with product="bread"]
→ Items added to cart
```

### View Cart

```
User: What's in my Instacart cart?
Agent: [calls instacart_view_cart]
→ Returns items, quantities, subtotal, fees, total
```

### Place Order

```
User: Place my Instacart order
Agent: [calls instacart_place_order with confirm=false]
→ Returns preview asking for confirmation
User: Yes, place it
Agent: [calls instacart_place_order with confirm=true]
→ Order placed, returns confirmation
```

## Authentication Flow

Instacart requires browser-based login. The flow:

1. Call `instacart_login` — returns login URL
2. User opens URL and logs in manually
3. Cookies are automatically saved to `~/.strider/instacart/`
4. Future sessions use saved cookies

Session cookies persist until they expire or `instacart_logout` is called.

## Configuration

Session data is stored in:

```
~/.strider/instacart/
├── cookies.json    # Browser cookies
└── session.json    # Session metadata
```

## Order Safety

The `instacart_place_order` tool has a built-in safety mechanism:

- Without `confirm=true`: Returns a preview, does not place order
- With `confirm=true`: Actually places the order

**Agents should ALWAYS show the preview and get explicit user confirmation before calling with `confirm=true`.**

## Technical Details

- Uses Playwright for browser automation
- Runs headless by default
- Includes stealth patches to avoid detection
- Supports all Instacart stores available in your area

## Limitations

- Requires manual login (no programmatic auth)
- Browser automation may break if Instacart updates their UI
- Some anti-bot measures may require solving CAPTCHAs manually
- Payment methods must be pre-configured in your Instacart account

## Troubleshooting

### "Not logged in" errors

Run `instacart_login` and complete the login flow manually.

### Timeout errors

Instacart pages may be slow. The server will retry automatically, but you can also:
1. Check your internet connection
2. Try again after a moment

### "Could not find element" errors

Instacart may have updated their UI. Please file an issue with details.

### CAPTCHA challenges

Some actions may trigger CAPTCHA. You'll need to:
1. Open Instacart in a regular browser
2. Complete the CAPTCHA
3. Try the MCP action again

## Development

```bash
# Clone the repo
git clone https://github.com/striderlabs/mcp-instacart
cd mcp-instacart

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Build
npm run build

# Run locally
node dist/index.js
```

## License

MIT

## Links

- [Strider Labs](https://striderlabs.ai)
- [MCP Protocol](https://modelcontextprotocol.io)
- [GitHub Issues](https://github.com/striderlabs/mcp-instacart/issues)
