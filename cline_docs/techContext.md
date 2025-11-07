# RooCode MCP Server - Technical Context

## Technologies Used

### Core Technologies
- **TypeScript** - Primary language for VSCode extension development
- **Node.js** - Runtime environment for VSCode extensions
- **VSCode Extension API** - Integration with VSCode functionality
- **Model Context Protocol (MCP)** - Communication protocol with AI clients

### Development Tools
- **ESLint** - Code quality and consistency enforcement
- **TypeScript Compiler** - Type checking and compilation
- **VSCode Extension Development Host** - Testing and debugging environment

### Dependencies
- **@types/vscode** - TypeScript definitions for VSCode API
- **@types/node** - TypeScript definitions for Node.js
- **@typescript-eslint/eslint-plugin** - ESLint plugin for TypeScript
- **@typescript-eslint/parser** - TypeScript parser for ESLint

## Development Setup

### Prerequisites
- VSCode installed with Extension Development Host capability
- Node.js and npm installed
- TypeScript development environment configured

### Project Structure
```
roocode-mcp-server/
├── src/                 # Source code
│   ├── extension.ts     # Extension entry point
│   ├── server.ts        # MCP server implementation
│   ├── tools/           # MCP tool implementations
│   └── utils/           # Utility functions
├── cline_docs/          # Memory Bank documentation
├── package.json         # Extension manifest and dependencies
├── tsconfig.json        # TypeScript configuration
└── eslint.config.mjs    # ESLint configuration
```

### Development Workflow
1. Clone the `vscode-mcp-server` template repository
2. Install dependencies with `npm install`
3. Open in VSCode and run "Run Extension" launch configuration
4. Test changes in Extension Development Host
5. Package extension for distribution

## Technical Constraints

### VSCode Extension Limitations
- Must adhere to VSCode extension manifest format
- Limited access to system resources for security
- Extension lifecycle events must be properly handled
- Cannot modify VSCode core functionality directly

### MCP Protocol Constraints
- Must implement MCP specification-compliant tools
- JSON-RPC communication requires proper error handling
- Tool schemas must be clearly defined and validated
- Real-time communication requires efficient implementation

### RooCode Integration Constraints
- Can only access publicly exported RooCode APIs
- Must handle cases where RooCode extension is not installed/enabled
- API calls may be asynchronous and require proper promise handling
- Extension state changes must be monitored and handled gracefully

### Performance Considerations
- Minimal overhead when MCP server is not actively used
- Efficient memory usage in long-running VSCode sessions
- Non-blocking operations to maintain VSCode responsiveness
- Proper cleanup of resources when extension is deactivated

### Security Requirements
- Local-only operation (no external network dependencies)
- Configurable network binding (hostname/port settings)
- No storage of sensitive information in extension settings
- Proper validation of MCP client requests