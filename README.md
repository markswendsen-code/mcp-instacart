# @striderlabs/mcp-instacart

**Order groceries via Instacart using AI agents**

[![npm](https://img.shields.io/npm/v/@striderlabs/mcp-instacart)](https://www.npmjs.com/package/@striderlabs/mcp-instacart)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://mcpservers.org/servers/strider-labs-instacart)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

Part of [Strider Labs](https://github.com/striderlabsdev/striderlabs) — action execution for personal AI agents.

## Installation

```bash
npm install @striderlabs/mcp-instacart
```

Or with npx:

```bash
npx @striderlabs/mcp-instacart
```

## Quick Start

### Claude Desktop Configuration

Add to your `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Your Agent Can Now

```
"Order my usual groceries from Instacart for delivery tomorrow morning"
→ Agent searches → Browses products → Places order → Confirms delivery
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

## Metrics

- **Weekly downloads:** 63 (Apr 3-9, 2026) — Top grocery connector
- **Status:** ✅ Live in production
- **Reliability:** 85%+ task completion rate
- **Discovery:** npm, Claude Plugins, mcpservers.org, ClawHub, PulseMCP

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

## Configuration

### Environment Variables

```bash
# Optional: Use a specific Instacart account
INSTACART_EMAIL=your-email@example.com
INSTACART_PASSWORD=your-password  # Highly recommend using .env file
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
