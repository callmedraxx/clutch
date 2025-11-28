import { pool } from '../config/database';
import { getCache, setCache, deleteCache } from '../utils/cache';
import { logger } from '../config/logger';

/**
 * Example service demonstrating database and Redis usage
 * This is a template for creating your own services
 */

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export class ExampleService {
  private static readonly CACHE_TTL = 3600; // 1 hour

  /**
   * Get user by ID with caching
   */
  static async getUserById(id: number): Promise<User | null> {
    const cacheKey = `user:${id}`;

    // Try to get from cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      logger.info(`Cache hit for user ${id}`);
      return JSON.parse(cached);
    }

    // If not in cache, query database
    try {
      const result = await pool.query<User>(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];

      // Store in cache
      await setCache(cacheKey, JSON.stringify(user), this.CACHE_TTL);

      return user;
    } catch (error) {
      logger.error(`Error getting user ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new user
   */
  static async createUser(email: string, name: string): Promise<User> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<User>(
        'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *',
        [email, name]
      );

      await client.query('COMMIT');

      const user = result.rows[0];

      // Cache the new user
      await setCache(`user:${user.id}`, JSON.stringify(user), this.CACHE_TTL);

      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating user:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update user
   */
  static async updateUser(id: number, name: string): Promise<User | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<User>(
        'UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [name, id]
      );

      await client.query('COMMIT');

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];

      // Update cache
      await setCache(`user:${user.id}`, JSON.stringify(user), this.CACHE_TTL);

      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error updating user ${id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete user
   */
  static async deleteUser(id: number): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM users WHERE id = $1',
        [id]
      );

      await client.query('COMMIT');

      // Remove from cache
      await deleteCache(`user:${id}`);

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error deleting user ${id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all users (paginated)
   */
  static async getAllUsers(limit: number = 10, offset: number = 0): Promise<User[]> {
    try {
      const result = await pool.query<User>(
        'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting all users:', error);
      throw error;
    }
  }
}

