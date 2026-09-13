// Sets the Telegram webhook server-side, using the bot token from env vars.
// This replaces the old approach where the token was hardcoded directly in
// the client-side React bundle (App.tsx) — which shipped the secret to
// every visitor's browser. Now the browser never sees the token at all.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBotToken, getWebhookSecret } from '../lib/config';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const webhookUrl = body?.webhookUrl;
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      res.status(400).json({ ok: false, description: 'Missing webhookUrl' });
      return;
    }

    const token = getBotToken();
    const secret = getWebhookSecret();

    const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;
    const tgRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        ...(secret ? { secret_token: secret } : {}),
      }),
    });
    const data = await tgRes.json();

    res.status(200).json(data);
  } catch (error: any) {
    console.error('Setup/setWebhook error:', error);
    res.status(500).json({ ok: false, description: error.message || 'Failed' });
  }
}
