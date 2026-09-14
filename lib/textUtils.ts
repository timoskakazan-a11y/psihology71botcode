import type { MessageEntity } from 'telegraf/types';

// --- HTML escaping ---
// Used for our own admin-facing text (e.g. /status) that's still sent with
// parse_mode: 'HTML'. Not used for relayed student/psychologist text
// anymore — see withBoldHeader below for why.
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

// --- Rich formatting relay ---
//
// Telegram clients let people type **bold**, __italic__, spoilers, quotes,
// links etc. directly while composing a message, and the message arrives at
// the bot as plain `text` plus a separate `entities` array describing where
// each style applies. Our old code discarded that array entirely and
// HTML-escaped the raw text, so any formatting a student or psychologist
// used was silently stripped by the time it reached the other side. Passing
// the original entities straight through to sendMessage (instead of
// re-encoding to HTML/MarkdownV2 ourselves) preserves it exactly, with no
// escaping to get wrong.
//
// One entity type doesn't survive the trip: Telegram only lets bots relay
// `custom_emoji` entities (the ones behind Telegram Premium's animated/
// custom emoji picker) if the bot itself has bought a distinctive username
// on Fragment — ours hasn't. We drop just that entity and keep the rest;
// the message still shows the ordinary emoji character the custom entity
// was wrapping, it just won't render with the sender's custom emoji skin.
export interface FormattedBody {
  text: string;
  entities?: MessageEntity[];
}

function stripUnsupportedEntities(entities: MessageEntity[] | undefined): MessageEntity[] {
  if (!entities) return [];
  return entities.filter((e) => e.type !== 'custom_emoji');
}

function clipEntitiesToLength(entities: MessageEntity[], maxLength: number): MessageEntity[] {
  const clipped: MessageEntity[] = [];
  for (const e of entities) {
    if (e.offset >= maxLength) continue;
    const end = Math.min(e.offset + e.length, maxLength);
    if (end <= e.offset) continue;
    clipped.push({ ...e, length: end - e.offset });
  }
  return clipped;
}

// Truncates long text defensively (see truncateForTelegram) while keeping
// entity ranges valid against the shortened text.
export function truncateWithEntities(body: FormattedBody, reserved: number): FormattedBody {
  const limit = Math.max(0, TELEGRAM_MAX_LENGTH - reserved - 20);
  const entities = stripUnsupportedEntities(body.entities);
  if (body.text.length <= limit) return { text: body.text, entities };
  return { text: body.text.slice(0, limit) + '…', entities: clipEntitiesToLength(entities, limit) };
}

// Prepends a bold header (rendered by us, not the sender) to a formatted
// body, shifting the body's entities to account for the header's length.
export function withBoldHeader(header: string, body: FormattedBody): { text: string; entities: MessageEntity[] } {
  const separator = '\n\n';
  const offset = header.length + separator.length;
  const shifted = stripUnsupportedEntities(body.entities).map((e) => ({ ...e, offset: e.offset + offset }));
  return {
    text: header + separator + body.text,
    entities: [{ type: 'bold', offset: 0, length: header.length }, ...shifted],
  };
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
