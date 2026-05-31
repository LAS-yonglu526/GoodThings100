import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';

interface Props {
  visible: boolean;
  onAdd: (text: string) => void;
  onClose: () => void;
  currentCount: number;
  maxCount: number;
}

export default function AddItemOverlay({ visible, onAdd, onClose, currentCount, maxCount }: Props) {
  const [text, setText] = useState('');
  const [kbHeight, setKbHeight] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(100)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
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

  const handleSubmit = () => {
    const val = text.trim();
    if (!val) return;
    // 不再在此拦截 currentCount >= maxCount，交由 handleAddItem 的里程碑弹窗处理
    onAdd(val);
    setText('');
    onClose();
  };

  return (
    <View style={s.overlay}>
      {/* 毛玻璃背景 */}
      <Animated.View style={[s.bg, { opacity: fadeAnim }]}>
        <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* 输入面板 */}
      <Animated.View style={[s.panel, { transform: [{ translateY: slideAnim }], bottom: kbHeight + 20 }]}>
        <View style={s.panelInner}>
          <View style={s.handle} />
          <TextInput
            ref={inputRef}
            style={s.input}
            placeholder="添加新事项..."
            placeholderTextColor="#B2BEC3"
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
            maxLength={50}
            autoFocus
          />
          <View style={s.footer}>
            <Text style={s.charCount}>{currentCount}/{maxCount}</Text>
            <TouchableOpacity style={s.addBtn} onPress={handleSubmit} disabled={maxCount >= 100 && currentCount >= 100}>
              <Text style={s.addBtnText}>添加</Text>
            </TouchableOpacity>
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
    position: 'absolute',
    left: 16,
    right: 16,
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
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(45,52,54,0.1)',
    alignSelf: 'center',
    marginBottom: 16,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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