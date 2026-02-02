import { Telegraf, Markup } from 'telegraf';

const BOT_TOKEN = "8477534798:AAHb2ngDjS8QpjCkaFpGhFuOeSgb3ozjXy4";
const bot = new Telegraf(BOT_TOKEN);

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { target_chat_id, message, buttons } = body;

    if (!target_chat_id || !message) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing chat ID or message text' }) };
    }

    // Prepare keyboard
    let keyboard: any = undefined;
    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
      const validButtons = buttons.filter((b: any) => b.label && b.url);
      if (validButtons.length > 0) {
        const buttonRows = validButtons.map((b: any) => [Markup.button.url(b.label, b.url)]);
        keyboard = Markup.inlineKeyboard(buttonRows);
      }
    }

    await bot.telegram.sendMessage(target_chat_id, message, {
      parse_mode: 'HTML',
      ...keyboard
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error: any) {
    console.error('Publish error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.description || error.message || 'Failed to send post' }) };
  }
};