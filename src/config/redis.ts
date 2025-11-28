import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient: RedisClientType | null = null;

export const getRedisClient = async (): Promise<RedisClientType> => {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisPassword = process.env.REDIS_PASSWORD;

  // If password is in URL, don't pass it separately
  const clientConfig: any = {
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries: number) => {
        if (retries > 10) {
          console.error('Redis reconnection failed after 10 retries');
          return new Error('Redis connection failed');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  };

  // Only add password if it's not in the URL
  if (redisPassword && !redisUrl.includes('@')) {
    clientConfig.password = redisPassword;
  }

  redisClient = createClient(clientConfig);

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis Client Connected');
  });

  redisClient.on('ready', () => {
    console.log('Redis Client Ready');
  });

  await redisClient.connect();
  return redisClient;
};

export const testRedisConnection = async (): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    await client.ping();
    console.log('Redis connected successfully');
    return true;
  } catch (error) {
    console.error('Redis connection error:', error);
    return false;
  }
};

export const closeRedisConnection = async (): Promise<void> => {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
};

export default getRedisClient;

