import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kbkvdsavgsiikscqengi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__eEKJReopqi6U5BgrySAog_8jNrhJWc';

// 默认 AsyncStorage：Supabase session token 超过 SecureStore 2048 字节限制
// 恢复用 AsyncStorage 存大 token，SecureStore 只用于 app 层小数据（账号列表/缓存）
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});