/**
 * WAHA API Client Helper
 */
const WAHA_URL =
  process.env.WAHA_API_URL ||
  process.env.WAHA_BASE_URL ||
  process.env.WAHA_URL ||
  'http://localhost:3008';
const WAHA_KEY = process.env.WAHA_API_KEY || 'waha_marketing_secret_key';
const DEFAULT_SESSION = process.env.WAHA_SESSION || 'default';

function getHeaders(customHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    ...customHeaders,
  };
  if (WAHA_KEY) {
    headers['x-api-key'] = WAHA_KEY;
  }
  return headers;
}

export interface WAHASessionStatus {
  name: string;
  status: 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED';
  me?: {
    id: string;
    pushName?: string;
  };
}

export const waha = {
  get baseUrl() {
    return WAHA_URL;
  },

  async getSessionStatus(session = DEFAULT_SESSION): Promise<WAHASessionStatus | null> {
    try {
      const res = await fetch(`${WAHA_URL}/api/sessions/${session}`, {
        headers: getHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) {
        if (res.status === 404) {
          await this.startSession(session);
        }
        return null;
      }
      return await res.json();
    } catch {
      return null;
    }
  },

  async startSession(session = DEFAULT_SESSION) {
    try {
      const webhookUrl = process.env.APP_DOCKER_URL
        ? `${process.env.APP_DOCKER_URL}/api/webhook`
        : 'http://web:3050/api/webhook';

      const res = await fetch(`${WAHA_URL}/api/sessions/start`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: session,
          config: {
            webhooks: [
              {
                url: webhookUrl,
                events: ['message', 'message.any', 'message.ack', 'session.status'],
              },
            ],
          },
        }),
      });
      return await res.json();
    } catch (err: any) {
      return { error: err.message };
    }
  },

  async stopSession(session = DEFAULT_SESSION) {
    try {
      const res = await fetch(`${WAHA_URL}/api/sessions/stop`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: session }),
      });
      return await res.json();
    } catch (err: any) {
      return { error: err.message };
    }
  },

  async restartSession(session = DEFAULT_SESSION) {
    try {
      // 1. Stop existing / failed session first
      await this.stopSession(session);
    } catch {}

    // Wait a brief moment then start fresh
    await new Promise((r) => setTimeout(r, 600));
    return await this.startSession(session);
  },

  async getQRCode(session = DEFAULT_SESSION): Promise<{ raw?: string; scanCode?: string } | null> {
    try {
      const res = await fetch(`${WAHA_URL}/api/sessions/${session}/auth/qr`, {
        headers: getHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async logoutSession(session = DEFAULT_SESSION) {
    try {
      const res = await fetch(`${WAHA_URL}/api/sessions/logout`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: session }),
      });
      return await res.json();
    } catch (err: any) {
      return { error: err.message };
    }
  },

  async checkNumberExists(phone: string, session = DEFAULT_SESSION): Promise<{ exists: boolean; jid?: string }> {
    try {
      const res = await fetch(
        `${WAHA_URL}/api/contacts/check-exists?phone=${encodeURIComponent(phone)}&session=${session}`,
        {
          headers: getHeaders(),
          cache: 'no-store',
        }
      );
      if (!res.ok) return { exists: false };
      const data = await res.json();
      return {
        exists: !!data.numberExists,
        jid: data.chatId || `${phone}@c.us`,
      };
    } catch {
      return { exists: false };
    }
  },

  async sendText(chatId: string, text: string, replyTo?: string, session = DEFAULT_SESSION) {
    const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+)/i.test(text);
    const res = await fetch(`${WAHA_URL}/api/sendText`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        session,
        chatId,
        text,
        reply_to: replyTo,
        linkPreview: hasLink ? true : undefined,
      }),
    });
    return await res.json();
  },

  async sendSeen(chatId: string, session = DEFAULT_SESSION) {
    try {
      const res = await fetch(`${WAHA_URL}/api/sendSeen`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ session, chatId }),
      });
      return await res.json().catch(() => ({ ok: res.ok }));
    } catch {
      return { ok: false };
    }
  },

  async startTyping(chatId: string, session = DEFAULT_SESSION) {
    try {
      const res = await fetch(`${WAHA_URL}/api/startTyping`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ session, chatId }),
      });
      return await res.json().catch(() => ({ ok: res.ok }));
    } catch {
      return { ok: false };
    }
  },

  async stopTyping(chatId: string, session = DEFAULT_SESSION) {
    try {
      const res = await fetch(`${WAHA_URL}/api/stopTyping`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ session, chatId }),
      });
      return await res.json().catch(() => ({ ok: res.ok }));
    } catch {
      return { ok: false };
    }
  },

  async deliverHumanLikeReply(
    chatId: string,
    text: string,
    options?: {
      replyTo?: string;
      session?: string;
      skipDelays?: boolean;
      /** Checked after the typing delay; returning false cancels the send. */
      beforeSend?: () => Promise<boolean>;
    }
  ): Promise<any> {
    const session = options?.session || DEFAULT_SESSION;
    const skipDelays =
      options?.skipDelays ?? (process.env.NODE_ENV === 'test' || process.env.AGENT_SKIP_TYPING_DELAY === '1');

    await this.sendSeen(chatId, session);
    if (!skipDelays) {
      await new Promise((r) => setTimeout(r, 900 + Math.floor(Math.random() * 500)));
    }

    await this.startTyping(chatId, session);
    if (!skipDelays) {
      const typingMs = Math.min(4500, Math.max(1600, text.length * 20));
      await new Promise((r) => setTimeout(r, typingMs));
    }

    await this.stopTyping(chatId, session);
    if (options?.beforeSend && !(await options.beforeSend())) {
      return { skipped: true };
    }
    return await this.sendText(chatId, text, options?.replyTo, session);
  },

  async sendImage(
    chatId: string,
    fileUrl: string,
    caption?: string,
    replyTo?: string,
    filename?: string,
    mimetype?: string,
    session = DEFAULT_SESSION
  ) {
    const filePayload: any = { url: fileUrl };
    if (filename) filePayload.filename = filename;
    if (mimetype) filePayload.mimetype = mimetype;

    const res = await fetch(`${WAHA_URL}/api/sendImage`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        session,
        chatId,
        file: filePayload,
        caption,
        reply_to: replyTo,
      }),
    });
    return await res.json();
  },

  async sendVideo(
    chatId: string,
    fileUrl: string,
    caption?: string,
    replyTo?: string,
    filename?: string,
    mimetype?: string,
    session = DEFAULT_SESSION
  ) {
    const filePayload: any = { url: fileUrl };
    if (filename) filePayload.filename = filename;
    if (mimetype) filePayload.mimetype = mimetype;

    const res = await fetch(`${WAHA_URL}/api/sendVideo`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        session,
        chatId,
        file: filePayload,
        caption,
        reply_to: replyTo,
      }),
    });
    return await res.json();
  },

  async sendFile(
    chatId: string,
    fileUrl: string,
    caption?: string,
    replyTo?: string,
    filename?: string,
    mimetype?: string,
    session = DEFAULT_SESSION
  ) {
    const filePayload: any = {
      url: fileUrl,
    };
    if (filename) filePayload.filename = filename;
    if (mimetype) filePayload.mimetype = mimetype;

    const res = await fetch(`${WAHA_URL}/api/sendFile`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        session,
        chatId,
        file: filePayload,
        caption,
        reply_to: replyTo,
      }),
    });
    return await res.json();
  },

  async fetchAllContacts(session = DEFAULT_SESSION): Promise<any[]> {
    try {
      const res = await fetch(`${WAHA_URL}/api/contacts/all?session=${session}`, {
        headers: getHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },
};
