import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Server } from 'http';
import { randomUUID } from 'node:crypto';
import { logger } from './utils/logger';
import { registerTaskManagementTools } from './tools/task-management-tools';
import { registerConfigurationTools } from './tools/configuration-tools';
import { registerProfileManagementTools } from './tools/profile-management-tools';
import { EventStreamingServer } from './tools/event-streaming-server';

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
    private eventStreamingServer?: EventStreamingServer;
    private transports: Map<string, StreamableHTTPServerTransport> = new Map();

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
        this.setupEventStreaming();
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
        // POST endpoint for client requests (initialization and tool calls)
        this.app.post('/mcp', async (req, res) => {
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            logger.info(`MCP POST request received${sessionId ? ` (session: ${sessionId})` : ' (new session)'}`);
            
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Session-Id');
            
            try {
                let transport: StreamableHTTPServerTransport;
                
                if (sessionId && this.transports.has(sessionId)) {
                    // Reuse existing transport for this session
                    transport = this.transports.get(sessionId)!;
                    logger.info(`[POST /mcp] Reusing existing transport for session: ${sessionId}`);
                } else if (!sessionId) {
                    // New initialization request - create transport with session management
                    transport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                        onsessioninitialized: (sid) => {
                            this.transports.set(sid, transport);
                            logger.info(`[POST /mcp] New session initialized: ${sid}`);
                        },
                        enableJsonResponse: true  // Required for MCP protocol compliance
                    });
                    
                    // Clean up transport on close
                    transport.onclose = () => {
                        if (transport.sessionId && this.transports.has(transport.sessionId)) {
                            this.transports.delete(transport.sessionId);
                            logger.info(`[POST /mcp] Transport closed and removed: ${transport.sessionId}`);
                        }
                    };
                    
                    // Connect the transport to the server
                    await this.server.connect(transport);
                    logger.info(`[POST /mcp] New transport connected`);
                } else {
                    // Session ID provided but not found - return error
                    logger.warn(`[POST /mcp] Session not found: ${sessionId}`);
                    res.status(400).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32000,
                            message: 'Invalid or expired session ID'
                        },
                        id: null
                    });
                    return;
                }
                
                // Handle the request
                await transport.handleRequest(req, res, req.body);
                
            } catch (error) {
                logger.error(`[POST /mcp] Error handling request: ${error instanceof Error ? error.message : String(error)}`);
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
        
        // GET endpoint for SSE streams (notifications)
        this.app.get('/mcp', async (req, res) => {
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            logger.info(`MCP GET request received for SSE${sessionId ? ` (session: ${sessionId})` : ''}`);
            
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Session-Id');
            
            if (!sessionId || !this.transports.has(sessionId)) {
                logger.warn(`[GET /mcp] Invalid or missing session ID: ${sessionId}`);
                res.status(400).send('Invalid or missing session ID');
                return;
            }
            
            try {
                const transport = this.transports.get(sessionId)!;
                logger.info(`[GET /mcp] Starting SSE stream for session: ${sessionId}`);
                await transport.handleRequest(req, res);
            } catch (error) {
                logger.error(`[GET /mcp] Error handling SSE request: ${error instanceof Error ? error.message : String(error)}`);
                if (!res.headersSent) {
                    res.status(500).send('Internal server error');
                }
            }
        });
        
        // Handle OPTIONS preflight requests
        this.app.options('/mcp', (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Session-Id');
            res.status(204).end();
        });
    }

    private setupEventStreaming(): void {
        logger.info('[MCPServer] Initializing MCP-native event streaming');
        try {
            this.eventStreamingServer = new EventStreamingServer(this.server);
            logger.info('[MCPServer] MCP-native event streaming initialized successfully');
        } catch (error) {
            logger.error(`[MCPServer] Failed to initialize event streaming: ${error instanceof Error ? error.message : String(error)}`);
        }
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

            // Close all active transports
            if (this.transports.size > 0) {
                logger.info(`[MCPServer.stop] Closing ${this.transports.size} active transports`);
                for (const [sessionId, transport] of this.transports.entries()) {
                    try {
                        transport.close();
                        logger.debug(`[MCPServer.stop] Closed transport for session: ${sessionId}`);
                    } catch (error) {
                        logger.warn(`[MCPServer.stop] Error closing transport ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                this.transports.clear();
            }
            
            // Dispose event streaming server
            if (this.eventStreamingServer) {
                logger.info('[MCPServer.stop] Disposing event streaming server');
                this.eventStreamingServer.dispose();
            }
            
            // Close MCP server
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