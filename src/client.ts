import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)."
  );
}

// Lessons/lesson_applications have RLS enabled with no anon/authenticated
// policies (see the init_lesson_schema migration), so this backend client
// always uses the service role, which bypasses RLS.
export const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
