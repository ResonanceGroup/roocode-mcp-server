import express from "express";
import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Server } from 'http';
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
    private eventStreamingServer: EventStreamingServer;
    private transports: Map<string, StreamableHTTPServerTransport>;
    private sessionIdGenerator: () => string;

    constructor(port: number = 4000, host: string = '0.0.0.0', toolConfig?: ToolConfiguration) {
        this.port = port;
        this.host = host;
        this.toolConfig = toolConfig || {
            roocode: true
        };
        this.app = express();
        
        // Don't use express.json() - let StreamableHTTPServerTransport handle body parsing
        // The transport needs access to the raw request stream
        this.app.use(express.raw({ type: 'application/json', limit: '10mb' }));

        // Initialize event streaming server
        this.eventStreamingServer = new EventStreamingServer();

        // Initialize MCP Server
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

        // Initialize session management
        this.transports = new Map<string, StreamableHTTPServerTransport>();
        this.sessionIdGenerator = () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.setupRoutes();
        this.setupEventHandlers();
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
        // Handle all MCP requests (POST for RPC, GET for SSE)
        this.app.all('/mcp', async (req, res) => {
            logger.info(`MCP Request received: ${req.method} ${req.url}`);
            
            // Handle CORS preflight
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-session-id');
                res.status(204).end();
                return;
            }

            try {
                // Get session ID from header (for existing sessions) or generate new one
                let sessionId = req.headers['x-session-id'] as string;
                
                // For POST requests, check if this is an initialize
                if (req.method === 'POST') {
                    const isInitialize = req.body &&
                        typeof req.body === 'object' &&
                        req.body.method === 'initialize';
                    
                    if (isInitialize) {
                        // Generate new session ID for initialize
                        sessionId = this.sessionIdGenerator();
                        logger.info(`Initialize request received - creating new session: ${sessionId}`);
                        
                        // Create new transport for this session
                        const transport = new StreamableHTTPServerTransport({
                            sessionIdGenerator: () => sessionId
                        });
                        
                        // Set up session cleanup
                        const originalClose = transport.close.bind(transport);
                        transport.close = async () => {
                            logger.info(`Session closed: ${sessionId}`);
                            this.transports.delete(sessionId);
                            return originalClose();
                        };
                        
                        // Connect the transport to the MCP server
                        await this.server.connect(transport);
                        this.transports.set(sessionId, transport);
                        
                        // Set session ID header for client
                        res.setHeader('x-session-id', sessionId);
                        
                        // Handle the initialize request - parse body if it's a Buffer
                        logger.info(`Processing initialize request for session: ${sessionId}`);
                        const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
                        await transport.handleRequest(req, res, body);
                        return;
                    }
                    
                    // For non-initialize POST, require session ID
                    if (!sessionId || !this.transports.has(sessionId)) {
                        logger.warn(`POST request without valid session ID: ${sessionId}`);
                        res.status(400).json({
                            jsonrpc: '2.0',
                            error: {
                                code: -32000,
                                message: 'Invalid session - must initialize first'
                            },
                            id: req.body?.id ?? null
                        });
                        return;
                    }
                    
                    // Handle regular RPC request
                    const transport = this.transports.get(sessionId)!;
                    res.setHeader('x-session-id', sessionId);
                    logger.info(`Handling RPC request for session: ${sessionId}`);
                    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
                    await transport.handleRequest(req, res, body);
                    return;
                }
                
                // For GET (SSE), require valid session
                if (req.method === 'GET') {
                    if (!sessionId || !this.transports.has(sessionId)) {
                        logger.warn(`SSE request without valid session ID: ${sessionId}`);
                        res.status(400).json({
                            jsonrpc: '2.0',
                            error: {
                                code: -32000,
                                message: 'Invalid session - must initialize first'
                            },
                            id: null
                        });
                        return;
                    }
                    
                    // Handle SSE request
                    const transport = this.transports.get(sessionId)!;
                    res.setHeader('x-session-id', sessionId);
                    logger.info(`Handling SSE request for session: ${sessionId}`);
                    await transport.handleRequest(req, res, undefined);
                    return;
                }
                
                // Unsupported method
                res.status(405).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Method not allowed'
                    },
                    id: null
                });
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

            // No need to connect transport at startup - transports are created per session
            logger.info('[MCPServer.start] Server ready for sessions');

            // Start HTTP server
            logger.info('[MCPServer.start] Starting HTTP server');
            const httpServerStartTime = Date.now();
            
            return new Promise((resolve) => {
                // Bind to localhost only for security
                this.httpServer = this.app.listen(this.port, this.host, () => {
                    const httpStartTime = Date.now() - httpServerStartTime;
                    logger.info(`[MCPServer.start] HTTP Server started (took ${httpStartTime}ms)`);
                    logger.info(`MCP Server listening on ${this.host}:${this.port}`);
                    
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

            // Rest of the shutdown process...
            logger.info('[MCPServer.stop] Closing transport');
            const transportCloseStart = Date.now();
            // Close all transports
            for (const [sessionId, transport] of this.transports) {
                try {
                    await transport.close();
                    logger.info(`[MCPServer.stop] Transport closed for session ${sessionId}`);
                } catch (error) {
                    logger.error(`[MCPServer.stop] Error closing transport for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            this.transports.clear();
            const transportCloseTime = Date.now() - transportCloseStart;
            logger.info(`[MCPServer.stop] Transport closed (took ${transportCloseTime}ms)`);
            
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