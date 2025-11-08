import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logger } from '../utils/logger';

/**
 * RooCode API wrapper for configuration operations
 */
export class RooCodeConfigAPI {
    private extension: any;

    constructor() {
        this.extension = null;
    }

    /**
     * Initialize connection to RooCode extension
     */
    public async initialize(): Promise<boolean> {
        try {
            this.extension = vscode.extensions.getExtension('rooveterinaryinc.roo-cline');

            if (!this.extension) {
                logger.warn('[RooCodeConfigAPI] RooCode extension not found');
                return false;
            }

            if (!this.extension.isActive) {
                logger.info('[RooCodeConfigAPI] Activating RooCode extension');
                await this.extension.activate();
            }

            logger.info('[RooCodeConfigAPI] RooCode extension initialized successfully');
            return true;
        } catch (error) {
            logger.error(`[RooCodeConfigAPI] Failed to initialize RooCode extension: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Get current configuration
     */
    public async getConfiguration(): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.getConfiguration === 'function') {
                return await this.extension.exports.getConfiguration();
            }
            throw new Error('RooCode getConfiguration function not available');
        } catch (error) {
            logger.error(`[RooCodeConfigAPI] Error getting configuration: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Set configuration
     */
    public async setConfiguration(config: any): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.setConfiguration === 'function') {
                return await this.extension.exports.setConfiguration(config);
            }
            throw new Error('RooCode setConfiguration function not available');
        } catch (error) {
            logger.error(`[RooCodeConfigAPI] Error setting configuration: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}

// Global RooCode Config API instance
const rooCodeConfigAPI = new RooCodeConfigAPI();

/**
 * Registers RooCode configuration MCP tools with the server
 */
export function registerConfigurationTools(server: McpServer): void {
    // Get configuration tool
    server.tool(
        'roocode_get_configuration',
        `Retrieve current RooCode extension configuration.

        Returns the complete configuration object including all settings.`,
        {},
        async (): Promise<CallToolResult> => {
            try {
                const config = await rooCodeConfigAPI.getConfiguration();
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(config, null, 2)
                        }
                    ]
                };
                return result;
            } catch (error) {
                throw error;
            }
        }
    );

    // Set configuration tool
    server.tool(
        'roocode_set_configuration',
        `Update RooCode extension configuration.

        Provide a partial or complete configuration object to update settings.

        Parameters:
        - config: Configuration object with settings to update`,
        {
            config: z.record(z.any()).describe('Configuration object to set')
        },
        async ({ config }): Promise<CallToolResult> => {
            try {
                const result = await rooCodeConfigAPI.setConfiguration(config);
                const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Configuration updated successfully:\n${resultText}`
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
