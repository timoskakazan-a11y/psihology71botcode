import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Telegraf, Markup } from 'telegraf';
import { getBotToken } from '../lib/config';

const bot = new Telegraf(getBotToken());

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { target_chat_id, message, buttons } = body || {};

    if (!target_chat_id || !message) {
      res.status(400).json({ error: 'Missing chat ID or message text' });
      return;
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
      ...keyboard,
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Publish error:', error);
    res.status(500).json({ error: error.description || error.message || 'Failed to send post' });
  }
}
