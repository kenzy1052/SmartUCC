import { createClient } from '@supabase/supabase-js';
import { BackendEnvConfig } from '../config/env.ts';
import { BackendGateway } from './gateway.ts';
import { SupabaseBackendGateway } from './supabaseGateway.ts';
import { LocalPostgresBackendGateway } from './localPostgresGateway.ts';

/**
 * Chooses the backend for the Express server.
 *
 *  - Supabase configured: uses the live Supabase project. No accounts, exams or
 *    cohorts are created automatically; the database must already have the
 *    migrations applied.
 *  - Supabase not configured: embedded local database with demo data, for local
 *    development only. Refused in production so a missing .env can never expose
 *    demo accounts.
 */
export async function createRuntimeGateway(
  envConfig: BackendEnvConfig,
  localDataDir: string
): Promise<BackendGateway> {
  if (!envConfig.isSupabaseConfigured || !envConfig.supabaseUrl || !envConfig.supabasePublicKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).'
      );
    }
    console.warn(
      'Supabase is not configured: running on the embedded local demo database (development only).'
    );
    return LocalPostgresBackendGateway.create({
      dataDir: localDataDir,
      seedDemoData: true,
    });
  }

  const probeKey = envConfig.supabaseServiceRoleKey ?? envConfig.supabasePublicKey;
  const probe = createClient(envConfig.supabaseUrl, probeKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await probe.from('profiles').select('id').limit(1);
  if (error) {
    throw new Error(
      `Supabase is configured but the database is not ready (${error.message}). Run the SQL files in the database folder (01 to 14) in order, one at a time, in the Supabase SQL Editor, then restart.`
    );
  }

  return new SupabaseBackendGateway(envConfig);
}
