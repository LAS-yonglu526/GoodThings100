import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { TEMPLATES } from '../services/templates';

interface Props {
  visible: boolean;
  onAdd: (text: string) => void;
  onClose: () => void;
  currentCount: number;
  maxCount: number;
  existingItems: string[];
  themeKey?: string;
}

function pickItem(exclude: string[], themeKey?: string): string {
  const excludeSet = new Set(exclude.map(s => s.trim()));
  const all = Object.values(TEMPLATES).filter(t => t.items.length > 0);
  if (!all.length) return '';

  // 优先从当前主题模板抽取
  if (themeKey) {
    const themed = TEMPLATES[themeKey];
    if (themed && themed.items.length > 0) {
      const pool = themed.items.filter(item => !excludeSet.has(item));
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    }
  }

  // fallback: 从所有模板随机
  const t = all[Math.floor(Math.random() * all.length)];
  const pool = t.items.filter(item => !excludeSet.has(item));
  if (pool.length) return pool[Math.floor(Math.random() * pool.length)];

  const fallback = all[Math.floor(Math.random() * all.length)].items;
  return fallback[Math.floor(Math.random() * fallback.length)] || '';
}

export default function AddItemOverlay({ visible, onAdd, onClose, currentCount, maxCount, existingItems, themeKey }: Props) {
  const [text, setText] = useState('');
  const [isSuggested, setIsSuggested] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const [successAnim] = useState(() => new Animated.Value(0));
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(100)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      setIsSuggested(false);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start(() => inputRef.current?.focus());
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 100, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (!visible) return null;

  const triggerSuccess = () => {
    Animated.sequence([
      Animated.timing(successAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = () => {
    const val = text.trim();
    if (!val) { onClose(); return; }
    const isDup = existingItems.some(i => i.trim() === val);
    if (isDup) {
      Alert.alert('重复提醒', `「${val}」已存在于本列表中，确定仍然添加？`, [
        { text: '取消', style: 'cancel' },
        { text: '仍然添加', onPress: () => { onAdd(val); setText(''); setIsSuggested(false); triggerSuccess(); } },
      ]);
      return;
    }
    onAdd(val);
    setText('');
    setIsSuggested(false);
    triggerSuccess();
  };

  const handleSuggest = () => {
    const item = pickItem(existingItems, themeKey);
    if (item) { setText(item); setIsSuggested(true); }
  };

  const handleChangeText = (t: string) => {
    setText(t);
    if (isSuggested && t !== text) setIsSuggested(false);
  };

  return (
    <View style={s.overlay} pointerEvents="box-none">
      <Animated.View style={[s.panel, { transform: [{ translateY: slideAnim }], bottom: kbHeight + 20 }]} pointerEvents="auto">
        <View style={s.panelInner}>
          <View style={s.handleRow}>
            <View style={s.handle} />
            <TouchableOpacity onPress={onClose} style={s.closeBtn}><Text style={s.closeBtnText}>✕</Text></TouchableOpacity>
          </View>
          <TextInput
            ref={inputRef}
            style={[s.input, isSuggested && s.inputSuggested]}
            placeholder="添加新事项..."
            placeholderTextColor="#B2BEC3"
            value={text}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
            maxLength={50}
            autoFocus
          />
          {/* Success toast */}
          <Animated.View style={[s.successToast, { opacity: successAnim, transform: [{ translateY: successAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]} pointerEvents="none">
            <Text style={s.successText}>✓ 已添加</Text>
          </Animated.View>
          <View style={s.footer}>
            <TouchableOpacity style={s.suggestBtn} onPress={handleSuggest}>
              <Text style={s.suggestBtnText}>✨ 建议生成</Text>
            </TouchableOpacity>
            <View style={s.footerRight}>
              <Text style={s.charCount}>{currentCount}/{maxCount}</Text>
              <TouchableOpacity style={s.addBtn} onPress={handleSubmit} disabled={maxCount >= 100 && currentCount >= 100}>
                <Text style={s.addBtnText}>添加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  bg: { ...StyleSheet.absoluteFillObject },
  panel: {
    left: 16,
    right: 16,
    bottom: 20,
    overflow: 'hidden',
    borderRadius: 24,
  },
  panelInner: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(45,52,54,0.1)',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(45,52,54,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 12,
    color: '#7A8A9E',
    fontWeight: '600',
  },
  input: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
    backgroundColor: 'rgba(45,52,54,0.04)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    marginBottom: 12,
  },
  inputSuggested: {
    color: '#E67E22',
    backgroundColor: '#FFF3E0',
  },
  successToast: { alignItems: 'center', marginBottom: 8 },
  successText: { fontSize: 13, fontWeight: '700', color: '#7BC67E' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestBtn: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: 'rgba(255,167,38,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  suggestBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E67E22',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  charCount: {
    fontSize: 12,
    color: '#7A8A9E',
    fontWeight: '500',
  },
  addBtn: {
    backgroundColor: '#2D3436',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});