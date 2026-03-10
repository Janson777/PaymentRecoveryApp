export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: Record<string, unknown>;
  maxRetriesPerRequest: null;
}

export function getRedisConnectionOptions(): RedisConnectionOptions {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const parsed = new URL(redisUrl);
  const useTls = parsed.protocol === "rediss:";

  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(useTls ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
