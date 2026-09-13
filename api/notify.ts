import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Telegraf } from 'telegraf';
import { getBotToken } from '../lib/config';

const bot = new Telegraf(getBotToken());

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { telegram_id, message } = body || {};

    if (!telegram_id || !message) {
      res.status(400).send('Missing fields');
      return;
    }

    await bot.telegram.sendMessage(telegram_id, message, { parse_mode: 'HTML' });

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Notify error:', error);
    res.status(500).json({ error: error.message || 'Failed' });
  }
}
