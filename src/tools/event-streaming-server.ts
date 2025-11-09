import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger';

interface TaskState {
    taskId: string;
    status: string;  // 'active', 'interactive', 'idle', 'completed', 'aborted', etc.
    lastUpdate: string;  // ISO timestamp
    messages: Array<{
        timestamp: string;
        content: any;
    }>;
}

/**
 * Event streaming server for RooCode MCP integration
 * Forwards RooCode events as MCP-native notifications and caches task state for polling
 */
export class EventStreamingServer {
    private mcpServer: McpServer;
    private rooCodeExtension: any = null;
    private taskStateCache: Map<string, TaskState> = new Map();
    private readonly MAX_MESSAGES_PER_TASK = 50;

    constructor(mcpServer: McpServer) {
        this.mcpServer = mcpServer;
        this.initializeRooCodeEventForwarding();
    }

    /**
     * Initialize RooCode extension and set up event forwarding
     */
    private async initializeRooCodeEventForwarding(): Promise<void> {
        try {
            // Get RooCode extension
            this.rooCodeExtension = vscode.extensions.getExtension('rooveterinaryinc.roo-cline');

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

                // RooCode events to forward (from @roo-code/types RooCodeEventName enum)
                // Using actual event names from RooCode's EventEmitter API
                const eventsToForward = [
                    // Task Lifecycle (CRITICAL for voice control)
                    'taskCreated',      // When new task is created
                    'taskStarted',      // When task execution begins
                    'taskCompleted',    // When task finishes (includes token/tool usage)
                    'taskAborted',      // When task is cancelled
                    
                    // Task State (CRITICAL for knowing when to interact)
                    'taskInteractive',  // When waiting for user approval/input ⭐
                    'taskActive',       // Task is actively running
                    'taskIdle',         // Task is idle
                    'taskResumable',    // Task can be resumed
                    
                    // Task Focus
                    'taskFocused',      // Task becomes focused
                    'taskUnfocused',    // Task loses focus
                    
                    // Task Updates
                    'message',          // Real-time task message updates
                    'taskModeSwitched', // When task switches modes
                    
                    // Task Analytics
                    'taskTokenUsageUpdated', // Token usage updates
                    'taskToolFailed',        // When a tool fails
                ];

                eventsToForward.forEach(eventName => {
                    eventEmitter.on(eventName, (...args: any[]) => {
                        this.forwardEventToClients(eventName, args);
                        this.updateTaskStateCache(eventName, args);
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
     * Forward events to MCP clients via MCP-native notifications
     */
    private async forwardEventToClients(eventName: string, data: any): Promise<void> {
        const eventData = {
            event: eventName,
            timestamp: new Date().toISOString(),
            data: data
        };

        try {
            // Send as MCP logging notification
            await this.mcpServer.sendLoggingMessage({
                level: 'info',
                data: eventData
            });
            
            logger.debug(`[EventStreamingServer] Sent MCP notification for event: ${eventName}`);
        } catch (error) {
            logger.warn(`[EventStreamingServer] Failed to send MCP notification for event "${eventName}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Update task state cache based on events
     */
    private updateTaskStateCache(eventName: string, data: any): void {
        try {
            // Extract taskId from event data (usually first argument)
            const taskId = data[0]?.taskId || data[0];
            
            if (!taskId) {
                return; // No taskId, can't track
            }

            // Get or create task state
            let taskState = this.taskStateCache.get(taskId);
            if (!taskState) {
                taskState = {
                    taskId,
                    status: 'unknown',
                    lastUpdate: new Date().toISOString(),
                    messages: []
                };
                this.taskStateCache.set(taskId, taskState);
            }

            // Update status based on event type
            taskState.lastUpdate = new Date().toISOString();
            
            switch (eventName) {
                case 'taskCreated':
                    taskState.status = 'created';
                    break;
                case 'taskStarted':
                    taskState.status = 'started';
                    break;
                case 'taskActive':
                    taskState.status = 'active';
                    break;
                case 'taskInteractive':
                    taskState.status = 'interactive';  // Waiting for user input
                    break;
                case 'taskIdle':
                    taskState.status = 'idle';
                    break;
                case 'taskCompleted':
                    taskState.status = 'completed';
                    // Clean up after delay to allow final polls
                    setTimeout(() => this.taskStateCache.delete(taskId), 30000);
                    break;
                case 'taskAborted':
                    taskState.status = 'aborted';
                    setTimeout(() => this.taskStateCache.delete(taskId), 30000);
                    break;
                case 'taskResumable':
                    taskState.status = 'resumable';
                    break;
                case 'message':
                    // Add message to history
                    taskState.messages.push({
                        timestamp: new Date().toISOString(),
                        content: data[1] || data[0]  // Message is usually second argument
                    });
                    // Trim to max messages
                    if (taskState.messages.length > this.MAX_MESSAGES_PER_TASK) {
                        taskState.messages = taskState.messages.slice(-this.MAX_MESSAGES_PER_TASK);
                    }
                    break;
            }

            logger.debug(`[EventStreamingServer] Updated task state: ${taskId} -> ${taskState.status}`);
        } catch (error) {
            logger.warn(`[EventStreamingServer] Failed to update task state cache: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get task state from cache (for polling)
     */
    public getTaskState(taskId?: string): TaskState | Map<string, TaskState> | null {
        if (taskId) {
            return this.taskStateCache.get(taskId) || null;
        }
        // Return all tasks if no taskId specified
        return this.taskStateCache;
    }

    /**
     * Get current connection statistics
     */
    public getStats() {
        return {
            rooCodeExtensionActive: this.rooCodeExtension?.isActive || false,
            cachedTasks: this.taskStateCache.size,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Manually trigger a test event (for debugging)
     */
    public async sendTestEvent(eventName: string, data: any): Promise<void> {
        logger.info(`[EventStreamingServer] Sending test event: ${eventName}`);
        await this.forwardEventToClients(eventName, data);
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        logger.info('[EventStreamingServer] Disposing event streaming server');
        // No cleanup needed for MCP-native notifications
        // Transport cleanup is handled by server.ts
        logger.info('[EventStreamingServer] Event streaming server disposed');
    }
}
