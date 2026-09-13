// Centralised environment configuration.
//
// IMPORTANT: the bot token and Supabase service role key are SECRETS.
// They must only ever live in Netlify environment variables (Site settings
// → Environment variables), never hardcoded in source and never shipped to
// the browser. Set them once per site:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_WEBHOOK_SECRET   (optional but recommended)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Отсутствует переменная окружения ${name}. Задайте её в настройках Netlify (Site configuration → Environment variables) и передеплойте сайт.`
    );
  }
  return value;
}

export function getBotToken(): string {
  return required('TELEGRAM_BOT_TOKEN');
}

export function getWebhookSecret(): string | undefined {
  return process.env.TELEGRAM_WEBHOOK_SECRET || undefined;
}

export function getSupabaseUrl(): string {
  return required('SUPABASE_URL');
}

export function getSupabaseServiceRoleKey(): string {
  return required('SUPABASE_SERVICE_ROLE_KEY');
}
