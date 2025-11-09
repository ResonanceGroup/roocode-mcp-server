# MCP Server-to-Client Notifications Research

## Overview

This document contains comprehensive research on implementing server-to-client notifications in the Model Context Protocol (MCP) using the @modelcontextprotocol/sdk, specifically for StreamableHTTPServerTransport scenarios.

## 1. Correct API for Sending MCP Notifications

### From McpServer Instance (High-level API)

```typescript
// Send logging messages (most common notification type)
await server.sendLoggingMessage({
  level: "info",
  data: "Task status updated"
});

// Send specific list changed notifications
server.sendResourceListChanged();
server.sendToolListChanged();
server.sendPromptListChanged();
```

### From Underlying Server Instance (Low-level API)

```typescript
// For custom notifications using the base Server class
await server.server.notification({
  method: "notifications/custom",
  params: { data: "custom notification data" }
});
```

## 2. Tracking Active Transport Connections

### Session Management Implementation

```typescript
// Store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// In request handler, track session initialization
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: (sessionId) => {
    transports[sessionId] = transport;
  }
});

// Clean up on close
transport.onclose = () => {
  if (transport.sessionId) {
    delete transports[transport.sessionId];
  }
};
```

## 3. Proper Notification Message Format

### JSON-RPC 2.0 Notification Structure

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",  // or other notification method
  "params": {
    "level": "info",
    "data": "Your notification data here"
  }
}
```

### Key Notification Types

- `notifications/message` - Logging messages
- `notifications/tools/list_changed` - Tool list updates
- `notifications/resources/list_changed` - Resource list updates
- `notifications/prompts/list_changed` - Prompt list updates
- `notifications/progress` - Progress updates
- `notifications/cancelled` - Cancellation notifications

## 4. Code Examples from SDK

### Sending Logging Notifications

```typescript
// From the simpleStreamableHttp.ts example
await server.sendLoggingMessage(
  {
    level: 'info',
    data: `Sending first greeting to ${name}`
  },
  extra.sessionId  // Optional session ID for stateless scenarios
);
```

### Dynamic Tool Updates with Automatic Notifications

```typescript
// From README.md dynamic servers example
const tool = server.registerTool(...);
tool.disable();  // Automatically sends notifications/tools/list_changed
tool.enable();   // Automatically sends notifications/tools/list_changed
tool.remove();   // Automatically sends notifications/tools/list_changed
```

## 5. Server vs Transport Layer for Notifications

### Server Layer (High-level API)
- Use `McpServer` class methods like `sendLoggingMessage()`, `sendToolListChanged()`
- Handles capability checking and proper formatting
- Recommended for most use cases

### Transport Layer (Low-level)
- Use `transport.send()` for direct message sending
- Manual session management required
- More control but more complex

## 6. Key Implementation Points

### Session Management
For persistent notifications, you need session management with `sessionIdGenerator`

### Capability Declaration
Server must declare capabilities like `{ logging: {} }` in constructor

### SSE Support
GET requests to `/mcp` endpoint handle SSE streams for notifications

### Resumability
Use `eventStore` option for handling client reconnections

## 7. Practical Implementation for RooCode

```typescript
// In your MCP server setup
const server = new McpServer({
  name: 'RooCode Server',
  version: '1.0.0'
}, {
  capabilities: {
    logging: {},  // Enable logging notifications
    tools: { listChanged: true },  // Enable tool list change notifications
    resources: { listChanged: true }
  }
});

// Send task status notifications
await server.sendLoggingMessage({
  level: "info",
  data: {
    task: "code-generation",
    status: "completed",
    taskId: "12345"
  }
});

// Send tool list updates when RooCode tools change
server.sendToolListChanged();  // Automatic when using registerTool().update()
```

## 8. Complete Example Implementation

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { randomUUID } from 'node:crypto';

const app = express();
app.use(express.json());

// Store transports for session management
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Create MCP server with logging capabilities
const server = new McpServer(
  {
    name: 'roocode-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      logging: {},
      tools: { listChanged: true },
      resources: { listChanged: true }
    }
  }
);

// Register tools, resources, prompts as needed
server.registerTool(
  'status-update',
  {
    title: 'Status Update',
    description: 'Send a status update notification',
    inputSchema: {
      message: z.string().describe('Status message to send')
    }
  },
  async ({ message }) => {
    // Send notification to client
    await server.sendLoggingMessage({
      level: 'info',
      data: {
        type: 'status-update',
        message: message,
        timestamp: new Date().toISOString()
      }
    });
    
    return {
      content: [{
        type: 'text',
        text: `Status update sent: ${message}`
      }]
    };
  }
);

// POST endpoint for client requests
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  
  try {
    let transport: StreamableHTTPServerTransport;
    
    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else if (!sessionId) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        }
      });
      
      transport.onclose = () => {
        if (transport.sessionId && transports[transport.sessionId]) {
          delete transports[transport.sessionId];
        }
      };
      
      await server.connect(transport);
    }
    
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});

// GET endpoint for SSE streams (notifications)
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

const port = parseInt(process.env.PORT || '3000');
app.listen(port, () => {
  console.log(`RooCode MCP Server running on http://localhost:${port}/mcp`);
});
```

## 9. Notification Debouncing for Efficiency

```typescript
// Enable notification debouncing to reduce network traffic
const server = new McpServer(
  {
    name: "efficient-server",
    version: "1.0.0"
  },
  {
    // Enable notification debouncing for specific methods
    debouncedNotificationMethods: [
      'notifications/tools/list_changed',
      'notifications/resources/list_changed',
      'notifications/prompts/list_changed'
    ]
  }
);

// Now, any rapid changes will result in consolidated notifications
server.registerTool("tool1", ...).disable();
server.registerTool("tool2", ...).disable();
server.registerTool("tool3", ...).disable();
// Only one 'notifications/tools/list_changed' is sent instead of three
```

## 10. Best Practices

### Error Handling
```typescript
try {
  await server.sendLoggingMessage({
    level: "error",
    data: {
      message: "Task failed",
      error: error.message,
      stack: error.stack
    }
  });
} catch (notificationError) {
  console.error('Failed to send notification:', notificationError);
}
```

### Conditional Notifications
```typescript
// Only send notifications if client supports logging
if (server.server.getClientCapabilities()?.logging) {
  await server.sendLoggingMessage({
    level: "info",
    data: "Client supports logging, sending notification"
  });
}
```

## Sources

- @modelcontextprotocol/typescript-sdk GitHub repository
- Model Context Protocol specification (modelcontextprotocol.io)
- SDK README.md documentation
- SDK example files (simpleStreamableHttp.ts, toolWithSampleServer.ts)
- MCP specification documentation on notifications