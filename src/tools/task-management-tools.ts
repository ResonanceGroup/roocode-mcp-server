import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logger } from '../utils/logger';

/**
 * RooCode API interface based on official documentation
 */
interface RooCodeAPI {
    startNewTask(initialMessage: string, images?: string[]): Promise<void>;
    sendMessage(message: string): Promise<void>;
    pressPrimaryButton(): Promise<void>;
    pressSecondaryButton(): Promise<void>;
}

/**
 * RooCode API wrapper for task management operations
 */
export class RooCodeTaskAPI {
    private extension: vscode.Extension<RooCodeAPI> | undefined;

    constructor() {
        this.extension = undefined;
    }

    /**
     * Initialize connection to RooCode extension
     */
    public async initialize(): Promise<boolean> {
        try {
            logger.info('[RooCodeTaskAPI] Attempting to discover RooCode extension...');

            // Try to get the RooCode extension
            this.extension = vscode.extensions.getExtension<RooCodeAPI>('RooVeterinaryInc.roo-cline');

            if (!this.extension) {
                logger.warn('[RooCodeTaskAPI] RooCode extension not found - please ensure RooCode is installed');
                return false;
            }

            // If extension is not activated, activate it
            if (!this.extension.isActive) {
                logger.info('[RooCodeTaskAPI] Activating RooCode extension...');
                await this.extension.activate();
            }

            // Verify API is available
            if (!this.extension.exports) {
                logger.error('[RooCodeTaskAPI] RooCode extension exports not available');
                return false;
            }

            logger.info('[RooCodeTaskAPI] RooCode extension initialized successfully');
            return true;
        } catch (error) {
            logger.error(`[RooCodeTaskAPI] Failed to initialize RooCode extension: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Check if RooCode is ready for commands
     */
    public async isReady(): Promise<boolean> {
        if (!this.extension || !this.extension.isActive || !this.extension.exports) {
            return false;
        }

        try {
            // Check if all required API methods are available
            const api = this.extension.exports;
            return (
                typeof api.startNewTask === 'function' &&
                typeof api.sendMessage === 'function' &&
                typeof api.pressPrimaryButton === 'function' &&
                typeof api.pressSecondaryButton === 'function'
            );
        } catch (error) {
            logger.error(`[RooCodeTaskAPI] Error checking API readiness: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Start a new RooCode task
     */
    public async startNewTask(initialMessage: string, images?: string[]): Promise<void> {
        if (!this.extension || !this.extension.isActive || !this.extension.exports) {
            throw new Error('RooCode extension not available - please ensure it is installed and activated');
        }

        try {
            logger.info(`[RooCodeTaskAPI] Starting new task with message: "${initialMessage.substring(0, 50)}..."`);
            await this.extension.exports.startNewTask(initialMessage, images);
            logger.info('[RooCodeTaskAPI] Task started successfully');
        } catch (error) {
            logger.error(`[RooCodeTaskAPI] Error starting task: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Send message to active RooCode task
     */
    public async sendMessage(message: string): Promise<void> {
        if (!this.extension || !this.extension.isActive || !this.extension.exports) {
            throw new Error('RooCode extension not available - please ensure it is installed and activated');
        }

        try {
            logger.info(`[RooCodeTaskAPI] Sending message: "${message.substring(0, 50)}..."`);
            await this.extension.exports.sendMessage(message);
            logger.info('[RooCodeTaskAPI] Message sent successfully');
        } catch (error) {
            logger.error(`[RooCodeTaskAPI] Error sending message: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Press primary button (approve action)
     */
    public async pressPrimaryButton(): Promise<void> {
        if (!this.extension || !this.extension.isActive || !this.extension.exports) {
            throw new Error('RooCode extension not available - please ensure it is installed and activated');
        }

        try {
            logger.info('[RooCodeTaskAPI] Pressing primary button');
            await this.extension.exports.pressPrimaryButton();
            logger.info('[RooCodeTaskAPI] Primary button pressed successfully');
        } catch (error) {
            logger.error(`[RooCodeTaskAPI] Error pressing primary button: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Press secondary button (deny action)
     */
    public async pressSecondaryButton(): Promise<void> {
        if (!this.extension || !this.extension.isActive || !this.extension.exports) {
            throw new Error('RooCode extension not available - please ensure it is installed and activated');
        }

        try {
            logger.info('[RooCodeTaskAPI] Pressing secondary button');
            await this.extension.exports.pressSecondaryButton();
            logger.info('[RooCodeTaskAPI] Secondary button pressed successfully');
        } catch (error) {
            logger.error(`[RooCodeTaskAPI] Error pressing secondary button: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get extension status information
     */
    public getExtensionStatus(): { found: boolean; active: boolean; apiAvailable: boolean } {
        return {
            found: !!this.extension,
            active: this.extension?.isActive || false,
            apiAvailable: !!this.extension?.exports
        };
    }
}

// Global RooCode API instance
const rooCodeTaskAPI = new RooCodeTaskAPI();

/**
 * Registers RooCode task management MCP tools with the server
 */
export function registerTaskManagementTools(server: McpServer): void {
    // Initialize RooCode tool
    server.tool(
        'roocode_initialize',
        `Initialize connection to RooCode extension.

        Call this tool first to ensure RooCode is available and ready.`,
        {},
        async (): Promise<CallToolResult> => {
            try {
                const initialized = await rooCodeTaskAPI.initialize();
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: initialized
                                ? 'RooCode extension initialized successfully'
                                : 'Failed to initialize RooCode extension - please ensure RooCode is installed and enabled'
                        }
                    ]
                };
                return result;
            } catch (error) {
                throw error;
            }
        }
    );

    // Check readiness tool
    server.tool(
        'roocode_check_status',
        `Check if RooCode is ready to receive commands.

        Use this to verify RooCode is available before sending other commands.`,
        {},
        async (): Promise<CallToolResult> => {
            try {
                const ready = await rooCodeTaskAPI.isReady();
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: ready
                                ? 'RooCode is ready to receive commands'
                                : 'RooCode is not ready - please wait or check if extension is installed'
                        }
                    ]
                };
                return result;
            } catch (error) {
                throw error;
            }
        }
    );

    // Start task tool
    server.tool(
        'roocode_start_task',
        `Start a new RooCode coding task.

        Use this to begin a new coding task with RooCode. Provide a clear description of what you want to accomplish.

        Parameters:
        - text: Clear description of the task
        - images: Optional array of image URLs for context`,
        {
            text: z.string().describe('Task description'),
            images: z.array(z.string()).optional().describe('Optional array of image URLs for context')
        },
        async ({ text, images }): Promise<CallToolResult> => {
            try {
                await rooCodeTaskAPI.startNewTask(text, images);

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: 'Task started successfully'
                        }
                    ]
                };
                return toolResult;
            } catch (error) {
                throw error;
            }
        }
    );

    // Send message tool
    server.tool(
        'roocode_send_message',
        `Send a message to the active RooCode task.

        Use this to provide additional context, ask questions, or give instructions to an ongoing task.

        Parameters:
        - message: The message content`,
        {
            message: z.string().describe('Message content')
        },
        async ({ message }): Promise<CallToolResult> => {
            try {
                await rooCodeTaskAPI.sendMessage(message);

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: 'Message sent successfully'
                        }
                    ]
                };
                return toolResult;
            } catch (error) {
                throw error;
            }
        }
    );

    // Approve action tool
    server.tool(
        'roocode_approve_action',
        `Approve a RooCode interaction prompt.

        Use this when RooCode asks for confirmation and you want to approve the action.`,
        {},
        async (): Promise<CallToolResult> => {
            try {
                await rooCodeTaskAPI.pressPrimaryButton();

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: 'Action approved successfully'
                        }
                    ]
                };
                return toolResult;
            } catch (error) {
                throw error;
            }
        }
    );

    // Deny action tool
    server.tool(
        'roocode_deny_action',
        `Deny a RooCode interaction prompt.

        Use this when RooCode asks for confirmation and you want to deny the action.`,
        {},
        async (): Promise<CallToolResult> => {
            try {
                await rooCodeTaskAPI.pressSecondaryButton();

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: 'Action denied successfully'
                        }
                    ]
                };
                return toolResult;
            } catch (error) {
                throw error;
            }
        }
    );
}