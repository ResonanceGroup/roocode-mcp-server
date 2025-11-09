# RooCode MCP Server

A Model Context Protocol (MCP) server that exposes [RooCode](https://github.com/RooVetGit/Roo-Cline) extension APIs as MCP tools, enabling MCP clients to programmatically control RooCode's AI coding assistant.

## What is This?

This server acts as a bridge between the RooCode VSCode extension and any MCP-compatible client. It exposes RooCode's functionality through standardized MCP tools that allow clients to:

- 🤖 **Control RooCode programmatically** - start tasks, send messages, approve actions
- 📊 **Monitor task status** in real-time with MCP notifications or polling
- ⚙️ **Manage configurations** and API provider profiles remotely
- 🔄 **Integrate** RooCode into automation workflows and other tools

## Why Does This Exist?

**Primary motivation:** To enable voice-controlled coding workflows.

RooCode is a powerful AI coding assistant, but it had no programmatic interface. By exposing RooCode's APIs through MCP, this server makes it possible for:

1. **Voice agents** to control RooCode through natural language (the main reason this was built)
2. **Automation tools** to integrate RooCode into CI/CD pipelines or development workflows
3. **Other AI assistants** to leverage RooCode's capabilities programmatically

**Important:** This MCP server provides the bridge - it doesn't do voice control itself. Voice control is implemented in a separate voice agent client that connects to this server via MCP.

## Installation

### Prerequisites

- VSCode with [RooCode extension](https://github.com/RooVetGit/Roo-Cline) installed
- Node.js 16+ installed

### From Source

```bash
git clone https://github.com/ResonanceGroup/roocode-mcp-server.git
cd roocode-mcp-server
npm install
npm run compile
```

### Running the Server

The server runs as a VSCode extension. Press `F5` in VSCode to launch the Extension Development Host with the server active.

## Configuration

### MCP Client Configuration

Configure your MCP client to connect to the server. For example, in RooCode's MCP settings:

```json
{
  "mcpServers": {
    "roocode-mcp-server": {
      "command": "node",
      "args": ["path/to/roocode-mcp-server/dist/server.js"],
      "url": "http://localhost:4000/mcp"
    }
  }
}
```

### Server Settings

The server uses these default settings:
- **Host**: `0.0.0.0` (local only for security)
- **Port**: `4000`
- **Protocol**: HTTP with streamable transport (MCP-compliant)

## Available Tools

### Task Management

#### `roocode_initialize`
Initialize connection to RooCode extension. Call this first to ensure RooCode is available.

```json
{
  "name": "roocode_initialize"
}
```

#### `roocode_start_task`
Start a new RooCode coding task.

```json
{
  "name": "roocode_start_task",
  "arguments": {
    "text": "Create a React component for user login",
    "images": ["optional-image-url"]
  }
}
```

#### `roocode_send_message`
Send a message to the active RooCode task.

```json
{
  "name": "roocode_send_message",
  "arguments": {
    "message": "Add error handling for network failures"
  }
}
```

#### `roocode_approve_action`
Approve a RooCode interactive prompt (file creation, command execution, etc.).

```json
{
  "name": "roocode_approve_action"
}
```

#### `roocode_deny_action`
Deny a RooCode interactive prompt.

```json
{
  "name": "roocode_deny_action"
}
```

#### `roocode_check_status`
Check if RooCode is ready to receive commands.

```json
{
  "name": "roocode_check_status"
}
```

#### `roocode_poll_task_state`
Poll the current state of RooCode tasks (for clients without SSE support).

```json
{
  "name": "roocode_poll_task_state",
  "arguments": {
    "taskId": "optional-specific-task-id"
  }
}
```

Returns task status, last update timestamp, and recent messages (last 5).

### Configuration Management

#### `roocode_get_configuration`
Retrieve current RooCode extension configuration.

```json
{
  "name": "roocode_get_configuration"
}
```

#### `roocode_set_configuration`
Update RooCode extension configuration.

```json
{
  "name": "roocode_set_configuration",
  "arguments": {
    "config": {
      "settingName": "value"
    }
  }
}
```

### Profile Management

RooCode supports multiple API provider profiles. Manage them programmatically:

#### `roocode_get_profiles`
Get all configured API provider profiles.

#### `roocode_get_profile_entry`
Get details for a specific profile.

```json
{
  "name": "roocode_get_profile_entry",
  "arguments": {
    "profileId": "my-profile-id"
  }
}
```

#### `roocode_create_profile`
Create a new API provider profile.

```json
{
  "name": "roocode_create_profile",
  "arguments": {
    "profile": {
      "id": "anthropic-main",
      "name": "Anthropic Main",
      "provider": "anthropic",
      "apiKey": "your-api-key"
    }
  }
}
```

#### `roocode_update_profile`
Update an existing profile.

#### `roocode_delete_profile`
Delete a profile.

```json
{
  "name": "roocode_delete_profile",
  "arguments": {
    "profileId": "profile-to-delete"
  }
}
```

#### `roocode_get_active_profile`
Get the currently active profile.

#### `roocode_set_active_profile`
Set which profile is active.

```json
{
  "name": "roocode_set_active_profile",
  "arguments": {
    "profileId": "anthropic-main"
  }
}
```

## Real-Time Updates

### MCP-Native Notifications (Recommended)

The server sends real-time MCP notifications for RooCode events:

- **Task State Changes**: `taskActive`, `taskInteractive`, `taskIdle`, `taskCompleted`, `taskAborted`
- **Messages**: All RooCode messages are pushed as they occur
- **Interactive Prompts**: Notifications when RooCode is waiting for approval

Notifications are automatically sent to connected MCP clients that support SSE.

### Polling Alternative

For clients without SSE support, use `roocode_poll_task_state` to retrieve:
- Current task status (active, interactive, idle, completed, aborted)
- Last update timestamp
- Recent message history (last 5 messages with timestamps)

## Example Workflows

### Voice-Controlled Coding

```javascript
// Voice command: "Start a new React login component"
1. roocode_start_task({ text: "Create a React login component" })
2. Wait for taskInteractive notification
3. roocode_approve_action() // Approve file creation
4. Wait for taskCompleted notification
```

### Automated Task Management

```javascript
// Monitor and manage multiple tasks
1. roocode_initialize()
2. roocode_start_task({ text: "Refactor authentication" })
3. Poll with roocode_poll_task_state() every 2 seconds
4. When status === "interactive", check message for prompt type
5. Decide whether to approve or deny based on rules
6. Continue until status === "completed"
```

### Profile Switching

```javascript
// Switch between different API providers
1. roocode_get_profiles() // See all available profiles
2. roocode_set_active_profile({ profileId: "claude-opus" })
3. roocode_start_task({ text: "Complex architectural design" })
// Task runs with Claude Opus
4. roocode_set_active_profile({ profileId: "claude-sonnet" })
5. roocode_start_task({ text: "Simple bug fix" })
// Task runs with Claude Sonnet
```

## Architecture

```
┌─────────────────┐
│   MCP Client    │  (Voice agent, automation tool, etc.)
│   (Claude, etc) │
└────────┬────────┘
         │ HTTP + MCP Protocol
         │
┌────────▼────────┐
│  RooCode MCP    │
│     Server      │
│  (This project) │
└────────┬────────┘
         │ VSCode Extension API
         │
┌────────▼────────┐
│     RooCode     │
│   Extension     │
│   (VSCode)      │
└─────────────────┘
```

### Key Components

- **server.ts**: MCP server with StreamableHTTPServerTransport
- **task-management-tools.ts**: Task control, messaging, approval/denial
- **configuration-tools.ts**: RooCode settings management
- **profile-management-tools.ts**: API provider profile CRUD operations
- **event-streaming-server.ts**: Real-time event forwarding & state caching

## Protocol Compliance

- ✅ **MCP SDK 1.0** compliant
- ✅ **StreamableHTTPServerTransport** for SSE notifications
- ✅ **Session management** with UUID tracking
- ✅ **Tool schemas** with Zod validation
- ✅ **Error handling** with descriptive messages
- ✅ **Polling fallback** for non-SSE clients

## Security Considerations

⚠️ **Important**: This server allows programmatic control of RooCode, which can execute commands and modify files. 

**Best Practices**:
- Only run on `localhost` (default: `0.0.0.0`)
- Never expose to public networks
- Only connect trusted MCP clients
- Review tasks before approving file/command operations
- Use authentication if exposing beyond localhost (future feature)

## Development

### Building

```bash
npm install
npm run compile
```

### Testing

```bash
# Launch extension in debug mode
Press F5 in VSCode

# Run tests (if available)
npm test
```

### Contributing

Contributions welcome! Key areas:
- Additional RooCode API wrappers
- Enhanced error handling
- Authentication support
- Improved SSE reliability
- Better documentation

## Troubleshooting

### Server Not Initializing

```json
// Error: "Server not initialized"
```

**Solution**: Make sure RooCode MCP server is running in VSCode. Check the Output panel for "RooCode MCP Server" logs.

### RooCode Extension Not Found

```json
// Error: "RooCode extension not available"
```

**Solution**: 
1. Install RooCode extension: `rooveterinaryinc.roo-cline`
2. Reload VSCode window
3. Call `roocode_initialize` again

### Events Not Received

**For SSE clients**: Check that your MCP client supports Server-Sent Events.

**Fallback**: Use `roocode_poll_task_state` to manually poll task status every 1-2 seconds.

## License

MIT

## Credits

- Built on the [vscode-mcp-server](https://github.com/juehang/vscode-mcp-server) template
- Integrates with [RooCode](https://github.com/RooVetGit/Roo-Cline) extension
- Uses [MCP SDK](https://github.com/modelcontextprotocol/sdk) for protocol compliance

---

**Need Help?** Open an issue on [GitHub](https://github.com/ResonanceGroup/roocode-mcp-server/issues)
