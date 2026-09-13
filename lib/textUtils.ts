// --- HTML escaping ---
// Telegram messages below are sent with parse_mode: 'HTML'. User/psychologist
// text is interpolated into that HTML, so it MUST be escaped — otherwise a
// message containing "<" or "&" makes Telegram reject the whole call
// ("can't parse entities") and the message silently never arrives. This was
// a real, hard-to-notice cause of "messages sometimes don't get through".
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Telegram hard-caps messages at 4096 UTF-16 code units. Our templates add a
// header on top of the raw user text, so truncate defensively instead of
// letting sendMessage throw and drop the message entirely.
const TELEGRAM_MAX_LENGTH = 4096;

export function truncateForTelegram(text: string, reserved: number): string {
  const limit = Math.max(0, TELEGRAM_MAX_LENGTH - reserved - 20);
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '…';
}

// --- Profanity filter ---
// Simple substring filter with a bit of normalisation so trivial evasion
// (spaces/dots/dashes between letters, look-alike characters) doesn't
// trivially bypass it. It's intentionally not a full anti-evasion engine.
const BAD_WORDS = [
  'бля', 'сука', 'хуй', 'хуе', 'хуё', 'пизд', 'ебат', 'еба ', 'ебал', 'ебан',
  'хер', 'мудак', 'мудил', 'гандон', 'гондон', 'долбо', 'ублюд', 'сволоч',
  'fuck', 'shit', 'bitch', 'asshole',
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,\-_*'"`~!?()\[\]{}\s]+/g, '')
    // common look-alike substitutions
    .replace(/0/g, 'о')
    .replace(/1/g, 'i')
    .replace(/3/g, 'з')
    .replace(/4/g, 'ч')
    .replace(/@/g, 'а');
}

export function containsProfanity(text: string): boolean {
  const normalized = normalize(text);
  const lowerRaw = text.toLowerCase();
  return BAD_WORDS.some((word) => lowerRaw.includes(word) || normalized.includes(word.replace(/\s/g, '')));
}
