import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { sendPhoneOTP, verifyPhoneOTP, signOut, getCurrentUserId, backupToCloud, restoreFromCloud } from '../services/auth';
import { exportAllData, importData } from '../services/database';

interface Props {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = useState(false);

  // 检查登录状态
  React.useEffect(() => {
    getCurrentUserId().then(setUserId);
  }, []);

  const handleSendOTP = async () => {
    if (!phone.trim()) { Alert.alert('请输入手机号'); return; }
    setBusy(true);
    const { error } = await sendPhoneOTP(`+86${phone.trim()}`);
    setBusy(false);
    if (error) { Alert.alert('发送失败', error); }
    else { setStep('otp'); Alert.alert('已发送', '请输入验证码'); }
  };

  const handleVerify = async () => {
    if (!otp.trim()) { Alert.alert('请输入验证码'); return; }
    setBusy(true);
    const { error, userId: uid } = await verifyPhoneOTP(`+86${phone.trim()}`, otp.trim());
    setBusy(false);
    if (error) { Alert.alert('验证失败', error); }
    else { setUserId(uid || null); setShowLogin(false); Alert.alert('登录成功'); }
  };

  const handleBackup = async () => {
    setBusy(true);
    try {
      const { lists, items } = await exportAllData();
      const { error } = await backupToCloud(lists, items);
      if (error) throw new Error(error);
      Alert.alert('备份成功', '数据已安全存储到云端');
    } catch (e: any) {
      Alert.alert('备份失败', e.message);
    }
    setBusy(false);
  };

  const handleRestore = () => {
    Alert.alert('恢复数据', '将从云端恢复数据，覆盖本地现有内容。确定继续？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定恢复',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const { lists, items, error } = await restoreFromCloud();
            if (error) throw new Error(error);
            if (lists.length === 0) { Alert.alert('提示', '云端暂无备份数据'); setBusy(false); return; }
            await importData(lists, items);
            Alert.alert('恢复成功', '数据已从云端恢复');
          } catch (e: any) {
            Alert.alert('恢复失败', e.message);
          }
          setBusy(false);
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          setUserId(null);
        },
      },
    ]);
  };

  return (
    <View style={ss.root}>
      <View style={ss.bg} />

      <View style={ss.safeArea}>
        <View style={ss.header}>
          <TouchableOpacity onPress={onBack} style={ss.backBtn}>
            <Text style={ss.backText}>←</Text>
          </TouchableOpacity>
          <Text style={ss.headerTitle}>设置</Text>
          <View style={ss.backBtn} />
        </View>

        <View style={ss.content}>
          {/* 账号区 */}
          <View style={ss.section}>
            <Text style={ss.sectionTitle}>账号</Text>
            {userId ? (
              <View style={ss.row}>
                <View style={ss.userInfo}>
                  <Text style={ss.userIcon}>👤</Text>
                  <View>
                    <Text style={ss.userLabel}>已登录</Text>
                    <Text style={ss.userId} numberOfLines={1}>{userId}</Text>
                  </View>
                </View>
                <TouchableOpacity style={ss.logoutBtn} onPress={handleLogout}>
                  <Text style={ss.logoutText}>退出</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={ss.loginBtn}
                onPress={() => { setShowLogin(true); setStep('phone'); setPhone(''); setOtp(''); }}
              >
                <Text style={ss.loginBtnText}>手机号登录</Text>
                <Text style={ss.loginHint}>登录后可备份与恢复数据</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 数据区 */}
          <View style={ss.section}>
            <Text style={ss.sectionTitle}>数据管理</Text>
            <TouchableOpacity
              style={[ss.actionBtn, busy && ss.actionBtnDisabled]}
              onPress={handleBackup}
              disabled={busy}
            >
              <Text style={ss.actionBtnText}>📤 备份到云端</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ss.actionBtn, busy && ss.actionBtnDisabled]}
              onPress={handleRestore}
              disabled={busy}
            >
              <Text style={ss.actionBtnText}>📥 从云端恢复</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 登录弹窗 */}
      {showLogin && (
        <View style={ss.loginOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={ss.loginModal}>
              <Text style={ss.loginTitle}>手机号登录</Text>
              {step === 'phone' ? (
                <>
                  <TextInput
                    style={ss.loginInput}
                    placeholder="输入手机号"
                    placeholderTextColor="#B2BEC3"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    maxLength={11}
                  />
                  <TouchableOpacity style={ss.loginActionBtn} onPress={handleSendOTP} disabled={busy}>
                    <Text style={ss.loginActionText}>{busy ? '发送中...' : '获取验证码'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={ss.phoneHint}>已发送验证码至 +86 {phone}</Text>
                  <TextInput
                    style={ss.loginInput}
                    placeholder="输入验证码"
                    placeholderTextColor="#B2BEC3"
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                    maxLength={6}
                  />
                  <TouchableOpacity style={ss.loginActionBtn} onPress={handleVerify} disabled={busy}>
                    <Text style={ss.loginActionText}>{busy ? '验证中...' : '验证登录'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setStep('phone')}>
                    <Text style={ss.backToPhone}>重新输入手机号</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity onPress={() => setShowLogin(false)}>
                <Text style={ss.loginCancel}>取消</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8ECF1' },
  bg: { ...StyleSheet.absoluteFillObject },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 12,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.65)',
  },
  backBtn: { width: 36, height: 36 },
  backText: { fontSize: 20, color: '#2D3436', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#2D3436' },
  content: { flex: 1, padding: 20 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#7A8A9E', marginBottom: 10, letterSpacing: 1 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, padding: 16,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userIcon: { fontSize: 28 },
  userLabel: { fontSize: 15, fontWeight: '600', color: '#2D3436' },
  userId: { fontSize: 11, color: '#7A8A9E', maxWidth: 160 },
  logoutBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.06)' },
  logoutText: { fontSize: 13, fontWeight: '600', color: '#636E72' },
  loginBtn: {
    backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, padding: 20, alignItems: 'center',
  },
  loginBtnText: { fontSize: 17, fontWeight: '700', color: '#2D3436' },
  loginHint: { fontSize: 12, color: '#7A8A9E', marginTop: 4 },
  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 14, padding: 16, marginBottom: 8,
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { fontSize: 15, fontWeight: '600', color: '#2D3436' },
  // Login modal
  loginOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  loginModal: {
    backgroundColor: '#F5F0EB', borderRadius: 24, padding: 28, width: 300,
    alignItems: 'center',
  },
  loginTitle: { fontSize: 20, fontWeight: '800', color: '#2D3436', marginBottom: 20 },
  loginInput: {
    backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: 14,
    fontSize: 16, color: '#2D3436', width: '100%', textAlign: 'center', marginBottom: 12,
  },
  phoneHint: { fontSize: 12, color: '#7A8A9E', marginBottom: 12 },
  loginActionBtn: {
    backgroundColor: '#2D3436', borderRadius: 12, paddingVertical: 14, width: '100%', alignItems: 'center',
    marginBottom: 12,
  },
  loginActionText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  backToPhone: { fontSize: 13, color: '#636E72', marginBottom: 8 },
  loginCancel: { fontSize: 14, color: '#7A8A9E', marginTop: 8, fontWeight: '500' },
});