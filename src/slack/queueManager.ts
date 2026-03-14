import { config } from "../config/env";

type WorkHandler = () => Promise<void>;

interface QueueItem {
  ticketId: number;
  run: WorkHandler;
}

export type QueueStatus =
  | "started"
  | "queued"
  | "already_queued"
  | "already_processing";

export interface QueueResult {
  status: QueueStatus;
  position?: number;
}

class QueueManager {
  private readonly pendingQueue: QueueItem[] = [];
  private readonly activeTickets = new Set<number>();
  private readonly queuedTickets = new Set<number>();
  private readonly maxConcurrent: number;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  enqueue(ticketId: number, run: WorkHandler): QueueResult {
    if (this.activeTickets.has(ticketId)) {
      return { status: "already_processing" };
    }

    if (this.queuedTickets.has(ticketId)) {
      return {
        status: "already_queued",
        position: this.getQueuePosition(ticketId),
      };
    }

    this.pendingQueue.push({ ticketId, run });
    this.queuedTickets.add(ticketId);

    this.drain();

    if (this.activeTickets.has(ticketId)) {
      return { status: "started" };
    }

    return {
      status: "queued",
      position: this.getQueuePosition(ticketId),
    };
  }

  private getQueuePosition(ticketId: number): number | undefined {
    const index = this.pendingQueue.findIndex((item) => item.ticketId === ticketId);
    return index >= 0 ? index + 1 : undefined;
  }

  private drain() {
    while (this.activeTickets.size < this.maxConcurrent && this.pendingQueue.length > 0) {
      const item = this.pendingQueue.shift();
      if (!item) break;

      this.queuedTickets.delete(item.ticketId);
      this.activeTickets.add(item.ticketId);
      void this.runItem(item);
    }
  }

  private async runItem(item: QueueItem) {
    try {
      await item.run();
    } catch (err) {
      console.error(`Queue worker failed for ticket #${item.ticketId}:`, err);
    } finally {
      this.activeTickets.delete(item.ticketId);
      this.drain();
    }
  }
}

export const ticketQueue = new QueueManager(config.bot.maxConcurrentTickets);
