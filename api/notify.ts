import { Telegraf } from 'telegraf';
import { getBotToken } from '../lib/config';

const bot = new Telegraf(getBotToken());

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
  } catch (error: any) {
    console.error('Notify error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || 'Failed' }) };
  }
};
