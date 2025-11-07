# RooCode MCP Server - System Patterns

## Architecture Overview

The RooCode MCP Server follows a client-server architecture pattern where:

- **MCP Client** (voice agent) ↔ **MCP Server** (this project) ↔ **VSCode Extension** (RooCode)

## Key Technical Decisions

### 1. Extension-Based Architecture
- Built as a VSCode extension to leverage existing VSCode APIs
- Uses the `vscode-mcp-server` template as foundation
- Integrates with VSCode's extension lifecycle and event system

### 2. MCP Protocol Implementation
- Follows the Model Context Protocol specification
- Provides tools that map to RooCode's public API methods
- Uses JSON-RPC for communication between client and server

### 3. RooCode API Integration Pattern
- Discovers RooCode extension via `vscode.extensions.getExtension()`
- Accesses public APIs through `extension.exports`
- Implements graceful error handling for unavailable extension

### 4. Tool Organization
- Grouped by functionality: task management, messaging, UI interaction
- Each tool has clear input/output schemas
- Voice-optimized responses for better user experience

## Architecture Patterns

### Extension Structure
```
src/
├── extension.ts          # Main extension entry point
├── server.ts            # MCP server implementation
├── tools/               # MCP tool implementations
│   ├── task-tools.ts    # Task management tools
│   ├── message-tools.ts # Message sending tools
│   └── ui-tools.ts      # UI interaction tools
└── utils/               # Utility functions
```

### Communication Flow
1. MCP client connects to server via configured hostname/port
2. Server registers RooCode-specific tools
3. Client calls tools which trigger RooCode API methods
4. RooCode executes actions and may send responses
5. Server forwards responses back to MCP client

### Error Handling Patterns
- Extension discovery failures return clear error messages
- API call timeouts provide meaningful feedback
- Graceful degradation when RooCode is not available
- Comprehensive logging for debugging purposes

## Design Principles

### Voice-First Design
- Tools designed with voice commands in mind
- Clear, concise responses suitable for voice output
- Error messages optimized for voice communication

### VSCode Integration
- Leverages VSCode's built-in settings system
- Uses status bar for server enable/disable toggle
- Follows VSCode extension development best practices

### Security & Safety
- Local-only operation (no cloud dependencies)
- Configurable hostname/port for network control
- Per-window server instances for multi-window support