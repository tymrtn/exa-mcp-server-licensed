[![Install in Cursor](https://img.shields.io/badge/Install_in-Cursor-000000?style=flat-square&logoColor=white)](https://cursor.com/en/install-mcp?name=exa&config=eyJuYW1lIjoiZXhhIiwidHlwZSI6Imh0dHAiLCJ1cmwiOiJodHRwczovL21jcC5leGEuYWkvbWNwIn0=)
[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=exa&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.exa.ai%2Fmcp%22%7D)
[![npm version](https://badge.fury.io/js/exa-mcp-server-licensed.svg)](https://www.npmjs.com/package/exa-mcp-server-licensed)
[![smithery badge](https://smithery.ai/badge/exa)](https://smithery.ai/server/exa)

# Exa MCP Server (Licensed Fork)

Fork of `exa-labs/exa-mcp-server` with Copyright.sh licensing:
- automatic `ai-license` discovery
- optional x402-aware fetch (402 + `payment-required: x402`)
- usage logging to the Copyright.sh ledger

The hosted Exa MCP (`https://mcp.exa.ai/mcp`) does not include these licensing features. Use this fork locally if you need compliant licensing.

Original repository: https://github.com/exa-labs/exa-mcp-server

## Why this fork?
This fork adds compliant licensing checks, optional x402 payment handling, and usage logging so developers can fetch content with clear rights and auditability.

## Quickstart
1. Get an Exa API key: https://dashboard.exa.ai/api-keys
2. Get a Copyright.sh ledger key: https://portal.copyright.sh
   - Sign up → complete onboarding → open API Keys → create a key (shown once)
3. Run:
```bash
env EXA_API_KEY=your_exa_key COPYRIGHTSH_LEDGER_API_KEY=your_ledger_key npx -y exa-mcp-server-licensed
```
4. Configure your MCP client:
```json
{
  "mcpServers": {
    "exa-licensed": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server-licensed"],
      "env": {
        "EXA_API_KEY": "your_exa_key",
        "COPYRIGHTSH_LEDGER_API_KEY": "your_ledger_key"
      }
    }
  }
}
```

## Configuration
Required:
- `EXA_API_KEY`
- `COPYRIGHTSH_LEDGER_API_KEY` (needed for license acquisition + usage logging)

Optional:
- `COPYRIGHTSH_LEDGER_API` (default: `https://ledger.copyright.sh`)
- `ENABLE_LICENSE_TRACKING` (default: `true`)
- `ENABLE_LICENSE_CACHE` (default: `false`)

License-aware options (`web_search_exa`, `crawling_exa`):
- `fetch`, `include_licenses`, `stage`, `distribution`, `estimated_tokens`, `max_chars`, `payment_method`

Unavailable policy:
- License denied or HTTP 401/403/402 results are returned with an `unavailable` reason and redacted content
- Unknown license remains best-effort

## Upstream docs
- https://github.com/exa-labs/exa-mcp-server
