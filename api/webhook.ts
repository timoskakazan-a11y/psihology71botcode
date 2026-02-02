import { Telegraf, Markup } from 'telegraf';

// --- CONFIGURATION ---
const BOT_TOKEN = "8477534798:AAHb2ngDjS8QpjCkaFpGhFuOeSgb3ozjXy4";

const bot = new Telegraf(BOT_TOKEN);

// --- IN-MEMORY STATE (Serverless Limitation: Resets on cold start) ---
// В реальном продакшене это нужно хранить в базе данных.
let SUPPORT_CHAT_ID: string | number | null = null;
const BLOCKED_USERS = new Set<number>();

// --- PROFANITY FILTER ---
const BAD_WORDS = ['бля', 'сука', 'хуй', 'пизд', 'ебат', 'хер', 'мудак', 'гандон', 'fuck', 'shit'];

function containsProfanity(text: string): boolean {
    const lowerText = text.toLowerCase();
    return BAD_WORDS.some(word => lowerText.includes(word));
}

// --- COMMANDS ---

bot.start((ctx) => {
    ctx.reply(`👋 Привет! Я бот психологической поддержки.\n\n📝 Напиши мне свою проблему или вопрос, и я передам его специалисту.\n\n⚠️ Пожалуйста, выражайся корректно, мат запрещен.`);
});

// Команда для психологов: установить этот чат как приемник заявок
bot.command('send', (ctx) => {
    SUPPORT_CHAT_ID = ctx.chat.id;
    ctx.reply(`✅ Чат установлен как приемник заявок.\nID: ${SUPPORT_CHAT_ID}\n\nТеперь сообщения от пользователей будут приходить сюда.`);
});

// --- ACTIONS (BUTTONS) ---

// 1. Блокировка пользователя
bot.action(/^block_(\d+)$/, async (ctx) => {
    if (!SUPPORT_CHAT_ID || ctx.chat?.id.toString() !== SUPPORT_CHAT_ID.toString()) return;
    
    const userId = parseInt(ctx.match[1]);
    BLOCKED_USERS.add(userId);
    
    await ctx.answerCbQuery("Пользователь заблокирован 🚫");
    await ctx.editMessageText(`${ctx.callbackQuery.message?.text}\n\n❌ [Пользователь заблокирован]`, {
        parse_mode: 'Markdown'
    });
});

// 2. Начало ответа (ForceReply)
bot.action(/^reply_(\d+)$/, async (ctx) => {
    if (!SUPPORT_CHAT_ID || ctx.chat?.id.toString() !== SUPPORT_CHAT_ID.toString()) return;
    
    const userId = ctx.match[1];
    // Получаем текст исходного обращения из сообщения бота (удаляем "📩 Новое обращение от...")
    const originalMsg = ctx.callbackQuery.message?.text || "";
    // Извлекаем "чистый" текст обращения (все после двоеточия и переноса строки)
    // Формат: "📩 Новое обращение от UserID:\nТекст"
    const content = originalMsg.split('\n').slice(1).join(' ').trim() || "обращение";

    // Отправляем сообщение с ForceReply, чтобы админ ответил на него
    // Мы кодируем ID юзера и превью текста в само сообщение, чтобы распарсить при ответе
    await ctx.reply(
        `✍️ Введите ответ для пользователя ${userId}.\n\nЦитата обращения: "${content.substring(0, 50)}..."`, 
        {
            reply_markup: { force_reply: true, input_field_placeholder: "Напишите ответ тут..." }
        }
    );
    await ctx.answerCbQuery();
});

// --- MESSAGE HANDLER ---

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    // A. ОБРАБОТКА ОТВЕТА ПСИХОЛОГА (Админ чат)
    if (SUPPORT_CHAT_ID && ctx.chat.id.toString() === SUPPORT_CHAT_ID.toString()) {
        const replyTo = ctx.message.reply_to_message;
        
        // Проверяем, что это ответ на запрос бота "Введите ответ..."
        if (replyTo && 'text' in replyTo && replyTo.from?.id === ctx.botInfo.id && replyTo.text?.startsWith('✍️ Введите ответ')) {
            
            // Парсим ID пользователя из первой строки: "✍️ Введите ответ для пользователя 12345."
            const idMatch = replyTo.text.match(/для пользователя (\d+)/);
            // Парсим цитату: Цитата обращения: "Текст..."
            const quoteMatch = replyTo.text.match(/Цитата обращения: "(.*)"/);

            if (idMatch) {
                const targetUserId = idMatch[1];
                const quote = quoteMatch ? quoteMatch[1] : "ваше сообщение";

                try {
                    // Отправляем красивый ответ пользователю
                    await ctx.telegram.sendMessage(targetUserId, 
                        `📨 <b>Ответ на твое обращение</b> <i>"${quote}"</i>\n\n` +
                        `Ниже ответ:\n` +
                        `✨ ${text}`, 
                        { parse_mode: 'HTML' }
                    );
                    await ctx.reply("✅ Ответ отправлен.");
                } catch (e) {
                    await ctx.reply("❌ Не удалось отправить ответ. Возможно, пользователь заблокировал бота.");
                }
            }
        }
        return; // Больше ничего не делаем в админ чате
    }

    // B. ОБРАБОТКА СООБЩЕНИЯ ПОЛЬЗОВАТЕЛЯ (Личка)

    // 1. Проверка блокировки
    if (BLOCKED_USERS.has(userId)) {
        return; // Игнорируем заблокированных
    }

    // 2. Фильтр мата
    if (containsProfanity(text)) {
        await ctx.reply("⚠️ Ваше сообщение содержит недопустимую лексику. Пожалуйста, переформулируйте.");
        return;
    }

    // 3. Проверка наличия чата поддержки
    if (!SUPPORT_CHAT_ID) {
        await ctx.reply("😔 Извините, сейчас нет свободных специалистов. Попробуйте позже.\n(Администратор еще не активировал чат командой /send)");
        return;
    }

    // 4. Пересылка в чат поддержки
    try {
        await ctx.telegram.sendMessage(SUPPORT_CHAT_ID, 
            `📩 <b>Новое обращение от</b> <a href="tg://user?id=${userId}">${ctx.from.first_name}</a> (ID: ${userId}):\n\n${text}`, 
            {
                parse_mode: 'HTML',
                reply_markup: Markup.inlineKeyboard([
                    Markup.button.callback("↩️ Ответить", `reply_${userId}`),
                    Markup.button.callback("🚫 Заблокировать", `block_${userId}`)
                ]).reply_markup
            }
        );
        await ctx.reply("✅ Ваше сообщение отправлено психологу. Ожидайте ответа.");
    } catch (e) {
        console.error("Forwarding error", e);
        await ctx.reply("Ошибка отправки. Попробуйте позже.");
    }
});

// --- NETLIFY HANDLER ---
export const handler = async (event: any) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    try {
        const body = JSON.parse(event.body);
        await bot.handleUpdate(body);
        return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) };
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed' }) };
    }
};
