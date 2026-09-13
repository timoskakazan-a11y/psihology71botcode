import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './config';

// A single shared client per warm serverless instance. We deliberately use
// the service role key (server-side only!) because this bot is the only
// writer/reader of its tables and RLS on them has no policies at all —
// only the service role can touch them.
//
// No generated `Database` type is wired up (this is a small, hand-rolled
// schema — see the migration applied via the Supabase MCP tool), so the
// client is intentionally untyped (`any`) rather than fighting the default
// `never` row types that come from a schema-less generic.
let client: SupabaseClient<any, any, any> | null = null;

export function getSupabase(): SupabaseClient<any, any, any> {
  if (!client) {
    client = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
