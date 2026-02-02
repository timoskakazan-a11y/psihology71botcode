import React, { useState } from 'react';

// --- CONFIG ---
const BOT_TOKEN = "8477534798:AAHb2ngDjS8QpjCkaFpGhFuOeSgb3ozjXy4";

// --- ICONS ---
const Icons = {
  Heart: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
  Link: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
};

const App: React.FC = () => {
  const [isSettingHook, setIsSettingHook] = useState(false);

  const handleSetWebhook = async () => {
    setIsSettingHook(true);
    try {
      const webhookUrl = `${window.location.origin}/.netlify/functions/webhook`;
      const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
      
      const res = await fetch(apiUrl);
      const data = await res.json();
      
      if (data.ok) {
        alert(`✅ Бот подключен успешно!\nURL: ${webhookUrl}\n\nТеперь:\n1. Добавьте бота в чат психологов.\n2. Напишите там /send.`);
      } else {
        alert(`❌ Ошибка Telegram: ${data.description}`);
      }
    } catch (e: any) {
      alert(`Ошибка сети: ${e.message}`);
    }
    setIsSettingHook(false);
  };

  return (
    <div className="min-h-screen bg-rose-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-rose-100">
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-rose-200">
                    <Icons.Heart />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">PsychoSupport Bot</h1>
                <p className="text-slate-500 text-center mt-2 text-sm">
                    Система обработки анонимных обращений для психологической помощи.
                </p>
            </div>

            <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-600">
                    <p className="font-semibold mb-2">Инструкция:</p>
                    <ol className="list-decimal list-inside space-y-1">
                        <li>Нажмите кнопку ниже, чтобы соединить бота с сервером.</li>
                        <li>Добавьте бота в <b>Группу Психологов</b>.</li>
                        <li>Напишите в группе команду <code>/send</code>.</li>
                        <li>Бот начнет пересылать туда сообщения пользователей.</li>
                    </ol>
                </div>

                <button 
                    onClick={handleSetWebhook}
                    disabled={isSettingHook}
                    className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-rose-500/30 flex items-center justify-center gap-2"
                >
                    {isSettingHook ? 'Подключение...' : (
                        <>
                            <Icons.Link /> Подключить Webhook
                        </>
                    )}
                </button>
            </div>
            
            <div className="mt-8 text-center text-xs text-slate-400">
                Token: ...{BOT_TOKEN.slice(-5)}
            </div>
        </div>
    </div>
  );
};

export default App;
