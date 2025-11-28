/**
 * Service to manage dynamically injected URLs for trending events
 * Allows adding/removing URLs at runtime without server restart
 */

import { logger } from '../../config/logger';
import { URL } from 'url';

export interface InjectedUrl {
  id: string;
  url: string;
  path: string;
  params: Record<string, string>;
  createdAt: Date;
}

/**
 * Service to manage injected URLs
 */
export class InjectedUrlsService {
  private urls: Map<string, InjectedUrl> = new Map();

  /**
   * Parse a full URL into path and params
   * Handles both full URLs and relative paths
   */
  private parseUrl(fullUrl: string): { path: string; params: Record<string, string> } {
    try {
      const url = new URL(fullUrl);
      const path = url.pathname;
      const params: Record<string, string> = {};

      // Parse query parameters
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });

      // Validate that the URL is for the Polymarket API
      const apiBaseUrl = process.env.POLYMARKET_API_BASE_URL || 'https://gamma-api.polymarket.com';
      if (!url.origin.includes('polymarket.com') && !url.origin.includes(new URL(apiBaseUrl).hostname)) {
        logger.warn({
          message: 'URL does not appear to be a Polymarket API URL',
          url: fullUrl,
          origin: url.origin,
        });
      }

      return { path, params };
    } catch (error) {
      logger.error({
        message: 'Error parsing URL',
        url: fullUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Invalid URL format: ${fullUrl}`);
    }
  }

  /**
   * Generate a unique ID from URL
   */
  private generateId(url: string): string {
    // Use a hash of the URL as ID
    return Buffer.from(url).toString('base64').slice(0, 32);
  }

  /**
   * Add a new URL to be polled
   */
  addUrl(fullUrl: string): InjectedUrl {
    const id = this.generateId(fullUrl);
    
    if (this.urls.has(id)) {
      logger.warn({
        message: 'URL already exists',
        url: fullUrl,
        id,
      });
      return this.urls.get(id)!;
    }

    const { path, params } = this.parseUrl(fullUrl);
    const injectedUrl: InjectedUrl = {
      id,
      url: fullUrl,
      path,
      params,
      createdAt: new Date(),
    };

    this.urls.set(id, injectedUrl);

    logger.info({
      message: 'URL added to injected URLs',
      id,
      url: fullUrl,
      path,
      params,
    });

    return injectedUrl;
  }

  /**
   * Remove a URL by ID or URL string
   */
  removeUrl(identifier: string): boolean {
    // Try to find by ID first
    if (this.urls.has(identifier)) {
      this.urls.delete(identifier);
      logger.info({
        message: 'URL removed by ID',
        id: identifier,
      });
      return true;
    }

    // Try to find by URL string
    const id = this.generateId(identifier);
    if (this.urls.has(id)) {
      this.urls.delete(id);
      logger.info({
        message: 'URL removed by URL string',
        url: identifier,
        id,
      });
      return true;
    }

    logger.warn({
      message: 'URL not found for removal',
      identifier,
    });
    return false;
  }

  /**
   * Get all injected URLs
   */
  getAllUrls(): InjectedUrl[] {
    return Array.from(this.urls.values());
  }

  /**
   * Get a URL by ID
   */
  getUrl(id: string): InjectedUrl | undefined {
    return this.urls.get(id);
  }

  /**
   * Check if a URL exists
   */
  hasUrl(identifier: string): boolean {
    if (this.urls.has(identifier)) {
      return true;
    }
    const id = this.generateId(identifier);
    return this.urls.has(id);
  }

  /**
   * Clear all injected URLs
   */
  clearAll(): void {
    const count = this.urls.size;
    this.urls.clear();
    logger.info({
      message: 'All injected URLs cleared',
      count,
    });
  }

  /**
   * Get count of injected URLs
   */
  getCount(): number {
    return this.urls.size;
  }
}

// Export singleton instance
export const injectedUrlsService = new InjectedUrlsService();

