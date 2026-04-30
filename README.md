# @striderlabs/mcp-instacart

**Order groceries via Instacart using AI agents**

[![npm](https://img.shields.io/npm/v/@striderlabs/mcp-instacart)](https://www.npmjs.com/package/@striderlabs/mcp-instacart)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://mcpservers.org/servers/strider-labs-instacart)
[![Claude Desktop](https://img.shields.io/badge/Claude-Desktop-blue)](https://docs.anthropic.com/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

Part of [Strider Labs](https://github.com/striderlabsdev/striderlabs) — action execution for personal AI agents.

## Get Started in 2 Minutes

### For Claude Desktop Users

1. Add this to your Claude Desktop config:

```json
{
  "mcpServers": {
    "instacart": {
      "command": "npx",
      "args": ["-y", "@striderlabs/mcp-instacart"]
    }
  }
}
```

2. Restart Claude.
3. Tell Claude: *"Order my usual groceries for delivery tomorrow morning"*

Your agent can now place orders. That's it.

---

## Installation (NPM)

```bash
npm install @striderlabs/mcp-instacart
```

Or with npx directly:

```bash
npx @striderlabs/mcp-instacart
```

## Features

- 🛒 **Search for products** by name or category
- 📦 **Browse stores** and product availability
- 🏪 **Add to cart** with quantities and special requests
- 💳 **Place orders** with delivery time selection
- 📍 **Track orders** with real-time status
- 🔐 **Persistent sessions** - stay logged in across restarts
- 🔄 **Automatic MFA** - handles multi-factor authentication
- 📱 **Per-user credentials** - encrypted session storage
- ⭐ **Saved items** - order your favorites faster

## Tested & Compatible

| Component | Version | Status |
|-----------|---------|--------|
| **MCP SDK** | ^1.0.0 | ✅ |
| **Node.js** | 18+ | ✅ |
| **Claude Desktop** | Latest | ✅ |
| **Claude (API)** | claude-3.5-sonnet+ | ✅ |
| **Anthropic SDK** | ^0.20+ | ✅ |

## Metrics

- **Weekly downloads:** 271 (Apr 10-17, 2026) — Top grocery connector (+330% growth)
- **Status:** ✅ Live in production
- **Reliability:** 85%+ task completion rate
- **Discovery:** npm, mcpservers.org, ClawHub, PulseMCP, Glama, LobeHub

## Available Elsewhere

- **npm:** [npmjs.com/@striderlabs/mcp-instacart](https://npmjs.com/package/@striderlabs/mcp-instacart)
- **Claude Plugins:** Search "Strider Labs" in Claude
- **mcpservers.org:** [Strider Labs Instacart](https://mcpservers.org/servers/strider-labs-instacart)
- **Full Strider Labs:** [github.com/striderlabsdev/striderlabs](https://github.com/striderlabsdev/striderlabs)

## How It Works

### For Agents
Your agent can use these capabilities:
```javascript
// Search for products
products = search_products({
  query: "organic milk",
  location: "San Francisco, CA"
})

// Browse a store's offerings
store_products = get_store_products({
  store_id: "whole_foods_sf",
  category: "Dairy"
})

// Add to cart
add_to_cart({
  product_id: "organic_milk_gallon",
  quantity: 2,
  special_instructions: "Cold stock, please"
})

// Place an order
order = place_order({
  delivery_time: "tomorrow morning",
  delivery_address: "123 Main St, San Francisco, CA",
  special_instructions: "Ring the doorbell twice"
})

// Track delivery
status = track_order({ order_id: order.order_id })
```

### Session Management
- Each user has encrypted, persistent credentials
- Automatic OAuth token refresh
- MFA handling (SMS/email)
- Sessions survive agent restarts

### Reliability
- 85%+ task completion rate
- Automated UI change detection (connectors update when Instacart changes)
- Fallback paths for failures
- 24/7 monitoring + alerting

## Authentication

The MCP server uses a **persistent browser profile** (`~/.strider/instacart/browser-profile`) so your login session survives server restarts automatically.

### First-time login

1. Set `INSTACART_HEADLESS=false` in your MCP server config so the browser window is visible:

```json
{
  "mcpServers": {
    "instacart": {
      "command": "npx",
      "args": ["-y", "@striderlabs/mcp-instacart"],
      "env": { "INSTACART_HEADLESS": "false" }
    }
  }
}
```

2. Restart Claude / your MCP client.
3. Ask Claude to run `instacart_login` — a real browser window will open.
4. Log in to Instacart inside that window.
5. Run `instacart_status` to confirm authentication.
6. Remove `INSTACART_HEADLESS` (or set it back to `true`) and restart — the saved profile keeps you logged in.

### How login detection works

Authentication is verified by navigating to `/account` and confirming the page resolves without a redirect to `/login` or `/authentication` (positive detection). This is more reliable than checking for the absence of a "Log in" button.

## Configuration

### Environment Variables

```bash
# Show browser window (required for first-time login)
INSTACART_HEADLESS=false   # default: true (headless)
```

### Self-Hosted

```bash
# Clone the repo
git clone https://github.com/striderlabsdev/mcp-instacart
cd mcp-instacart

# Install dependencies
npm install

# Start the server
npm start

# Your agent can now connect to localhost:3000
```

## Architecture

### How We Connect
This connector uses browser automation (Playwright) to interact with Instacart, because Instacart doesn't have a public API. Here's why that's safe and reliable:

- **User-controlled:** Your agent only accesses your own Instacart account
- **Session-based:** We store your login session securely, not your password
- **Change-aware:** We detect Instacart UI changes and alert immediately
- **Fingerprinting:** We use realistic browser profiles to avoid bot detection
- **Rate-limited:** We respect Instacart's infrastructure with appropriate delays

### Security
- Credentials stored encrypted in your local `.env` or secure vault
- Sessions isolated per user
- No data sent to third parties
- MIT Licensed — audit the code yourself

## Support

- 📖 [Full Strider Labs Docs](https://github.com/striderlabsdev/striderlabs)
- 🐛 [Report Issues](https://github.com/striderlabsdev/mcp-instacart/issues)
- 💬 [Discussions](https://github.com/striderlabsdev/mcp-instacart/discussions)
- 🌐 [Website](https://striderlabs.ai)
- 📧 [Email](mailto:hello@striderlabs.ai)

## Contributing

We welcome contributions! Areas of interest:
- Bug reports and fixes
- Feature requests (new stores, categories, etc.)
- Performance improvements
- Documentation enhancements

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

MIT — Free to use, modify, and distribute. See [LICENSE](./LICENSE) for details.

---

**Built by Strider Labs** — Making AI agents actually useful.

[GitHub](https://github.com/striderlabsdev) | [Website](https://striderlabs.ai) | [Discord](https://discord.gg/openclaw)
