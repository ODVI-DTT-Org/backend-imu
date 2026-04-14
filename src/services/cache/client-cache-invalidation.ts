// src/services/cache/client-cache-invalidation.ts

/**
 * Client Cache Invalidation Service
 *
 * Automatically invalidates cache entries when client/touchpoint data changes
 * Uses non-blocking async invalidation to avoid slowing requests
 *
 * Part of Redis caching implementation
 *
 * @file client-cache-invalidation.ts
 */

import { getClientsCacheService } from './clients-cache.js';

/**
 * Cache invalidation event types
 */
export type InvalidationEvent =
  | 'touchpoint_created'
  | 'touchpoint_updated'
  | 'touchpoint_deleted'
  | 'client_assigned'
  | 'client_unassigned'
  | 'area_assignment_changed';

/**
 * Invalidation event data
 */
export interface InvalidationEventData {
  event: InvalidationEvent;
  clientId: string;
  userId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Client Cache Invalidation Service
 *
 * Provides non-blocking async cache invalidation hooks
 * for touchpoint and client assignment changes
 */
export class ClientCacheInvalidation {
  private clientsCache = getClientsCacheService();
  private enabled: boolean;

  constructor() {
    // Cache invalidation is enabled when Redis is enabled
    this.enabled = this.clientsCache['cache']?.isEnabled() ?? false;

    if (this.enabled) {
      console.log('[ClientCacheInvalidation] Cache invalidation enabled');
    } else {
      console.log('[ClientCacheInvalidation] Cache invalidation disabled (Redis not configured)');
    }
  }

  /**
   * Handle touchpoint creation - invalidate touchpoint summary cache
   * @param clientId - Client ID
   * @param userId - User ID who created the touchpoint
   */
  async onTouchpointCreated(clientId: string, userId?: string): Promise<void> {
    if (!this.enabled) return;

    // Non-blocking async invalidation
    this.invalidateTouchpointSummary(clientId, 'touchpoint_created', { userId })
      .catch((error) => {
        console.error(`[ClientCacheInvalidation] Failed to invalidate after touchpoint creation:`, error);
      });

    // If touchpoint created, user's assigned client IDs may change
    // (e.g., first touchpoint assigns client to user)
    if (userId) {
      this.invalidateUserCache(userId).catch((error) => {
        console.error(`[ClientCacheInvalidation] Failed to invalidate user cache:`, error);
      });
    }
  }

  /**
   * Handle touchpoint update - invalidate touchpoint summary cache
   * @param clientId - Client ID
   * @param userId - User ID who updated the touchpoint
   */
  async onTouchpointUpdated(clientId: string, userId?: string): Promise<void> {
    if (!this.enabled) return;

    this.invalidateTouchpointSummary(clientId, 'touchpoint_updated', { userId })
      .catch((error) => {
        console.error(`[ClientCacheInvalidation] Failed to invalidate after touchpoint update:`, error);
      });
  }

  /**
   * Handle touchpoint deletion - invalidate touchpoint summary cache
   * @param clientId - Client ID
   * @param userId - User ID who deleted the touchpoint
   */
  async onTouchpointDeleted(clientId: string, userId?: string): Promise<void> {
    if (!this.enabled) return;

    this.invalidateTouchpointSummary(clientId, 'touchpoint_deleted', { userId })
      .catch((error) => {
        console.error(`[ClientCacheInvalidation] Failed to invalidate after touchpoint deletion:`, error);
      });
  }

  /**
   * Handle client assignment - invalidate user's assigned client IDs
   * @param clientId - Client ID
   * @param userId - User ID who was assigned the client
   */
  async onClientAssigned(clientId: string, userId: string): Promise<void> {
    if (!this.enabled) return;

    this.invalidateUserCache(userId, 'client_assigned', { clientId })
      .catch((error) => {
        console.error(`[ClientCacheInvalidation] Failed to invalidate after client assignment:`, error);
      });
  }

  /**
   * Handle client unassignment - invalidate user's assigned client IDs
   * @param clientId - Client ID
   * @param userId - User ID who was unassigned the client
   */
  async onClientUnassigned(clientId: string, userId: string): Promise<void> {
    if (!this.enabled) return;

    this.invalidateUserCache(userId, 'client_unassigned', { clientId })
      .catch((error) => {
        console.error(`[ClientCacheInvalidation] Failed to invalidate after client unassignment:`, error);
      });
  }

  /**
   * Handle area assignment change - invalidate user's assigned areas and client IDs
   * @param userId - User ID whose area assignments changed
   */
  async onAreaAssignmentChanged(userId: string): Promise<void> {
    if (!this.enabled) return;

    this.invalidateUserCache(userId, 'area_assignment_changed')
      .catch((error) => {
        console.error(`[ClientCacheInvalidation] Failed to invalidate after area change:`, error);
      });
  }

  /**
   * Handle bulk touchpoint changes - invalidate multiple touchpoint summaries
   * @param clientIds - Array of client IDs
   * @param event - Event type
   */
  async onBulkTouchpointChange(clientIds: string[], event: InvalidationEvent = 'touchpoint_updated'): Promise<void> {
    if (!this.enabled || clientIds.length === 0) return;

    this.invalidateTouchpointSummaries(clientIds, event)
      .catch((error) => {
        console.error(`[ClientCacheInvalidation] Failed to invalidate bulk touchpoints:`, error);
      });
  }

  /**
   * Invalidate touchpoint summary cache for a client
   * @param clientId - Client ID
   * @param event - Event type
   * @param metadata - Additional metadata
   */
  private async invalidateTouchpointSummary(
    clientId: string,
    event: InvalidationEvent,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await this.clientsCache.invalidateTouchpointSummary(clientId);

      const eventData: InvalidationEventData = {
        event,
        clientId,
        timestamp: new Date().toISOString(),
        metadata,
      };

      console.debug(`[ClientCacheInvalidation] Invalidated touchpoint summary:`, JSON.stringify(eventData));
    } catch (error) {
      console.error(`[ClientCacheInvalidation] Error invalidating touchpoint summary for ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Invalidate touchpoint summary cache for multiple clients
   * @param clientIds - Array of client IDs
   * @param event - Event type
   */
  private async invalidateTouchpointSummaries(clientIds: string[], event: InvalidationEvent): Promise<void> {
    try {
      await this.clientsCache.invalidateTouchpointSummaries(clientIds);

      console.debug(`[ClientCacheInvalidation] Invalidated ${clientIds.length} touchpoint summaries for ${event}`);
    } catch (error) {
      console.error(`[ClientCacheInvalidation] Error invalidating touchpoint summaries:`, error);
      throw error;
    }
  }

  /**
   * Invalidate all cache for a user
   * @param userId - User ID
   * @param event - Event type
   * @param metadata - Additional metadata
   */
  private async invalidateUserCache(
    userId: string,
    event: InvalidationEvent,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await this.clientsCache.invalidateUserCache(userId);

      const eventData: InvalidationEventData = {
        event,
        clientId: metadata?.clientId || '',
        userId,
        timestamp: new Date().toISOString(),
        metadata,
      };

      console.debug(`[ClientCacheInvalidation] Invalidated user cache:`, JSON.stringify(eventData));
    } catch (error) {
      console.error(`[ClientCacheInvalidation] Error invalidating user cache for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Manually trigger invalidation for a specific event
   * Useful for testing or manual cache clearing
   * @param event - Invalidation event
   * @param data - Event data
   */
  async triggerInvalidation(event: InvalidationEvent, data: {
    clientId?: string;
    userId?: string;
    clientIds?: string[];
  }): Promise<void> {
    if (!this.enabled) return;

    switch (event) {
      case 'touchpoint_created':
      case 'touchpoint_updated':
      case 'touchpoint_deleted':
        if (data.clientId) {
          await this.invalidateTouchpointSummary(data.clientId, event);
        }
        if (data.clientIds) {
          await this.invalidateTouchpointSummaries(data.clientIds, event);
        }
        break;

      case 'client_assigned':
      case 'client_unassigned':
      case 'area_assignment_changed':
        if (data.userId) {
          await this.invalidateUserCache(data.userId, event, { clientId: data.clientId });
        }
        break;
    }
  }

  /**
   * Check if cache invalidation is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
let invalidationInstance: ClientCacheInvalidation | null = null;

/**
 * Get the singleton cache invalidation service instance
 * @returns Cache invalidation service
 */
export function getClientCacheInvalidation(): ClientCacheInvalidation {
  if (!invalidationInstance) {
    invalidationInstance = new ClientCacheInvalidation();
  }
  return invalidationInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetClientCacheInvalidation(): void {
  invalidationInstance = null;
}
