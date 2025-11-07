import express from "express";
import * as vscode from 'vscode';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

/**
 * Event streaming server for RooCode MCP integration
 * Handles real-time event forwarding via Server-Sent Events (SSE)
 */
export class EventStreamingServer {
    private app: express.Application;
    private eventClients: Map<string, Response> = new Map();
    private rooCodeExtension: any = null;

    constructor() {
        this.app = express();
        this.app.use(express.json());
        this.setupEventStreamingRoutes();
        this.initializeRooCodeEventForwarding();
    }

    /**
     * Initialize RooCode extension and set up event forwarding
     */
    private async initializeRooCodeEventForwarding(): Promise<void> {
        try {
            // Get RooCode extension
            this.rooCodeExtension = vscode.extensions.getExtension('RooVeterinaryInc.roo-cline');

            if (!this.rooCodeExtension) {
                logger.warn('[EventStreamingServer] RooCode extension not found');
                return;
            }

            // Activate if needed
            if (!this.rooCodeExtension.isActive) {
                logger.info('[EventStreamingServer] Activating RooCode extension for event forwarding');
                await this.rooCodeExtension.activate();
            }

            // Set up event listeners if RooCode has an EventEmitter
            if (this.rooCodeExtension.exports && this.rooCodeExtension.exports.on) {
                const eventEmitter = this.rooCodeExtension.exports;

                // Common RooCode events to forward
                const eventsToForward = [
                    'taskCreated',
                    'taskStarted',
                    'taskCompleted',
                    'taskCancelled',
                    'messageReceived',
                    'messageSent',
                    'errorOccurred',
                    'statusChanged'
                ];

                eventsToForward.forEach(eventName => {
                    eventEmitter.on(eventName, (data: any) => {
                        this.forwardEventToClients(eventName, data);
                    });
                    logger.info(`[EventStreamingServer] Listening for RooCode event: ${eventName}`);
                });
            } else {
                logger.warn('[EventStreamingServer] RooCode extension does not expose EventEmitter - event streaming disabled');
            }

            logger.info('[EventStreamingServer] RooCode event forwarding initialized');
        } catch (error) {
            logger.error(`[EventStreamingServer] Failed to initialize event forwarding: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Forward events to all connected SSE clients
     */
    private forwardEventToClients(eventName: string, data: any): void {
        const eventData = {
            event: eventName,
            timestamp: new Date().toISOString(),
            data: data
        };

        this.eventClients.forEach((res, clientId) => {
            try {
                res.write(`data: ${JSON.stringify(eventData)}\n\n`);
            } catch (error) {
                logger.warn(`[EventStreamingServer] Failed to send event to client ${clientId}: ${error instanceof Error ? error.message : String(error)}`);
                // Remove broken client
                this.eventClients.delete(clientId);
            }
        });

        logger.debug(`[EventStreamingServer] Forwarded event "${eventName}" to ${this.eventClients.size} clients`);
    }

    /**
     * Set up SSE routes for event streaming
     */
    private setupEventStreamingRoutes(): void {
        // SSE endpoint for real-time events
        this.app.get('/events', (req: Request, res: Response) => {
            const clientId = this.generateClientId();

            // Set SSE headers
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control',
            });

            // Send initial connection event
            res.write(`data: ${JSON.stringify({
                event: 'connected',
                timestamp: new Date().toISOString(),
                clientId: clientId
            })}\n\n`);

            // Store client connection
            this.eventClients.set(clientId, res);

            logger.info(`[EventStreamingServer] New SSE client connected: ${clientId} (${this.eventClients.size} total clients)`);

            // Handle client disconnect
            req.on('close', () => {
                this.eventClients.delete(clientId);
                logger.info(`[EventStreamingServer] SSE client disconnected: ${clientId} (${this.eventClients.size} remaining clients)`);
            });

            // Handle connection errors
            req.on('error', (error) => {
                logger.error(`[EventStreamingServer] SSE connection error for client ${clientId}: ${error.message}`);
                this.eventClients.delete(clientId);
            });
        });

        // Health check endpoint
        this.app.get('/events/health', (req: Request, res: Response) => {
            res.json({
                status: 'healthy',
                connectedClients: this.eventClients.size,
                rooCodeExtensionAvailable: !!this.rooCodeExtension,
                timestamp: new Date().toISOString()
            });
        });

        // CORS preflight for SSE
        this.app.options('/events', (req: Request, res: Response) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
            res.status(204).end();
        });
    }

    /**
     * Generate unique client ID for SSE connections
     */
    private generateClientId(): string {
        return `sse-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get the Express app instance for integration with main server
     */
    public getApp(): express.Application {
        return this.app;
    }

    /**
     * Get current connection statistics
     */
    public getStats() {
        return {
            connectedClients: this.eventClients.size,
            rooCodeExtensionActive: this.rooCodeExtension?.isActive || false,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Manually trigger a test event (for debugging)
     */
    public sendTestEvent(eventName: string, data: any): void {
        logger.info(`[EventStreamingServer] Sending test event: ${eventName}`);
        this.forwardEventToClients(eventName, data);
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        logger.info('[EventStreamingServer] Disposing event streaming server');

        // Close all client connections
        this.eventClients.forEach((res, clientId) => {
            try {
                res.end();
            } catch (error) {
                logger.warn(`[EventStreamingServer] Error closing connection for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        this.eventClients.clear();
        logger.info('[EventStreamingServer] Event streaming server disposed');
    }
}