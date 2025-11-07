import * as vscode from 'vscode';
import { MCPServer, ToolConfiguration } from './server';
import { logger } from './utils/logger';

// Re-export for testing purposes
export { MCPServer };

let mcpServer: MCPServer | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.OutputChannel | undefined;
// Server state - disabled by default
let serverEnabled: boolean = false;

/**
 * Gets the tool configuration from VS Code settings
 * @returns ToolConfiguration object with all tool enablement settings
 */
function getToolConfiguration(): ToolConfiguration {
    const config = vscode.workspace.getConfiguration('roocode-mcp-server');
    const enabledTools = config.get<any>('enabledTools') || {};
    
    return {
        roocode: enabledTools.roocode ?? true
    };
}

// Function to update status bar
function updateStatusBar(port: number) {
    if (!statusBarItem) {
        return;
    }

    if (serverEnabled) {
        statusBarItem.text = `$(server) RooCode MCP: ${port}`;
        statusBarItem.tooltip = `RooCode MCP Server running at localhost:${port} (Click to toggle)`;
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = `$(server) RooCode MCP: Off`;
        statusBarItem.tooltip = `RooCode MCP Server is disabled (Click to toggle)`;
        // Use a subtle color to indicate disabled state
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    statusBarItem.show();
}

// Function to toggle server state
async function toggleServerState(context: vscode.ExtensionContext): Promise<void> {
    logger.info(`[toggleServerState] Starting toggle operation - changing from ${serverEnabled} to ${!serverEnabled}`);
    
    serverEnabled = !serverEnabled;
    
    // Store state for persistence
    context.globalState.update('mcpServerEnabled', serverEnabled);
    
    const config = vscode.workspace.getConfiguration('roocode-mcp-server');
    const port = config.get<number>('port') || 4000;
    const host = config.get<string>('host') || '0.0.0.0';
    
    // Update status bar immediately to provide feedback
    updateStatusBar(port);
    
    if (serverEnabled) {
        // Start the server if it was disabled
        if (!mcpServer) {
            logger.info(`[toggleServerState] Creating RooCode MCP server instance`);
            if (outputChannel) {
                outputChannel.appendLine(`[${new Date().toISOString()}] [TOGGLE] Starting server...`);
            }

            const toolConfig = getToolConfiguration();
            mcpServer = new MCPServer(port, host, toolConfig);
            mcpServer.setupTools();
            if (outputChannel) {
                outputChannel.appendLine(`[${new Date().toISOString()}] [TOGGLE] Tools configured`);
            }

            logger.info(`[toggleServerState] Starting server at ${new Date().toISOString()}`);
            const startTime = Date.now();
            if (outputChannel) {
                outputChannel.appendLine(`[${new Date().toISOString()}] [TOGGLE] Starting HTTP server...`);
            }

            await mcpServer.start();

            const duration = Date.now() - startTime;
            logger.info(`[toggleServerState] Server started successfully at ${new Date().toISOString()} (took ${duration}ms)`);
            if (outputChannel) {
                outputChannel.appendLine(`[${new Date().toISOString()}] [TOGGLE] ✓ Server started successfully (took ${duration}ms)`);
                outputChannel.appendLine(`[${new Date().toISOString()}] [TOGGLE] ✓ Listening on ${host}:${port}`);
                outputChannel.appendLine(`[${new Date().toISOString()}] [TOGGLE] ✓ MCP endpoint: http://${host}:${port}/mcp`);
                outputChannel.appendLine(`[${new Date().toISOString()}] [TOGGLE] ✓ SSE endpoint: http://${host}:${port}/mcp/sse`);
            }

            vscode.window.showInformationMessage(`RooCode MCP Server enabled and running at http://localhost:${port}/mcp`);
        }
    } else {
        // Stop the server if it was enabled
        if (mcpServer) {
            // Show progress indicator
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Stopping RooCode MCP Server',
                cancellable: false
            }, async (progress) => {
                logger.info(`[toggleServerState] Stopping server at ${new Date().toISOString()}`);
                progress.report({ message: 'Closing connections...' });
                
                const stopTime = Date.now();
                if (mcpServer) {
                    await mcpServer.stop();
                }
                
                const duration = Date.now() - stopTime;
                logger.info(`[toggleServerState] Server stopped successfully at ${new Date().toISOString()} (took ${duration}ms)`);
                
                mcpServer = undefined;
            });
            
            vscode.window.showInformationMessage('RooCode MCP Server has been disabled');
        }
    }
    
    logger.info(`[toggleServerState] Toggle operation completed`);
}

export async function activate(context: vscode.ExtensionContext) {
    logger.info('Activating roocode-mcp-server extension');

    // Create output channel for server logs
    outputChannel = vscode.window.createOutputChannel('RooCode MCP Server');
    outputChannel.show();

    try {
        // Get configuration
        const config = vscode.workspace.getConfiguration('roocode-mcp-server');
        const defaultEnabled = config.get<boolean>('defaultEnabled') ?? false;
        const port = config.get<number>('port') || 4000;
        const host = config.get<string>('host') || '0.0.0.0';

        // Load saved state or use configured default
        serverEnabled = context.globalState.get('mcpServerEnabled', defaultEnabled);

        logger.info(`[activate] Using port ${port} from configuration`);
        logger.info(`[activate] Server enabled: ${serverEnabled}`);

        // Log to output channel
        outputChannel.appendLine(`[${new Date().toISOString()}] Activating RooCode MCP Server extension`);
        outputChannel.appendLine(`[${new Date().toISOString()}] Configuration: port=${port}, host=${host}, enabled=${serverEnabled}`);

        // Create status bar item
        statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        statusBarItem.command = 'roocode-mcp-server.toggleServer';
        
        // Only start the server if enabled
        if (serverEnabled) {
            outputChannel.appendLine(`[${new Date().toISOString()}] Starting RooCode MCP Server...`);
            outputChannel.appendLine(`[${new Date().toISOString()}] Port: ${port}, Host: ${host}`);

            // Initialize MCP server with the configured port and tool configuration
            const toolConfig = getToolConfiguration();
            mcpServer = new MCPServer(port, host, toolConfig);

            // Call setupTools
            mcpServer.setupTools();
            outputChannel.appendLine(`[${new Date().toISOString()}] Tools configured, starting server...`);

            await mcpServer.start();
            logger.info('RooCode MCP Server started successfully');
            outputChannel.appendLine(`[${new Date().toISOString()}] ✓ Server started successfully`);
            outputChannel.appendLine(`[${new Date().toISOString()}] ✓ Listening on ${host}:${port}`);
            outputChannel.appendLine(`[${new Date().toISOString()}] ✓ MCP endpoint: http://${host}:${port}/mcp`);
            outputChannel.appendLine(`[${new Date().toISOString()}] ✓ SSE endpoint: http://${host}:${port}/mcp/sse`);
        } else {
            logger.info('RooCode MCP Server is disabled by default');
            outputChannel.appendLine(`[${new Date().toISOString()}] Server disabled by default`);
        }
        
        // Update status bar after server state is determined
        updateStatusBar(port);

        // Register commands
        const toggleServerCommand = vscode.commands.registerCommand(
            'roocode-mcp-server.toggleServer',
            () => toggleServerState(context)
        );

        const showServerInfoCommand = vscode.commands.registerCommand(
            'roocode-mcp-server.showServerInfo',
            () => {
                if (serverEnabled) {
                    vscode.window.showInformationMessage(`RooCode MCP Server is running at http://localhost:${port}/mcp`);
                } else {
                    vscode.window.showInformationMessage('RooCode MCP Server is currently disabled. Click on the status bar item to enable it.');
                }
            }
        );

        // Listen for configuration changes to restart server if needed
        const configChangeListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration('roocode-mcp-server.enabledTools')) {
                logger.info('[configChangeListener] Tool configuration changed - restarting server if enabled');
                if (serverEnabled && mcpServer) {
                    // Stop current server
                    await mcpServer.stop();
                    mcpServer = undefined;
                    
                    // Start new server with updated configuration
                    const config = vscode.workspace.getConfiguration('roocode-mcp-server');
                    const port = config.get<number>('port') || 4000;
                    const host = config.get<string>('host') || '0.0.0.0';
                    const toolConfig = getToolConfiguration();
                    
                    mcpServer = new MCPServer(port, host, toolConfig);
                    mcpServer.setupTools();
                    await mcpServer.start();
                    
                    vscode.window.showInformationMessage('RooCode MCP Server restarted with updated tool configuration');
                }
            }
        });

        // Add all disposables to the context subscriptions
        context.subscriptions.push(
            statusBarItem,
            toggleServerCommand,
            showServerInfoCommand,
            configChangeListener,
            { dispose: async () => mcpServer && await mcpServer.stop() }
        );
    } catch (error) {
        logger.error(`Failed to start RooCode MCP Server: ${error instanceof Error ? error.message : 'Unknown error'}`);
        vscode.window.showErrorMessage(`Failed to start RooCode MCP Server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
        statusBarItem = undefined;
    }

    if (outputChannel) {
        outputChannel.dispose();
        outputChannel = undefined;
    }

    if (!mcpServer) {
        return;
    }

    try {
        logger.info('Stopping RooCode MCP Server during extension deactivation');
        await mcpServer.stop();
        logger.info('RooCode MCP Server stopped successfully');
    } catch (error) {
        logger.error(`Error stopping RooCode MCP Server: ${error instanceof Error ? error.message : String(error)}`);
        throw error; // Re-throw to ensure VS Code knows about the failure
    } finally {
        mcpServer = undefined;
        // Dispose the logger
        logger.dispose();
    }
}