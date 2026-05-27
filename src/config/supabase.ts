import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kbkvdsavgsiikscqengi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__eEKJReopqi6U5BgrySAog_8jNrhJWc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);