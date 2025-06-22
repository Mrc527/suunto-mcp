# Suunto MCP Server

This project is a Next.js application and MCP server for enabling AI to interact with your Suunto device. It supports:

- User login with Suunto credentials
- In-memory database (Sequelize + SQLite) for storing user tokens
- MCP authentication for multiple clients (Claude, VSCode, etc.)
- Proxying requests to Suunto API using a shared client key/password
- Modern UI with shadcn/ui components
- Deployable to Vercel

## Getting Started

1. Install dependencies:
   ```sh
   yarn install
   ```
2. Run the development server:
   ```sh
   yarn dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## MCP Server
- The MCP server is implemented as an API route in Next.js.
- Configure your MCP client (Claude, VSCode, etc.) to connect to your Vercel deployment and use the issued MCP token for authentication.
- **Production MCP server URL:** `https://suunto-mcp.vercel.app/api/mcp`

## Project Structure
- `pages/` - Next.js pages (UI, API endpoints)
- `src/` - Application logic (MCP server, DB, auth)
- `styles/` - Global styles

## References
- [Suunto API Docs](https://apizone.suunto.com/apis)
- [MCP SDK](https://github.com/modelcontextprotocol/sdk)
- [shadcn/ui](https://ui.shadcn.com/)

---

> For MCP server implementation details, see https://modelcontextprotocol.io/quickstart/server and https://modelcontextprotocol.io/llms-full.txt
