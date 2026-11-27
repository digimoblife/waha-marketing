export interface DebouncedInboundItem {
  msgId: string;
  text: string;
  mediaType: string;
  mediaUrl: string | null;
  quotedBody: string | null;
  timestamp: Date;
}

interface PendingChatBucket {
  chatId: string;
  senderPhone: string;
  items: DebouncedInboundItem[];
  timer: ReturnType<typeof setTimeout>;
  handler: (payload: FlushedChatTurn) => Promise<void>;
}

export interface FlushedChatTurn {
  chatId: string;
  senderPhone: string;
  items: DebouncedInboundItem[];
  combinedText: string;
  latestMediaItems: Array<{ mediaType: string; mediaUrl: string }>;
  lastMsgId: string;
}

const globalForDebouncer = globalThis as unknown as {
  agentDebounceBuckets?: Map<string, PendingChatBucket>;
};

if (!globalForDebouncer.agentDebounceBuckets) {
  globalForDebouncer.agentDebounceBuckets = new Map<string, PendingChatBucket>();
}

function getBuckets(): Map<string, PendingChatBucket> {
  return globalForDebouncer.agentDebounceBuckets!;
}

function buildFlushedPayload(bucket: PendingChatBucket): FlushedChatTurn {
  const combinedParts: string[] = [];
  const latestMediaItems: Array<{ mediaType: string; mediaUrl: string }> = [];

  for (const item of bucket.items) {
    if (item.quotedBody) {
      combinedParts.push(`[Membalas pesan: "${item.quotedBody}"]`);
    }
    if (item.text && item.text.trim()) {
      combinedParts.push(item.text.trim());
    }
    if (item.mediaUrl && (item.mediaType === 'image' || item.mediaType === 'audio')) {
      latestMediaItems.push({ mediaType: item.mediaType, mediaUrl: item.mediaUrl });
    }
  }

  const lastItem = bucket.items[bucket.items.length - 1];
  return {
    chatId: bucket.chatId,
    senderPhone: bucket.senderPhone,
    items: [...bucket.items],
    combinedText: combinedParts.join('\n').trim(),
    latestMediaItems: latestMediaItems.slice(-3),
    lastMsgId: lastItem?.msgId || '',
  };
}

/**
 * Enqueues an incoming message into a per-chat sliding window buffer.
 * Resets the timer whenever the merchant sends follow-up lines/screenshots within debounceMs.
 */
export function enqueueDebouncedMessage(params: {
  chatId: string;
  senderPhone: string;
  item: DebouncedInboundItem;
  debounceMs: number;
  onFlush: (payload: FlushedChatTurn) => Promise<void>;
}) {
  const buckets = getBuckets();
  const existing = buckets.get(params.chatId);

  if (existing) {
    clearTimeout(existing.timer);
    existing.items.push(params.item);
    existing.handler = params.onFlush;
    existing.timer = setTimeout(() => {
      void flushChatBucket(params.chatId);
    }, params.debounceMs);
    return;
  }

  const bucket: PendingChatBucket = {
    chatId: params.chatId,
    senderPhone: params.senderPhone,
    items: [params.item],
    handler: params.onFlush,
    timer: setTimeout(() => {
      void flushChatBucket(params.chatId);
    }, params.debounceMs),
  };

  buckets.set(params.chatId, bucket);
}

export async function flushChatBucket(chatId: string): Promise<boolean> {
  const buckets = getBuckets();
  const bucket = buckets.get(chatId);
  if (!bucket) return false;

  clearTimeout(bucket.timer);
  buckets.delete(chatId);

  const payload = buildFlushedPayload(bucket);
  try {
    await bucket.handler(payload);
  } catch (err) {
    console.error(`[AgentDebouncer] Error processing flushed turn for ${chatId}:`, err);
  }
  return true;
}

/**
 * Cancels any pending AI response for a chat (e.g. when a human operator replies manually in /inbox
 * or when Master Switch is turned OFF).
 */
export function cancelDebouncedChat(chatId: string): boolean {
  const buckets = getBuckets();
  const bucket = buckets.get(chatId);
  if (!bucket) return false;
  clearTimeout(bucket.timer);
  buckets.delete(chatId);
  return true;
}

export function cancelAllDebouncedChats(): number {
  const buckets = getBuckets();
  let count = 0;
  for (const b of Array.from(buckets.values())) {
    clearTimeout(b.timer);
    count++;
  }
  buckets.clear();
  return count;
}

export function getPendingDebounceCount(): number {
  return getBuckets().size;
}
