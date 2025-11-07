# RooCode MCP Server - Product Context

## Why This Project Exists

The RooCode MCP Server project exists to bridge the gap between voice-controlled AI assistants and the RooCode VSCode extension. Currently, there's no way to voice-control RooCode directly, which limits the accessibility and convenience of AI-powered coding workflows.

## What Problems It Solves

1. **Voice Control Gap**: Enables developers to control RooCode through voice commands via MCP-compatible voice agents
2. **Accessibility**: Makes AI-powered coding more accessible to developers who prefer voice interaction or have mobility limitations
3. **Workflow Integration**: Allows seamless integration of RooCode capabilities into voice-controlled development workflows
4. **Multi-modal Interaction**: Combines the power of AI coding with natural language voice commands

## How It Should Work

The MCP server acts as a bridge between voice agents (like Claude via MCP) and the RooCode VSCode extension:

1. Voice agent sends commands via MCP protocol (e.g., "Create a React login component")
2. MCP server receives the command and translates it to RooCode API calls
3. RooCode extension executes the requested actions
4. Real-time status updates flow back through the MCP connection
5. Voice agent can provide responses and handle interactive prompts

## Target Use Cases

- "Create a new React component with TypeScript interfaces"
- "Run the test suite for the authentication module"
- "Fix the bug in the user profile component"
- "Generate documentation for the API endpoints"
- "Refactor the database connection code to use promises"