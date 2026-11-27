import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const sqlitePath = process.env.SQLITE_SOURCE_PATH || path.join(process.cwd(), 'prisma', 'dev.db');

if (!fs.existsSync(sqlitePath)) {
  console.log(`[Migrate SQLite -> PG] Source file ${sqlitePath} does not exist. Nothing to migrate.`);
  process.exit(0);
}

const stat = fs.statSync(sqlitePath);
if (stat.size === 0) {
  console.log(`[Migrate SQLite -> PG] Source file ${sqlitePath} is empty (0 bytes). Nothing to migrate.`);
  process.exit(0);
}

const prisma = new PrismaClient();

function readSqliteTable(tableName) {
  const out = execFileSync('sqlite3', ['-json', sqlitePath, `SELECT * FROM "${tableName}";`], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
  if (!out) return [];
  return JSON.parse(out);
}

function toDate(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    // Prisma SQLite stores DateTime as epoch milliseconds (or ISO string)
    return new Date(val);
  }
  const num = Number(val);
  if (!Number.isNaN(num) && /^\d+$/.test(String(val))) {
    return new Date(num);
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toBool(val, fallback = false) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'boolean') return val;
  return val === 1 || val === '1' || val === 'true';
}

async function main() {
  console.log(`[Migrate SQLite -> PG] Reading from ${sqlitePath}...`);

  const summary = [];

  // 1. User
  const users = readSqliteTable('User');
  for (const r of users) {
    await prisma.user.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        username: r.username,
        password: r.password,
        name: r.name,
        role: r.role || 'ADMIN',
        isActive: toBool(r.isActive, true),
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
      update: {
        username: r.username,
        password: r.password,
        name: r.name,
        role: r.role || 'ADMIN',
        isActive: toBool(r.isActive, true),
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
    });
  }
  summary.push({ table: 'User', sqlite: users.length, pg: await prisma.user.count() });

  // 2. AppSetting
  const settings = readSqliteTable('AppSetting');
  for (const r of settings) {
    await prisma.appSetting.upsert({
      where: { key: r.key },
      create: {
        key: r.key,
        value: r.value,
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
      update: {
        value: r.value,
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
    });
  }
  summary.push({ table: 'AppSetting', sqlite: settings.length, pg: await prisma.appSetting.count() });

  // 3. MessageTemplate
  const templates = readSqliteTable('MessageTemplate');
  for (const r of templates) {
    await prisma.messageTemplate.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        shortcut: r.shortcut,
        title: r.title,
        category: r.category || 'Umum',
        body: r.body,
        mediaUrl: r.mediaUrl ?? null,
        createdById: r.createdById ?? null,
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
      update: {
        shortcut: r.shortcut,
        title: r.title,
        category: r.category || 'Umum',
        body: r.body,
        mediaUrl: r.mediaUrl ?? null,
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
    });
  }
  summary.push({ table: 'MessageTemplate', sqlite: templates.length, pg: await prisma.messageTemplate.count() });

  // 4. Contact
  const contacts = readSqliteTable('Contact');
  for (const r of contacts) {
    await prisma.contact.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        phone: r.phone,
        jid: r.jid,
        lid: r.lid ?? null,
        name: r.name ?? null,
        pushName: r.pushName ?? null,
        profilePicUrl: r.profilePicUrl ?? null,
        isWAUser: toBool(r.isWAUser, true),
        tags: r.tags ?? null,
        notes: r.notes ?? null,
        storeName: r.storeName ?? null,
        businessCategory: r.businessCategory ?? null,
        email: r.email ?? null,
        accountCreatedAt: r.accountCreatedAt ?? null,
        address: r.address ?? null,
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
      update: {
        phone: r.phone,
        jid: r.jid,
        lid: r.lid ?? null,
        name: r.name ?? null,
        pushName: r.pushName ?? null,
        profilePicUrl: r.profilePicUrl ?? null,
        isWAUser: toBool(r.isWAUser, true),
        tags: r.tags ?? null,
        notes: r.notes ?? null,
        storeName: r.storeName ?? null,
        businessCategory: r.businessCategory ?? null,
        email: r.email ?? null,
        accountCreatedAt: r.accountCreatedAt ?? null,
        address: r.address ?? null,
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
    });
  }
  summary.push({ table: 'Contact', sqlite: contacts.length, pg: await prisma.contact.count() });

  // 5. ContactNote
  const notes = readSqliteTable('ContactNote');
  for (const r of notes) {
    await prisma.contactNote.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        contactId: r.contactId,
        authorId: r.authorId ?? null,
        authorName: r.authorName,
        body: r.body,
        createdAt: toDate(r.createdAt) || new Date(),
      },
      update: {
        body: r.body,
      },
    });
  }
  summary.push({ table: 'ContactNote', sqlite: notes.length, pg: await prisma.contactNote.count() });

  // 6. Chat
  const chats = readSqliteTable('Chat');
  for (const r of chats) {
    await prisma.chat.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        name: r.name ?? null,
        isGroup: toBool(r.isGroup, false),
        unreadCount: Number(r.unreadCount || 0),
        lastMessage: r.lastMessage ?? null,
        lastMessageAt: toDate(r.lastMessageAt),
        lastInboundAt: toDate(r.lastInboundAt),
        lastAwaySentAt: toDate(r.lastAwaySentAt),
        status: r.status || 'OPEN',
        assigneeId: r.assigneeId ?? null,
        reminderAt: toDate(r.reminderAt),
        reminderNote: r.reminderNote ?? null,
        contactId: r.contactId ?? null,
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
      update: {
        name: r.name ?? null,
        isGroup: toBool(r.isGroup, false),
        unreadCount: Number(r.unreadCount || 0),
        lastMessage: r.lastMessage ?? null,
        lastMessageAt: toDate(r.lastMessageAt),
        lastInboundAt: toDate(r.lastInboundAt),
        lastAwaySentAt: toDate(r.lastAwaySentAt),
        status: r.status || 'OPEN',
        assigneeId: r.assigneeId ?? null,
        reminderAt: toDate(r.reminderAt),
        reminderNote: r.reminderNote ?? null,
        contactId: r.contactId ?? null,
        updatedAt: toDate(r.updatedAt) || new Date(),
      },
    });
  }
  summary.push({ table: 'Chat', sqlite: chats.length, pg: await prisma.chat.count() });

  // 7. Message
  const messages = readSqliteTable('Message');
  for (const r of messages) {
    await prisma.message.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        chatId: r.chatId,
        contactId: r.contactId ?? null,
        fromMe: toBool(r.fromMe, false),
        body: r.body ?? null,
        mediaType: r.mediaType ?? null,
        mediaUrl: r.mediaUrl ?? null,
        fileName: r.fileName ?? null,
        ackStatus: Number(r.ackStatus || 0),
        quotedMsgId: r.quotedMsgId ?? null,
        quotedBody: r.quotedBody ?? null,
        quotedSender: r.quotedSender ?? null,
        senderName: r.senderName ?? null,
        timestamp: toDate(r.timestamp) || new Date(),
      },
      update: {
        body: r.body ?? null,
        mediaType: r.mediaType ?? null,
        mediaUrl: r.mediaUrl ?? null,
        fileName: r.fileName ?? null,
        ackStatus: Number(r.ackStatus || 0),
        quotedMsgId: r.quotedMsgId ?? null,
        quotedBody: r.quotedBody ?? null,
        quotedSender: r.quotedSender ?? null,
        senderName: r.senderName ?? null,
        timestamp: toDate(r.timestamp) || new Date(),
      },
    });
  }
  summary.push({ table: 'Message', sqlite: messages.length, pg: await prisma.message.count() });

  // 8. BroadcastCampaign
  const campaigns = readSqliteTable('BroadcastCampaign');
  for (const r of campaigns) {
    await prisma.broadcastCampaign.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        name: r.name,
        templateId: r.templateId ?? null,
        messageBody: r.messageBody,
        mediaUrl: r.mediaUrl ?? null,
        delayMinSec: Number(r.delayMinSec || 10),
        delayMaxSec: Number(r.delayMaxSec || 20),
        status: r.status || 'DRAFT',
        totalCount: Number(r.totalCount || 0),
        sentCount: Number(r.sentCount || 0),
        failedCount: Number(r.failedCount || 0),
        createdById: r.createdById ?? null,
        createdByName: r.createdByName ?? null,
        createdAt: toDate(r.createdAt) || new Date(),
        completedAt: toDate(r.completedAt),
      },
      update: {
        status: r.status || 'DRAFT',
        totalCount: Number(r.totalCount || 0),
        sentCount: Number(r.sentCount || 0),
        failedCount: Number(r.failedCount || 0),
        completedAt: toDate(r.completedAt),
      },
    });
  }
  summary.push({ table: 'BroadcastCampaign', sqlite: campaigns.length, pg: await prisma.broadcastCampaign.count() });

  // 9. BroadcastRecipient
  const recipients = readSqliteTable('BroadcastRecipient');
  for (const r of recipients) {
    await prisma.broadcastRecipient.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        campaignId: r.campaignId,
        phone: r.phone,
        jid: r.jid,
        contactId: r.contactId ?? null,
        storeName: r.storeName ?? null,
        contactName: r.contactName ?? null,
        businessCategory: r.businessCategory ?? null,
        status: r.status || 'QUEUED',
        error: r.error ?? null,
        sentAt: toDate(r.sentAt),
      },
      update: {
        status: r.status || 'QUEUED',
        error: r.error ?? null,
        sentAt: toDate(r.sentAt),
      },
    });
  }
  summary.push({ table: 'BroadcastRecipient', sqlite: recipients.length, pg: await prisma.broadcastRecipient.count() });

  // 10. Log
  const logs = readSqliteTable('Log');
  for (const r of logs) {
    await prisma.log.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        type: r.type,
        status: r.status,
        message: r.message,
        details: r.details ?? null,
        error: r.error ?? null,
        createdAt: toDate(r.createdAt) || new Date(),
      },
      update: {
        message: r.message,
      },
    });
  }
  summary.push({ table: 'Log', sqlite: logs.length, pg: await prisma.log.count() });

  console.log('\n[Migrate SQLite -> PG] Migration Verification Report:');
  console.table(summary);

  const mismatch = summary.filter((s) => s.pg < s.sqlite);
  if (mismatch.length > 0) {
    throw new Error(`Row count mismatch detected in: ${mismatch.map((m) => m.table).join(', ')}`);
  }
}

main()
  .catch((err) => {
    console.error('[Migrate SQLite -> PG] Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
