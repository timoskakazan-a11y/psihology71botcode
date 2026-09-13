import { getSupabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// Everything here talks to Supabase. Two rules drive the design:
//
// 1. The support-chat binding (which Telegram chat receives tickets) is read
//    from the DB on every single incoming message — never cached in module
//    memory. Serverless functions can spin up many concurrent, independent
//    instances with their own empty memory, so an in-memory "SUPPORT_CHAT_ID"
//    variable (the old implementation) randomly appears unset depending on
//    which instance handles a request. Reading it fresh from Postgres every
//    time is what actually makes the binding durable.
//
// 2. A Supabase failure must never silently swallow a student's message.
//    Where a DB write is not on the critical path (saving a message for the
//    record, after it has already been delivered on Telegram), we log the
//    error and continue instead of throwing — the psychologist still gets
//    the message even if the archive write hiccups.
// ---------------------------------------------------------------------------

export type TicketStatus = 'open' | 'answered' | 'closed';

export interface Ticket {
  id: number;
  user_id: number;
  status: TicketStatus;
  card_message_id: number | null;
  created_at: string;
  last_message_at: string;
  closed_at: string | null;
}

async function selectSupportChatRow() {
  return getSupabase().from('psy_bot_settings').select('support_chat_id').eq('id', 1).maybeSingle();
}

// --- bot_settings (the support chat binding) ---

export async function getSupportChatId(): Promise<number | null> {
  try {
    let { data, error } = await selectSupportChatRow();
    if (error) {
      // A single retry covers the common transient case: the Supabase
      // project had gone idle/paused and the first request is what wakes
      // it back up.
      console.error('[db] getSupportChatId failed, retrying once', error);
      await new Promise((r) => setTimeout(r, 400));
      ({ data, error } = await selectSupportChatRow());
      if (error) throw error;
    }
    return data?.support_chat_id ?? null;
  } catch (err) {
    console.error('[db] getSupportChatId: giving up, treating as unset', err);
    return null;
  }
}

export async function setSupportChatId(chatId: number, title: string | null): Promise<void> {
  const { error } = await getSupabase()
    .from('psy_bot_settings')
    .upsert({ id: 1, support_chat_id: chatId, support_chat_title: title, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// --- welcome photo (sent with /start) ---
//
// Telegram lets you resend a file you already uploaded once by its file_id,
// instead of re-uploading the bytes — much faster and avoids pushing the
// full image on every single /start. We cache whichever file_id Telegram
// handed back the first time.

export async function getWelcomePhotoFileId(): Promise<string | null> {
  try {
    const { data, error } = await getSupabase()
      .from('psy_bot_settings')
      .select('welcome_photo_file_id')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return data?.welcome_photo_file_id ?? null;
  } catch (err) {
    console.error('[db] getWelcomePhotoFileId failed, will re-upload the image', err);
    return null;
  }
}

export async function setWelcomePhotoFileId(fileId: string): Promise<void> {
  const { error } = await getSupabase().from('psy_bot_settings').update({ welcome_photo_file_id: fileId }).eq('id', 1);
  if (error) console.error('[db] setWelcomePhotoFileId failed (will just re-upload next time)', error);
}

// --- blocked_users ---

export async function isBlocked(userId: number): Promise<boolean> {
  try {
    const { data, error } = await getSupabase()
      .from('psy_blocked_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (err) {
    console.error('[db] isBlocked check failed, defaulting to not-blocked', err);
    return false;
  }
}

export async function blockUser(userId: number, blockedBy: number): Promise<void> {
  const { error } = await getSupabase()
    .from('psy_blocked_users')
    .upsert({ user_id: userId, blocked_by: blockedBy, blocked_at: new Date().toISOString() });
  if (error) console.error('[db] blockUser failed', error);
}

// --- tickets ---

export async function getOpenTicket(userId: number): Promise<Ticket | null> {
  const { data, error } = await getSupabase()
    .from('psy_tickets')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[db] getOpenTicket failed', error);
    return null;
  }
  return (data as Ticket) ?? null;
}

export async function createTicket(userId: number): Promise<Ticket> {
  const { data, error } = await getSupabase()
    .from('psy_tickets')
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Ticket;
}

export async function getTicket(ticketId: number): Promise<Ticket | null> {
  const { data, error } = await getSupabase().from('psy_tickets').select('*').eq('id', ticketId).maybeSingle();
  if (error) {
    console.error('[db] getTicket failed', error);
    return null;
  }
  return (data as Ticket) ?? null;
}

export async function touchTicket(ticketId: number, patch: Partial<Ticket>): Promise<void> {
  const { error } = await getSupabase()
    .from('psy_tickets')
    .update({ ...patch, last_message_at: new Date().toISOString() })
    .eq('id', ticketId);
  if (error) console.error('[db] touchTicket failed', error);
}

export async function closeTicket(ticketId: number): Promise<void> {
  const { error } = await getSupabase()
    .from('psy_tickets')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', ticketId);
  if (error) console.error('[db] closeTicket failed', error);
}

export async function closeOpenTicketsForUser(userId: number): Promise<void> {
  const { error } = await getSupabase()
    .from('psy_tickets')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .neq('status', 'closed');
  if (error) console.error('[db] closeOpenTicketsForUser failed', error);
}

export async function countOpenTickets(): Promise<number> {
  const { count, error } = await getSupabase()
    .from('psy_tickets')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'closed');
  if (error) {
    console.error('[db] countOpenTickets failed', error);
    return 0;
  }
  return count ?? 0;
}

// --- messages (the archive/log — never blocks delivery) ---

export async function saveMessage(params: {
  ticketId: number;
  sender: 'user' | 'psychologist' | 'system';
  senderTelegramId?: number | null;
  psychologistName?: string | null;
  text: string;
  supportMessageId?: number | null;
}): Promise<void> {
  const { error } = await getSupabase().from('psy_messages').insert({
    ticket_id: params.ticketId,
    sender: params.sender,
    sender_telegram_id: params.senderTelegramId ?? null,
    psychologist_name: params.psychologistName ?? null,
    text: params.text,
    support_message_id: params.supportMessageId ?? null,
  });
  if (error) console.error('[db] saveMessage failed (delivery already happened, only the archive write failed)', error);
}

// --- message_map: resolves any bot message in the support chat back to a ticket ---

export async function mapSupportMessage(supportMessageId: number, ticketId: number): Promise<void> {
  const { error } = await getSupabase()
    .from('psy_message_map')
    .upsert({ support_message_id: supportMessageId, ticket_id: ticketId });
  if (error) console.error('[db] mapSupportMessage failed', error);
}

export async function findTicketIdByReply(supportMessageId: number): Promise<number | null> {
  const { data, error } = await getSupabase()
    .from('psy_message_map')
    .select('ticket_id')
    .eq('support_message_id', supportMessageId)
    .maybeSingle();
  if (error) {
    console.error('[db] findTicketIdByReply failed', error);
    return null;
  }
  return data?.ticket_id ?? null;
}
