import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      // BullMQ requirement: never give up on blocking commands
      maxRetriesPerRequest: null,
    });
  }
  return globalForRedis.redis;
}
