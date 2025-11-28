import { getRedisClient } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Cache utility functions for Redis
 */

export const getCache = async (key: string): Promise<string | null> => {
  try {
    const client = await getRedisClient();
    const value = await client.get(key);
    return value;
  } catch (error) {
    logger.error(`Cache get error for key ${key}:`, error);
    return null;
  }
};

export const setCache = async (
  key: string,
  value: string,
  expirationSeconds?: number
): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    if (expirationSeconds) {
      await client.setEx(key, expirationSeconds, value);
    } else {
      await client.set(key, value);
    }
    return true;
  } catch (error) {
    logger.error(`Cache set error for key ${key}:`, error);
    return false;
  }
};

export const deleteCache = async (key: string): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    await client.del(key);
    return true;
  } catch (error) {
    logger.error(`Cache delete error for key ${key}:`, error);
    return false;
  }
};

export const clearCachePattern = async (pattern: string): Promise<number> => {
  try {
    const client = await getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      return await client.del(keys);
    }
    return 0;
  } catch (error) {
    logger.error(`Cache clear pattern error for ${pattern}:`, error);
    return 0;
  }
};

