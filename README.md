# Blogger MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that provides Claude and other MCP-compatible AI assistants with full access to the [Google Blogger API v3](https://developers.google.com/blogger/docs/3.0/getting_started). Supports reading, creating, updating, publishing, and deleting blog posts through natural language.

## Features

- **Blog management** — List all blogs under your account, get blog metadata
- **Post lifecycle** — Create drafts, edit, publish, revert to draft, delete
- **Read operations** — List posts, retrieve individual posts, search by keyword
- **Draft-first workflow** — Posts are created as drafts by default for safety, then published explicitly
- **Dual authentication** — API Key for read-only access, OAuth 2.0 for full read/write access
- **File-based content** — Load post content from local HTML files (recommended for content > 10KB)
- **Automatic token management** — OAuth tokens are cached, refreshed, and persisted automatically to `~/.config/mcp-blogger/`
- **Default blog** — Set `DEFAULT_BLOG_ID` to skip passing `blogId` on every tool call

## Project Structure

```
mcp-blogger/
├── index.js          # Main MCP server — tool definitions and handlers
├── oauth.js          # OAuth 2.0 authentication flow
└── package.json      # Project metadata and dependencies
```

## Prerequisites

- Node.js >= 22
- A Google Cloud project with the Blogger API enabled
- A Blogger API Key (for read operations) and/or OAuth 2.0 credentials (for write operations)

## Installation

```bash
git clone https://github.com/aleck31/mcp-blogger.git
cd mcp-blogger
npm install
```

## Authentication

This server supports two authentication methods. At least one must be configured:

- **API Key only** — read-only operations (`get_blog_info`, `list_posts`, `get_post`, `search_posts`)
- **OAuth only** — full read and write operations
- **Both** — API Key for reads, OAuth for writes

### 1. Get a Blogger API Key (read-only access)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select an existing one)
3. Enable the **Blogger API v3** under _APIs & Services > Library_
4. Go to _APIs & Services > Credentials_
5. Click **Create Credentials > API key**
6. Copy the generated API key

### 2. Get OAuth 2.0 Credentials (read + write access)

1. In the same Google Cloud project, go to _APIs & Services > Credentials_
2. Click **Create Credentials > OAuth client ID**
3. Select **Web application** as the application type
4. Add `http://localhost:3000/oauth/callback` to **Authorized redirect URIs**
5. Copy the **Client ID** and **Client Secret**

### 3. OAuth Flow (automatic)

On the first write operation, the server will automatically:

1. Start a temporary local HTTP server on port 3000
2. Open your browser to the Google OAuth consent page
3. After you grant access, capture the authorization code via the callback URL
4. Exchange the code for access and refresh tokens
5. Persist tokens to `~/.config/mcp-blogger/tokens.json`

Subsequent write operations reuse cached tokens and refresh them automatically when expired. The OAuth flow times out after 5 minutes if not completed.

## Configuration

Set the following environment variables in your MCP client configuration:

| Variable | Required | Description |
|---|---|---|
| `BLOGGER_API_KEY` | For read ops | Google Blogger API key |
| `GOOGLE_CLIENT_ID` | For write ops | OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | For write ops | OAuth 2.0 Client Secret |
| `DEFAULT_BLOG_ID` | No | Default Blog ID, used when `blogId` is omitted from tool calls |

### MCP Config Example

Add the server to your Agent MCP configuration file (such as `mcp_config.json`):

```json
{
  "mcpServers": {
    "blogger": {
      "command": "npx",
      "args": ["-y", "mcp-blogger"],
      "env": {
        "BLOGGER_API_KEY": "your-api-key",
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "DEFAULT_BLOG_ID": "your-default-blog-id"
      }
    }
  }
}
```

### Claude Code

Add the server via the Claude Code CLI:

```bash
claude mcp add blogger -- npx -y mcp-blogger \
  -e BLOGGER_API_KEY=your-api-key \
  -e GOOGLE_CLIENT_ID=your-client-id \
  -e GOOGLE_CLIENT_SECRET=your-client-secret \
  -e DEFAULT_BLOG_ID=your-default-blog-id
```

## Tools

All tools that accept `blogId` will fall back to `DEFAULT_BLOG_ID` if set.

| Category | Tool | OAuth | Description |
|---|---|---|---|
| **Account** | `list_blogs` | Yes | List all blogs owned by the authenticated user |
| **Read** | `get_blog_info` | No | Get blog metadata by URL or ID |
| **Read** | `list_posts` | No | List published posts |
| **Read** | `get_post` | No | Get a specific post (supports drafts with OAuth) |
| **Read** | `search_posts` | No | Search posts by keyword |
| **Write** | `list_drafts` | Yes | List draft posts |
| **Write** | `create_post` | Yes | Create a post (draft by default). Use `content_file` for large content |
| **Write** | `change_post_status` | Yes | Publish a draft or revert a published post to draft |
| **Write** | `update_post` | Yes | Update a post (supports both published and draft) |
| **Write** | `delete_post` | Yes | Delete a post |

## Typical Workflow

```
list_blogs                          # Find your blog ID
create_post (draft by default)      # Write content
get_post                            # Preview the draft
update_post                         # Revise if needed
change_post_status action=publish   # Go live
change_post_status action=revert    # Unpublish if needed
```

## Dependencies

- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — MCP server framework
- [`googleapis`](https://github.com/googleapis/google-api-nodejs-client) — Google API client (Blogger API v3)
- [`express`](https://expressjs.com/) — Local HTTP server for OAuth callback
- [`open`](https://github.com/sindresorhus/open) — Opens browser for OAuth consent

## License

MIT
