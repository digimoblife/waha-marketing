/**
 * In-memory message deduplication cache.
 * Shared across /api/messages and /api/webhook to eliminate race conditions
 * and double-processing of outgoing/incoming messages.
 */

const processedMsgIds = new Set<string>();

// Serialized WhatsApp IDs: `<fromMe>_<chatJid>_<STANZA>` and, for groups,
// `<fromMe>_<groupJid>_<STANZA>_<participantJid>`. JIDs never contain underscores.
// The stanza is everything after the chat JID, minus a trailing participant JID if present.
const SERIALIZED_MSG_ID = /^(?:true|false)_[^_]+@[^_]+_(.+?)(?:_[^_]+@[^_]+)?$/;

export function extractStanzaId(msgId: string): string {
  if (!msgId) return '';
  const serialized = SERIALIZED_MSG_ID.exec(msgId);
  if (serialized) return serialized[1];
  // Bare stanza IDs and local fallback IDs (out_*, ai_*, bc_*) are their own identity.
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
