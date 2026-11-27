import { prisma } from './prisma';

export type LogType =
  | 'MESSAGE_SENT'
  | 'MESSAGE_RECEIVED'
  | 'MEDIA_UPLOAD'
  | 'SESSION_CHANGE'
  | 'AUTH'
  | 'BROADCAST'
  | 'AGENT'
  | 'SECURITY_WARNING'
  | 'ERROR'
  | 'CHAT_CLEARED';

export type LogStatus = 'SUCCESS' | 'ERROR' | 'WARNING';

export async function createLog(
  type: LogType,
  status: LogStatus,
  message: string,
  details?: Record<string, any> | string,
  error?: string
) {
  try {
    const detailsStr =
      typeof details === 'object' ? JSON.stringify(details) : details || null;

    return await prisma.log.create({
      data: {
        type,
        status,
        message,
        details: detailsStr,
        error: error || null,
      },
    });
  } catch (err) {
    console.error('Failed to create log:', err);
    return null;
  }
}
