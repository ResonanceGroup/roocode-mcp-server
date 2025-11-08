import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Server } from 'http';
import { logger } from './utils/logger';
import { registerTaskManagementTools } from './tools/task-management-tools';
import { registerConfigurationTools } from './tools/configuration-tools';
import { registerProfileManagementTools } from './tools/profile-management-tools';

export interface ToolConfiguration {
    roocode: boolean;
}

export class MCPServer {
    private server: McpServer;
    private app: express.Application;
    private httpServer?: Server;
    private port: number;
    private host: string;
    private toolConfig: ToolConfiguration;

    constructor(port: number = 4000, host: string = '0.0.0.0', toolConfig?: ToolConfiguration) {
        this.port = port;
        this.host = host;
        this.toolConfig = toolConfig || {
            roocode: true
        };
        this.app = express();
        
        // Use express.json() as per official SDK examples
        this.app.use(express.json());

        // Initialize MCP Server (reused across requests)
        this.server = new McpServer({
            name: "roocode-mcp-server",
            version: "1.0.0",
        }, {
            capabilities: {
                logging: {},
                tools: {
                    listChanged: false
                }
            }
        });

        this.setupRoutes();
        // Note: setupEventHandlers() is called in start() after httpServer is created
    }

    public setupTools(): void {
        logger.info(`Setting up RooCode MCP tools with configuration: ${JSON.stringify(this.toolConfig)}`);

        // Register RooCode tools if enabled
        if (this.toolConfig.roocode) {
            registerTaskManagementTools(this.server);
            registerConfigurationTools(this.server);
            registerProfileManagementTools(this.server);
            logger.info('RooCode MCP tools registered successfully');
        } else {
            logger.info('RooCode MCP tools disabled by configuration');
        }
    }

    private setupRoutes(): void {
        // Handle all MCP requests - following official SDK pattern
        this.app.post('/mcp', async (req, res) => {
            logger.info(`MCP POST request received`);
            
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            try {
                // Create a new transport for each request (stateless pattern from SDK examples)
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined,  // undefined for stateless operation
                    enableJsonResponse: true  // CRITICAL: Required for proper MCP protocol handling
                });
                
                // Clean up transport on response end
                res.on('close', () => {
                    transport.close();
                });
                
                // Connect the transport to the server
                await this.server.connect(transport);
                
                // Let the transport handle the request - pass req.body as third parameter
                await transport.handleRequest(req, res, req.body);
                
            } catch (error) {
                logger.error(`Error handling MCP request: ${error instanceof Error ? error.message : String(error)}`);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32603,
                            message: 'Internal server error',
                        },
                        id: null,
                    });
                }
            }
        });
        
        // Handle OPTIONS preflight requests
        this.app.options('/mcp', (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.status(204).end();
        });
    }

    private setupEventHandlers(): void {
        // Log HTTP server events
        if (this.httpServer) {
            this.httpServer.on('error', (error: Error) => {
                logger.error(`[Server] HTTP Server Error: ${error.message}`);
            });

            this.httpServer.on('listening', () => {
                logger.info(`[Server] HTTP Server ready`);
            });

            this.httpServer.on('close', () => {
                logger.info(`[Server] HTTP Server closed`);
            });
        }
    }

    public async start(): Promise<void> {
        try {
            logger.info('[MCPServer.start] Starting MCP server');
            const startTime = Date.now();

            // No need to connect transport at startup - transports are created per request
            logger.info('[MCPServer.start] Server ready for requests');

            // Start HTTP server
            logger.info('[MCPServer.start] Starting HTTP server');
            const httpServerStartTime = Date.now();
            
            return new Promise((resolve) => {
                // Bind to specified host
                this.httpServer = this.app.listen(this.port, this.host, () => {
                    const httpStartTime = Date.now() - httpServerStartTime;
                    logger.info(`[MCPServer.start] HTTP Server started (took ${httpStartTime}ms)`);
                    logger.info(`MCP Server listening on ${this.host}:${this.port}`);
                    
                    // Setup event handlers after server is created
                    this.setupEventHandlers();
                    
                    const totalTime = Date.now() - startTime;
                    logger.info(`[MCPServer.start] Server startup complete (total: ${totalTime}ms)`);
                    
                    resolve();
                });
            });
        } catch (error) {
            logger.error(`[MCPServer.start] Failed to start MCP Server: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    public async stop(forceTimeout: number = 5000): Promise<void> {
        logger.info('[MCPServer.stop] Starting server shutdown process');
        const stopStartTime = Date.now();
        
        try {
            // Close HTTP server with timeout
            if (this.httpServer) {
                logger.info('[MCPServer.stop] Closing HTTP server (with timeout)');
                const httpServerCloseStart = Date.now();
                
                await Promise.race([
                    // Normal close operation
                    new Promise<void>((resolve, reject) => {
                        this.httpServer!.close((err) => {
                            const httpCloseTime = Date.now() - httpServerCloseStart;
                            if (err) {
                                logger.error(`[MCPServer.stop] HTTP server closed with error: ${err.message} (took ${httpCloseTime}ms)`);
                                reject(err);
                            } else {
                                logger.info(`[MCPServer.stop] HTTP server closed successfully (took ${httpCloseTime}ms)`);
                                resolve();
                            }
                        });
                    }),
                    
                    // Timeout fallback
                    new Promise<void>((resolve) => {
                        setTimeout(() => {
                            logger.warn(`[MCPServer.stop] HTTP server close timed out after ${forceTimeout}ms - forcing close`);
                            // We resolve anyway to continue with the shutdown process
                            resolve();
                        }, forceTimeout);
                    })
                ]);
            }

            // Close MCP server (transports are auto-cleaned per-request with 'close' event)
            logger.info('[MCPServer.stop] Closing MCP server');
            const serverCloseStart = Date.now();
            await this.server.close();
            const serverCloseTime = Date.now() - serverCloseStart;
            logger.info(`[MCPServer.stop] MCP server closed (took ${serverCloseTime}ms)`);
            
            const totalStopTime = Date.now() - stopStartTime;
            logger.info(`[MCPServer.stop] MCP Server shutdown complete (total: ${totalStopTime}ms)`);
        } catch (error) {
            logger.error(`[MCPServer.stop] Error during server shutdown: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}