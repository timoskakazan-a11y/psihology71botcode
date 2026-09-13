// Sets the Telegram webhook server-side, using the bot token from env vars.
// This replaces the old approach where the token was hardcoded directly in
// the client-side React bundle (App.tsx) — which shipped the secret to
// every visitor's browser. Now the browser never sees the token at all.
import { getBotToken, getWebhookSecret } from '../lib/config';

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const body = JSON.parse(event.body || '{}');
    const webhookUrl = body.webhookUrl;
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ ok: false, description: 'Missing webhookUrl' }) };
    }

    const token = getBotToken();
    const secret = getWebhookSecret();

    const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        ...(secret ? { secret_token: secret } : {}),
      }),
    });
    const data = await res.json();

    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (error: any) {
    console.error('Setup/setWebhook error:', error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, description: error.message || 'Failed' }) };
  }
};
