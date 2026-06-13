import { Queue } from "bullmq";
import Redis from "ioredis";

export const GENERATION_QUEUE = "generation-jobs";

export function createQueue(redisUrl: string) {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(GENERATION_QUEUE, { connection });
  return { queue, connection };
}
