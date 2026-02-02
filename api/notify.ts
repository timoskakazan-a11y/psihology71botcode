import { Telegraf } from 'telegraf';

const BOT_TOKEN = "8477534798:AAHb2ngDjS8QpjCkaFpGhFuOeSgb3ozjXy4";
const bot = new Telegraf(BOT_TOKEN);

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const body = JSON.parse(event.body);
    const { telegram_id, message } = body;

    if (!telegram_id || !message) {
      return { statusCode: 400, body: 'Missing fields' };
    }

    await bot.telegram.sendMessage(telegram_id, message, { parse_mode: 'HTML' });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Notify error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed' }) };
  }
};