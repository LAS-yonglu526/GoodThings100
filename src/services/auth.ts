import { supabase } from '../config/supabase';

/**
 * 发送邮箱验证码
 */
export async function sendEmailOTP(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) return { error: error.message };
  return {};
}

/**
 * 验证邮箱 OTP 并登录
 */
export async function verifyEmailOTP(
  email: string,
  token: string
): Promise<{ error?: string; userId?: string }> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return { error: error.message };
  return { userId: data.user?.id };
}

/**
 * 退出登录
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * 获取当前登录用户
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * 备份本地数据到 Supabase
 */
export async function backupToCloud(
  lists: any[],
  items: any[]
): Promise<{ error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { error: '未登录' };

  // 删除该用户旧数据
  await supabase.from('user_lists').delete().eq('user_id', userId);
  await supabase.from('user_items').delete().eq('user_id', userId);

  // 插入 lists
  if (lists.length > 0) {
    const listsPayload = lists.map((l) => ({
      ...l,
      user_id: userId,
    }));
    const { error: listsErr } = await supabase.from('user_lists').insert(listsPayload);
    if (listsErr) return { error: listsErr.message };
  }

  // 插入 items
  if (items.length > 0) {
    const itemsPayload = items.map((i) => ({
      ...i,
      user_id: userId,
    }));
    const { error: itemsErr } = await supabase.from('user_items').insert(itemsPayload);
    if (itemsErr) return { error: itemsErr.message };
  }

  return {};
}

/**
 * 从 Supabase 恢复数据
 */
export async function restoreFromCloud(): Promise<{
  lists: any[];
  items: any[];
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) return { lists: [], items: [], error: '未登录' };

  const { data: lists, error: listsErr } = await supabase
    .from('user_lists')
    .select('*')
    .eq('user_id', userId);

  if (listsErr) return { lists: [], items: [], error: listsErr.message };

  const { data: items, error: itemsErr } = await supabase
    .from('user_items')
    .select('*')
    .eq('user_id', userId);

  if (itemsErr) return { lists: [], items: [], error: itemsErr.message };

  // 去掉 user_id 字段再返回
  return {
    lists: (lists || []).map(({ user_id, ...rest }) => rest),
    items: (items || []).map(({ user_id, ...rest }) => rest),
  };
}