import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logger } from '../utils/logger';

/**
 * RooCode API wrapper for profile management operations
 */
export class RooCodeProfileAPI {
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
                logger.warn('[RooCodeProfileAPI] RooCode extension not found');
                return false;
            }

            if (!this.extension.isActive) {
                logger.info('[RooCodeProfileAPI] Activating RooCode extension');
                await this.extension.activate();
            }

            logger.info('[RooCodeProfileAPI] RooCode extension initialized successfully');
            return true;
        } catch (error) {
            logger.error(`[RooCodeProfileAPI] Failed to initialize RooCode extension: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Get all profiles
     */
    public async getProfiles(): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.getProfiles === 'function') {
                return await this.extension.exports.getProfiles();
            }
            throw new Error('RooCode getProfiles function not available');
        } catch (error) {
            logger.error(`[RooCodeProfileAPI] Error getting profiles: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get specific profile entry
     */
    public async getProfileEntry(profileId: string): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.getProfileEntry === 'function') {
                return await this.extension.exports.getProfileEntry(profileId);
            }
            throw new Error('RooCode getProfileEntry function not available');
        } catch (error) {
            logger.error(`[RooCodeProfileAPI] Error getting profile entry: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Create new profile
     */
    public async createProfile(profile: any): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.createProfile === 'function') {
                return await this.extension.exports.createProfile(profile);
            }
            throw new Error('RooCode createProfile function not available');
        } catch (error) {
            logger.error(`[RooCodeProfileAPI] Error creating profile: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Update existing profile
     */
    public async updateProfile(profileId: string, profile: any): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.updateProfile === 'function') {
                return await this.extension.exports.updateProfile(profileId, profile);
            }
            throw new Error('RooCode updateProfile function not available');
        } catch (error) {
            logger.error(`[RooCodeProfileAPI] Error updating profile: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Upsert profile (create or update)
     */
    public async upsertProfile(profile: any): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.upsertProfile === 'function') {
                return await this.extension.exports.upsertProfile(profile);
            }
            throw new Error('RooCode upsertProfile function not available');
        } catch (error) {
            logger.error(`[RooCodeProfileAPI] Error upserting profile: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Delete profile
     */
    public async deleteProfile(profileId: string): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.deleteProfile === 'function') {
                return await this.extension.exports.deleteProfile(profileId);
            }
            throw new Error('RooCode deleteProfile function not available');
        } catch (error) {
            logger.error(`[RooCodeProfileAPI] Error deleting profile: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get active profile
     */
    public async getActiveProfile(): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.getActiveProfile === 'function') {
                return await this.extension.exports.getActiveProfile();
            }
            throw new Error('RooCode getActiveProfile function not available');
        } catch (error) {
            logger.error(`[RooCodeProfileAPI] Error getting active profile: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Set active profile
     */
    public async setActiveProfile(profileId: string): Promise<any> {
        if (!this.extension || !this.extension.isActive) {
            throw new Error('RooCode extension not available');
        }

        try {
            if (this.extension.exports && typeof this.extension.exports.setActiveProfile === 'function') {
                return await this.extension.exports.setActiveProfile(profileId);
            }
            throw new Error('RooCode setActiveProfile function not available');
        } catch (error) {
            logger.error(`[RooCodeProfileAPI] Error setting active profile: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}

// Global RooCode Profile API instance
const rooCodeProfileAPI = new RooCodeProfileAPI();

/**
 * Registers RooCode profile management MCP tools with the server
 */
export function registerProfileManagementTools(server: McpServer): void {
    // Get profiles tool
    server.tool(
        'roocode_get_profiles',
        `Retrieve all configured RooCode API provider profiles.

        Returns a list of all available profiles with their configurations.`,
        {},
        async (): Promise<CallToolResult> => {
            try {
                const profiles = await rooCodeProfileAPI.getProfiles();
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(profiles, null, 2)
                        }
                    ]
                };
                return result;
            } catch (error) {
                throw error;
            }
        }
    );

    // Get specific profile tool
    server.tool(
        'roocode_get_profile_entry',
        `Retrieve details for a specific RooCode profile.

        Parameters:
        - profileId: The ID of the profile to retrieve`,
        {
            profileId: z.string().describe('Profile ID to retrieve')
        },
        async ({ profileId }): Promise<CallToolResult> => {
            try {
                const profile = await rooCodeProfileAPI.getProfileEntry(profileId);
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(profile, null, 2)
                        }
                    ]
                };
                return result;
            } catch (error) {
                throw error;
            }
        }
    );

    // Create profile tool
    server.tool(
        'roocode_create_profile',
        `Create a new RooCode API provider profile.

        Parameters:
        - profile: Profile configuration object`,
        {
            profile: z.record(z.any()).describe('Profile configuration object')
        },
        async ({ profile }): Promise<CallToolResult> => {
            try {
                const result = await rooCodeProfileAPI.createProfile(profile);
                const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Profile created successfully:\n${resultText}`
                        }
                    ]
                };
                return toolResult;
            } catch (error) {
                throw error;
            }
        }
    );

    // Update profile tool
    server.tool(
        'roocode_update_profile',
        `Update an existing RooCode profile.

        Parameters:
        - profileId: ID of the profile to update
        - profile: Updated profile configuration`,
        {
            profileId: z.string().describe('Profile ID to update'),
            profile: z.record(z.any()).describe('Updated profile configuration')
        },
        async ({ profileId, profile }): Promise<CallToolResult> => {
            try {
                const result = await rooCodeProfileAPI.updateProfile(profileId, profile);
                const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Profile updated successfully:\n${resultText}`
                        }
                    ]
                };
                return toolResult;
            } catch (error) {
                throw error;
            }
        }
    );

    // Upsert profile tool
    server.tool(
        'roocode_upsert_profile',
        `Create a new profile or update an existing one.

        Parameters:
        - profile: Profile configuration (must include ID for updates)`,
        {
            profile: z.record(z.any()).describe('Profile configuration object')
        },
        async ({ profile }): Promise<CallToolResult> => {
            try {
                const result = await rooCodeProfileAPI.upsertProfile(profile);
                const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Profile upserted successfully:\n${resultText}`
                        }
                    ]
                };
                return toolResult;
            } catch (error) {
                throw error;
            }
        }
    );

    // Delete profile tool
    server.tool(
        'roocode_delete_profile',
        `Delete a RooCode profile.

        Parameters:
        - profileId: ID of the profile to delete`,
        {
            profileId: z.string().describe('Profile ID to delete')
        },
        async ({ profileId }): Promise<CallToolResult> => {
            try {
                const result = await rooCodeProfileAPI.deleteProfile(profileId);
                const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Profile deleted successfully:\n${resultText}`
                        }
                    ]
                };
                return toolResult;
            } catch (error) {
                throw error;
            }
        }
    );

    // Get active profile tool
    server.tool(
        'roocode_get_active_profile',
        `Get the currently active RooCode profile.`,
        {},
        async (): Promise<CallToolResult> => {
            try {
                const profile = await rooCodeProfileAPI.getActiveProfile();
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(profile, null, 2)
                        }
                    ]
                };
                return result;
            } catch (error) {
                throw error;
            }
        }
    );

    // Set active profile tool
    server.tool(
        'roocode_set_active_profile',
        `Set the active RooCode profile.

        Parameters:
        - profileId: ID of the profile to make active`,
        {
            profileId: z.string().describe('Profile ID to set as active')
        },
        async ({ profileId }): Promise<CallToolResult> => {
            try {
                const result = await rooCodeProfileAPI.setActiveProfile(profileId);
                const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

                const toolResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Active profile set successfully:\n${resultText}`
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
