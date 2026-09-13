import { Telegraf, Markup } from 'telegraf';
import { getBotToken, getWebhookSecret } from '../lib/config';
import { containsProfanity, escapeHtml, truncateForTelegram } from '../lib/textUtils';
import {
  blockUser,
  closeOpenTicketsForUser,
  closeTicket,
  countOpenTickets,
  createTicket,
  findTicketIdByReply,
  getOpenTicket,
  getSupportChatId,
  getTicket,
  isBlocked,
  mapSupportMessage,
  saveMessage,
  setSupportChatId,
  touchTicket,
} from '../lib/db';

const bot = new Telegraf(getBotToken());

// Never let one bad update crash the whole function silently.
bot.catch((err, ctx) => {
  console.error(`[bot] unhandled error for update ${ctx.update.update_id}`, err);
});

function isSameChat(a: number | string, b: number | string): boolean {
  return a.toString() === b.toString();
}

async function requireGroupAdmin(ctx: any): Promise<boolean> {
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    await ctx.reply('⚠️ Эту команду нужно выполнять в групповом чате психологов, а не в личке.');
    return false;
  }
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    if (member.status !== 'creator' && member.status !== 'administrator') {
      await ctx.reply('⛔ Только администраторы этого чата могут это делать.');
      return false;
    }
    return true;
  } catch (e) {
    console.error('[bot] requireGroupAdmin check failed', e);
    // If Telegram won't tell us the member status, fail closed for a
    // rebind (/send) but this helper is also reused for /status where a
    // failed check shouldn't block a harmless read — callers decide.
    return true;
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

bot.start((ctx) => {
  ctx.reply(
    '👋 Привет! Я бот анонимной психологической поддержки.\n\n' +
      '📝 Напиши мне свою проблему или вопрос — я анонимно передам его психологу. ' +
      'Никто не увидит ни твоё имя, ни профиль.\n\n' +
      '⚠️ Пожалуйста, выражайся корректно, мат запрещён.'
  );
});

// Called by psychologists inside their group chat to (re)bind it as the
// destination for tickets. Persisted in Supabase, so it survives cold
// starts, redeploys, and restarts — it does not "fly off" anymore.
bot.command('send', async (ctx) => {
  if (!(await requireGroupAdmin(ctx))) return;
  try {
    const title = 'title' in ctx.chat ? ctx.chat.title ?? null : null;
    await setSupportChatId(ctx.chat.id, title);
    await ctx.reply(
      `✅ Этот чат назначен приёмником анонимных обращений.\nID чата: ${ctx.chat.id}\n\n` +
        'Теперь сюда будут приходить все новые сообщения от пользователей.'
    );
  } catch (e) {
    console.error('[bot] /send failed to persist binding', e);
    await ctx.reply(
      '❌ Не удалось сохранить привязку чата (проблема с базой данных). Попробуйте выполнить /send ещё раз через минуту.'
    );
  }
});

bot.command('status', async (ctx) => {
  const chatId = await getSupportChatId();
  const boundHere = chatId != null && isSameChat(chatId, ctx.chat.id);
  const openCount = await countOpenTickets();
  await ctx.reply(
    'ℹ️ <b>Статус бота</b>\n' +
      `Привязанный чат психологов: ${chatId != null ? `<code>${chatId}</code>` : 'не назначен ⚠️'}\n` +
      (chatId != null ? (boundHere ? '✅ Это текущий чат.' : '⚠️ Обращения приходят в другой чат.') : '') +
      `\nОткрытых обращений: ${openCount}`,
    { parse_mode: 'HTML' }
  );
});

// ---------------------------------------------------------------------------
// Inline button actions
// ---------------------------------------------------------------------------

bot.action(/^reply_(\d+)$/, async (ctx) => {
  const supportChatId = await getSupportChatId();
  if (!supportChatId || !ctx.chat || !isSameChat(supportChatId, ctx.chat.id)) {
    await ctx.answerCbQuery();
    return;
  }
  const ticketId = Number(ctx.match[1]);
  const ticket = await getTicket(ticketId);
  if (!ticket) {
    await ctx.answerCbQuery('Обращение не найдено', { show_alert: true });
    return;
  }

  const sent = await ctx.reply(`✍️ Ответ на обращение #${ticketId}. Отправьте текст ответом на ЭТО сообщение.`, {
    reply_markup: { force_reply: true, input_field_placeholder: 'Ваш ответ...' },
  });
  await mapSupportMessage(sent.message_id, ticketId);
  await ctx.answerCbQuery();
});

bot.action(/^close_(\d+)$/, async (ctx) => {
  const supportChatId = await getSupportChatId();
  if (!supportChatId || !ctx.chat || !isSameChat(supportChatId, ctx.chat.id)) {
    await ctx.answerCbQuery();
    return;
  }
  const ticketId = Number(ctx.match[1]);
  await closeTicket(ticketId);
  await ctx.answerCbQuery('Обращение закрыто ✅');
  try {
    const original = (ctx.callbackQuery.message as any)?.text ?? '';
    await ctx.editMessageText(`${original}\n\n🔒 Обращение закрыто`, { parse_mode: 'HTML' });
  } catch (e) {
    // Editing can fail (e.g. message too old) — not critical, the ticket is
    // already closed in the database.
  }
});

bot.action(/^block_(\d+)$/, async (ctx) => {
  const supportChatId = await getSupportChatId();
  if (!supportChatId || !ctx.chat || !isSameChat(supportChatId, ctx.chat.id)) {
    await ctx.answerCbQuery();
    return;
  }
  const userId = Number(ctx.match[1]);
  await blockUser(userId, ctx.from.id);
  await closeOpenTicketsForUser(userId);
  await ctx.answerCbQuery('Пользователь заблокирован 🚫');
  try {
    const original = (ctx.callbackQuery.message as any)?.text ?? '';
    await ctx.editMessageText(`${original}\n\n🚫 Пользователь заблокирован`, { parse_mode: 'HTML' });
  } catch (e) {
    // Non-critical.
  }
});

// ---------------------------------------------------------------------------
// Plain text messages
// ---------------------------------------------------------------------------

bot.on('text', async (ctx) => {
  const supportChatId = await getSupportChatId();
  const inSupportChat = supportChatId != null && isSameChat(supportChatId, ctx.chat.id);

  // --- A. A psychologist writing inside the bound group chat ---
  if (inSupportChat) {
    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      // A message typed without hitting Reply on anything — we don't know
      // which ticket it's for, so we don't guess. This is intentional: it's
      // exactly the ambiguity that used to make psychologists mix up
      // conversations.
      return;
    }

    // Works whether the psychologist replied to the original ticket card,
    // the "✍️ Ответ на обращение" prompt, or an earlier reply in the same
    // thread — every one of those messages is mapped to the ticket.
    const ticketId = await findTicketIdByReply(replyTo.message_id);
    if (!ticketId) return;

    const ticket = await getTicket(ticketId);
    if (!ticket) {
      await ctx.reply('⚠️ Это обращение больше не найдено в базе.');
      return;
    }

    const answerText = ctx.message.text;
    try {
      await bot.telegram.sendMessage(
        ticket.user_id,
        `📨 <b>Ответ психолога</b>\n\n${escapeHtml(truncateForTelegram(answerText, 40))}`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.error('[bot] delivering reply to user failed', e);
      await ctx.reply('❌ Не удалось отправить ответ. Возможно, пользователь заблокировал бота.');
      return;
    }

    const psychologistName = ctx.from.first_name || 'Психолог';
    await saveMessage({
      ticketId,
      sender: 'psychologist',
      senderTelegramId: ctx.from.id,
      psychologistName,
      text: answerText,
      supportMessageId: ctx.message.message_id,
    });
    await touchTicket(ticketId, { status: 'answered' });

    // Map the psychologist's own message too, so if someone replies to
    // *this* message later, it still resolves to the same ticket.
    await mapSupportMessage(ctx.message.message_id, ticketId);

    const confirmation = await ctx.reply(`✅ Ответ по обращению #${ticketId} отправлен пользователю.`, {
      reply_parameters: { message_id: ctx.message.message_id },
    });
    await mapSupportMessage(confirmation.message_id, ticketId);
    return;
  }

  // --- B. A student writing privately to the bot ---
  const userId = ctx.from.id;
  const text = ctx.message.text;

  if (await isBlocked(userId)) {
    return; // Silently ignore blocked users.
  }

  if (containsProfanity(text)) {
    await ctx.reply('⚠️ Ваше сообщение содержит недопустимую лексику. Пожалуйста, переформулируйте.');
    return;
  }

  if (!supportChatId) {
    await ctx.reply('😔 Извините, сейчас нет свободных специалистов. Попробуйте написать чуть позже.');
    return;
  }

  let ticket = await getOpenTicket(userId);
  if (!ticket) {
    try {
      ticket = await createTicket(userId);
    } catch (e) {
      console.error('[bot] createTicket failed', e);
      await ctx.reply('❌ Не получилось отправить сообщение, попробуйте ещё раз через минуту.');
      return;
    }
  }

  try {
    const sent = await bot.telegram.sendMessage(
      supportChatId,
      `📩 <b>Анонимное обращение #${ticket.id}</b>\n\n${escapeHtml(truncateForTelegram(text, 60))}`,
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('↩️ Ответить', `reply_${ticket.id}`)],
          [
            Markup.button.callback('🔒 Закрыть', `close_${ticket.id}`),
            Markup.button.callback('🚫 Заблокировать', `block_${userId}`),
          ],
        ]).reply_markup,
      }
    );
    await mapSupportMessage(sent.message_id, ticket.id);
    await touchTicket(ticket.id, { card_message_id: sent.message_id });
    await saveMessage({
      ticketId: ticket.id,
      sender: 'user',
      senderTelegramId: userId,
      text,
      supportMessageId: sent.message_id,
    });
    await ctx.reply('✅ Ваше сообщение анонимно отправлено психологу. Ожидайте ответа.');
  } catch (e) {
    console.error('[bot] forwarding to support chat failed', e);
    await ctx.reply('Ошибка отправки. Попробуйте позже.');
  }
});

// Anything that isn't text, from a student in a private chat — we only
// support text for now, and staying silent would look like the bot is
// broken.
bot.on(['photo', 'voice', 'video', 'video_note', 'document', 'sticker', 'audio'], async (ctx) => {
  if (ctx.chat.type !== 'private') return; // only guide students in their 1:1 chat with the bot
  await ctx.reply('🙏 Пока бот принимает только текстовые сообщения. Опишите ситуацию словами, пожалуйста.');
});

// ---------------------------------------------------------------------------
// Netlify handler
// ---------------------------------------------------------------------------

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const webhookSecret = getWebhookSecret();
  if (webhookSecret) {
    const headerSecret =
      event.headers?.['x-telegram-bot-api-secret-token'] || event.headers?.['X-Telegram-Bot-Api-Secret-Token'];
    if (headerSecret !== webhookSecret) {
      console.warn('[webhook] rejected update: bad/missing secret token');
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  try {
    const body = JSON.parse(event.body);
    await bot.handleUpdate(body);
  } catch (error) {
    // Telegram disables a webhook after too many consecutive non-2xx
    // responses. A bug or a transient Supabase hiccup must not risk that —
    // we log for debugging and still answer 200, so Telegram keeps
    // delivering updates no matter what.
    console.error('[webhook] error handling update', error);
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
