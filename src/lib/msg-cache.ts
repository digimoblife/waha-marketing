/**
 * In-memory message deduplication cache.
 * Shared across /api/messages and /api/webhook to eliminate race conditions
 * and double-processing of outgoing/incoming messages.
 */

const processedMsgIds = new Set<string>();

export function extractStanzaId(msgId: string): string {
  if (!msgId) return '';
  if (msgId.includes('_')) {
    const parts = msgId.split('_');
    return parts[parts.length - 1] || msgId;
  }
  return msgId;
}

export function markMessageProcessed(id: string) {
  if (!id) return;
  processedMsgIds.add(id);
  const stanza = extractStanzaId(id);
  if (stanza && stanza !== id) {
    processedMsgIds.add(stanza);
  }
  const timer = setTimeout(() => {
    processedMsgIds.delete(id);
    if (stanza) processedMsgIds.delete(stanza);
  }, 60000); // 60 seconds TTL
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

export function isMessageProcessed(id: string): boolean {
  if (!id) return false;
  if (processedMsgIds.has(id)) return true;
  const stanza = extractStanzaId(id);
  if (stanza && processedMsgIds.has(stanza)) return true;
  return false;
}
