import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  LayoutAnimation,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  initDatabase, getItemsByList, updateItemStatus, updateItemTitle, deleteItem, addItem, getAllLists, updateListItemLimit, GoodItem, GoodList,
} from '../services/database';
import MemoryModal from '../components/MemoryModal';
import AddItemOverlay from '../components/AddItemOverlay';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SW, height: SH } = Dimensions.get('window');

const ORBS = [
  { size: 140, color: '#FFB3BA', x: 0.1, y: 0.1, dx: 25000, dy: 30000 },
  { size: 110, color: '#BAE1FF', x: 0.85, y: 0.6, dx: 28000, dy: 26000 },
  { size: 160, color: '#D4EDDA', x: 0.55, y: 0.85, dx: 30000, dy: 25000 },
  { size: 90, color: '#FFD6A5', x: 0.25, y: 0.5, dx: 26000, dy: 33000 },
];
function FloatingOrb({ size, color, x, y, dx, dy }: any) {
  const a = useRef(new Animated.ValueXY({ x: x * SW, y: y * SH })).current;
  useEffect(() => {
    const loopX = () => Animated.timing(a, { toValue: { x: (Math.random() * 0.7 + 0.15) * SW, y: (a as any).y._value ?? y * SH }, duration: dx, useNativeDriver: false }).start(() => loopX());
    const loopY = () => Animated.timing(a, { toValue: { x: (a as any).x._value ?? x * SW, y: (Math.random() * 0.7 + 0.1) * SH }, duration: dy, useNativeDriver: false }).start(() => loopY());
    loopX(); loopY();
  }, []);
  return <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.33, transform: [{ translateX: a.x }, { translateY: a.y }] }} />;
}

const JELLY = [
  '#FFE0E5', '#E0EEFF', '#D5F5E3', '#E8E0F0', '#FFE8D6', '#FFF3CD',
  '#D6F0FA', '#FADDE4', '#FEE3D0', '#E0EBE3', '#DCEFF5', '#FDE2E7',
];
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); return Math.abs(h); }

type LayoutMode = 'gallery' | 'fluid';
function getLayoutMode(count: number): LayoutMode { return count <= 15 ? 'gallery' : 'fluid'; }
function getFluidStyles(count: number) {
  const t = Math.min(count, 100);
  const k = Math.pow(t / 100, 0.6);
  const fontSize = 22 - (22 - 11) * k;
  const padV = 14 - (14 - 4) * k;
  const padH = 20 - (20 - 9) * k;
  const gap = 14 - (14 - 3) * k;
  const minH = Math.max(32, padV * 2 + fontSize + 2);
  return { fontSize: Math.round(fontSize * 10) / 10, padV: Math.round(padV), padH: Math.round(padH), gap: Math.round(gap), minH: Math.round(minH) };
}
const GALLERY_STYLES = { fontSize: 18, cardWidth: SW - 44, gap: 12 };

interface Props { listId: string; onBack: () => void; }

export default function ListDetailScreen({ listId, onBack }: Props) {
  const [items, setItems] = useState<GoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GoodItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [listInfo, setListInfo] = useState<GoodList | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showAddOverlay, setShowAddOverlay] = useState(false);

  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [dragVisible, setDragVisible] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);

  const itemsRef = useRef<GoodItem[]>([]);
  itemsRef.current = items;
  const menuItemIdRef = useRef<string | null>(null);

  const layoutMapRef = useRef<Map<string, { y: number; h: number; x: number; w: number }>>(new Map());
  const scrollTopRef = useRef(Platform.OS === 'ios' ? 130 : 100);
  const scrollLeftRef = useRef(0);
  const scrollYRef = useRef(0);

  const dragActive = useRef(false);
  const dragItemId = useRef('');
  const dragSrcIndex = useRef(-1);
  const dragStartPageX = useRef(0);
  const dragStartPageY = useRef(0);
  const dragItemColor = useRef('');
  const dragItemTitle = useRef('');
  const dragItemFontSize = useRef(18);
  const dragItemPadH = useRef(16);
  const dragItemPadV = useRef(10);
  const dragItemMinH = useRef(44);
  const dragItemCardW = useRef(300);
  const dragIsGallery = useRef(false);
  const dragPillX = useRef(0);
  const dragPillW = useRef(0);
  const dragOffset = useRef(new Animated.ValueXY()).current;

  const [undoItems, setUndoItems] = useState<GoodItem[] | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoSlideAnim = useRef(new Animated.Value(-80)).current;
  const undoFadeAnim = useRef(new Animated.Value(0)).current;

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 🎉 全部完成庆祝动画
  const [showCelebration, setShowCelebration] = useState(false);
  const celebScale = useRef(new Animated.Value(0)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;
  const celebEmojis = useRef<{ x: number; y: number; emoji: string; delay: number }[]>([]);

  // 🔧 胶囊果冻删除
  const [deletingCapsuleId, setDeletingCapsuleId] = useState<string | null>(null);
  const capsuleDelScale = useRef(new Animated.Value(1)).current;
  const capsuleDelOpacity = useRef(new Animated.Value(1)).current;

  // 🔧 拖拽插位指示器 — 全部 JS 驱动 (left/top/width/height 不支持 native)
  const dropLeft = useRef(new Animated.Value(0)).current;
  const dropTop = useRef(new Animated.Value(0)).current;
  const dropW = useRef(new Animated.Value(60)).current;
  const dropH = useRef(new Animated.Value(6)).current;
  const dropOpa = useRef(new Animated.Value(0)).current;

  const moveDropIndicator = useCallback((targetIndex: number | null) => {
    if (targetIndex === null || targetIndex < 0) {
      Animated.timing(dropOpa, { toValue: 0, duration: 120, useNativeDriver: false }).start();
      return;
    }
    const curItems = itemsRef.current;
    const ci = curItems[targetIndex];
    if (!ci?.id) return;
    const ly = layoutMapRef.current.get(ci.id);
    if (!ly) return;

    const isG = getLayoutMode(curItems.length) === 'gallery';
    const fStyles = isG ? null : getFluidStyles(curItems.length);
    const gap = isG ? GALLERY_STYLES.gap : (fStyles?.gap ?? 8);

    if (isG) {
      Animated.parallel([
        Animated.spring(dropLeft, { toValue: scrollLeftRef.current + 12 + ly.x, useNativeDriver: false }),
        Animated.spring(dropTop, { toValue: scrollTopRef.current + ly.y - scrollYRef.current - gap / 2 - 3, useNativeDriver: false }),
        Animated.timing(dropW, { toValue: ly.w, duration: 150, useNativeDriver: false }),
        Animated.timing(dropH, { toValue: 6, duration: 100, useNativeDriver: false }),
        Animated.timing(dropOpa, { toValue: 1, duration: 120, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(dropLeft, { toValue: scrollLeftRef.current + 12 + ly.x - gap / 2 - 3, useNativeDriver: false }),
        Animated.spring(dropTop, { toValue: scrollTopRef.current + ly.y - scrollYRef.current + 2, useNativeDriver: false }),
        Animated.timing(dropW, { toValue: 6, duration: 100, useNativeDriver: false }),
        Animated.timing(dropH, { toValue: ly.h - 4, duration: 150, useNativeDriver: false }),
        Animated.timing(dropOpa, { toValue: 1, duration: 120, useNativeDriver: false }),
      ]).start();
    }
  }, [dropLeft, dropTop, dropW, dropH, dropOpa]);

  // 🔧 深海水母光晕
  const haloDriver = useRef(new Animated.Value(0)).current;
  const haloLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const startHalo = useCallback(() => {
    haloLoopRef.current?.stop();
    haloDriver.setValue(0);
    haloLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(haloDriver, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(haloDriver, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    haloLoopRef.current.start();
  }, [haloDriver]);

  const stopHalo = useCallback(() => {
    haloLoopRef.current?.stop();
    haloLoopRef.current = null;
    haloDriver.setValue(0);
  }, [haloDriver]);

  const haloOpacity = haloDriver.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });
  const haloScale = haloDriver.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  const isExiting = useRef(false);

  const load = useCallback(async () => {
    const d = await getItemsByList(listId); setItems(d);
    const ls = await getAllLists(); setListInfo(ls.find(l => l.id === listId) || null); setLoading(false);
  }, [listId]);
  useEffect(() => { initDatabase().then(() => load()); }, [load]);

  const animateAndRefresh = async () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); await load(); };

  const showUndo = useCallback((prevItems: GoodItem[]) => {
    if (undoTimer.current) { clearTimeout(undoTimer.current); }
    setUndoItems(prevItems);
    undoSlideAnim.setValue(-80);
    undoFadeAnim.setValue(0);
    Animated.parallel([
      Animated.spring(undoSlideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
      Animated.timing(undoFadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    undoTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(undoSlideAnim, { toValue: -80, duration: 200, useNativeDriver: true }),
        Animated.timing(undoFadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setUndoItems(null));
    }, 5000);
  }, [undoSlideAnim, undoFadeAnim]);

  // 🎉 庆祝动画触发
  const triggerCelebration = useCallback(() => {
    const emojis = ['🎉', '✨', '🌟', '💫', '🎊', '🥳', '💖', '🌈'];
    const particles = [];
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: Math.random() * SW,
        y: Math.random() * SH,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        delay: Math.random() * 400,
      });
    }
    celebEmojis.current = particles;
    setShowCelebration(true);
    celebScale.setValue(0);
    celebOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(celebScale, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
      Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(celebOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(celebScale, { toValue: 1.5, duration: 500, useNativeDriver: true }),
      ]).start(() => {
        setShowCelebration(false);
        const limit = listInfoRef.current?.itemLimit || 100;
        const count = itemsRef.current.length;
        if ((limit === 10 || limit === 50) && count === limit && count < 100) {
          const msg = limit === 10 ? '要不要挑战升级至 50 甚至 100 件？' : '要不要挑战 100 件上限？';
          const btns: any[] = [
            { text: '暂不', style: 'cancel' },
          ];
          if (limit === 10) {
            btns.push({ text: '升级至 50', onPress: async () => { await updateListItemLimit(listId, 50); await animateAndRefresh(); } });
            btns.push({ text: '直接挑战 100', onPress: async () => { await updateListItemLimit(listId, 100); await animateAndRefresh(); } });
          } else {
            btns.push({ text: '升级至 100', onPress: async () => { await updateListItemLimit(listId, 100); await animateAndRefresh(); } });
          }
          Alert.alert('🎉 全部完成！', msg, btns);
        }
      });
    }, 2500);
  }, [celebScale, celebOpacity, listId]);

  const listInfoRef = useRef<GoodList | null>(null);
  listInfoRef.current = listInfo;

  const toggleStatus = useCallback(async (item: GoodItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const s = item.status === 'completed' ? 'pending' : 'completed';
    await updateItemStatus(item.id, listId, s);
    setItems(p => {
      const next = p.map(i => i.id === item.id ? { ...i, status: s as 'pending' | 'completed', completedAt: s === 'completed' ? new Date().toISOString() : null } : i);
      // 检测全部完成
      if (s === 'completed') {
        const total = next.length;
        const allDone = next.every(i => i.status === 'completed');
        if (total > 0 && allDone) {
          setTimeout(() => triggerCelebration(), 150);
        }
      }
      return next;
    });
    if (s === 'completed') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [listId, triggerCelebration]);

  const handleMenuAction = useCallback((action: 'edit' | 'memory' | 'delete') => {
    const itemId = menuItemIdRef.current;
    setMenuItemId(null);
    menuItemIdRef.current = null;
    stopHalo();
    if (!itemId) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    if (action === 'edit') { setEditingId(item.id); setEditText(item.title); }
    else if (action === 'memory') { setSelectedItem(item); setModalVisible(true); }
    else if (action === 'delete') {
      Alert.alert('删除', `确定删除「${item.title}」？`, [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => {
          // 三步果冻删除
          setDeletingCapsuleId(item.id);
          capsuleDelScale.setValue(1);
          capsuleDelOpacity.setValue(1);
          Animated.parallel([
            Animated.spring(capsuleDelScale, { toValue: 0.6, friction: 7, tension: 40, useNativeDriver: true }),
            Animated.timing(capsuleDelOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
          ]).start(() => {
            // 分场景补位: ≤20胶囊用轻量 eased 动画，>20 直接瞬间归位
            const count = itemsRef.current.length;
            if (count <= 20) {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            }
            setItems(prev => prev.filter(i => i.id !== item.id));
            setDeletingCapsuleId(null);
            deleteItem(item.id, listId);
          });
        } },
      ]);
    }
  }, [items, listId, stopHalo]);

  const toggleSelectMode = () => {
    if (isSelectMode) { setIsSelectMode(false); setSelectedIds(new Set()); }
    else { setIsSelectMode(true); setSelectedIds(new Set()); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
  };
  const batchComplete = async () => {
    const ids = Array.from(selectedIds); if (!ids.length) return;
    const now = new Date().toISOString();
    await Promise.all(ids.map(id => updateItemStatus(id, listId, 'completed')));
    setItems(p => p.map(i => ids.includes(i.id) ? { ...i, status: 'completed' as const, completedAt: now } : i));
    setIsSelectMode(false); setSelectedIds(new Set());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const batchDelete = () => {
    const ids = Array.from(selectedIds); if (!ids.length) return;
    Alert.alert(`删除 ${ids.length} 项`, '确定删除？不可撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        await Promise.all(ids.map(id => deleteItem(id, listId)));
        await animateAndRefresh(); setIsSelectMode(false); setSelectedIds(new Set());
      }},
    ]);
  };

  const findItemAtPoint = (pageX: number, pageY: number, curItems: GoodItem[]) => {
    const contentY = pageY - scrollTopRef.current + scrollYRef.current;
    const contentX = pageX - scrollLeftRef.current - 12;
    let candidates: { item: GoodItem; index: number; ly: typeof layoutMapRef.current extends Map<string, infer V> ? V : never }[] = [];
    for (let i = 0; i < curItems.length; i++) {
      const ci = curItems[i];
      if (!ci?.id) continue;
      const ly = layoutMapRef.current.get(ci.id);
      if (!ly) continue;
      if (contentY >= ly.y - 8 && contentY <= ly.y + ly.h + 8) {
        (candidates as any).push({ item: ci, index: i, ly });
      }
    }
    if (candidates.length === 0) {
      let minDist = Infinity;
      let best: typeof candidates[0] | null = null;
      for (let i = 0; i < curItems.length; i++) {
        const ci = curItems[i];
        if (!ci?.id) continue;
        const ly = layoutMapRef.current.get(ci.id);
        if (!ly) continue;
        const d = Math.abs(contentY - (ly.y + ly.h / 2));
        if (d < minDist) { minDist = d; best = { item: ci, index: i, ly } as any; }
      }
      if (best) candidates = [best];
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return { item: candidates[0].item, index: candidates[0].index, layoutY: candidates[0].ly.y, layoutH: candidates[0].ly.h, layoutX: candidates[0].ly.x, layoutW: candidates[0].ly.w };
    let closest = candidates[0];
    let closestDist = Infinity;
    for (const c of candidates) {
      const midX = c.ly.x + c.ly.w / 2;
      const d = Math.abs(contentX - midX);
      if (d < closestDist) { closestDist = d; closest = c; }
    }
    return { item: closest.item, index: closest.index, layoutY: closest.ly.y, layoutH: closest.ly.h, layoutX: closest.ly.x, layoutW: closest.ly.w };
  };

  const computeTargetIndex = (pageX: number, pageY: number, curItems: GoodItem[], excludeIndex: number) => {
    const result = findItemAtPoint(pageX, pageY, curItems);
    if (!result) return excludeIndex;
    if (result.index === excludeIndex) return excludeIndex;
    const contentY = pageY - scrollTopRef.current + scrollYRef.current;
    const mid = result.layoutY + result.layoutH / 2;
    if (contentY >= mid && result.index < curItems.length) {
      return result.index + 1;
    }
    return result.index;
  };

  const doJellySpring = useCallback(() => {
    if (isExiting.current) return;
    const anim = LayoutAnimation.create(550, LayoutAnimation.Types.spring, LayoutAnimation.Properties.scaleXY);
    LayoutAnimation.configureNext(anim);
  }, []);

  const handleBack = useCallback(() => {
    isExiting.current = true;
    stopHalo();
    onBack();
  }, [onBack, stopHalo]);

  const dragPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => menuItemIdRef.current !== null || dragActive.current,
    onMoveShouldSetPanResponder: () => menuItemIdRef.current !== null || dragActive.current,
    onShouldBlockNativeResponder: () => false,
    onPanResponderGrant: () => {},
    onPanResponderMove: (_, gs) => {
      const totalMove = Math.abs(gs.dy) + Math.abs(gs.dx);
      if (!dragActive.current && menuItemIdRef.current && totalMove > 10) {
        dragActive.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setDragVisible(true);
        stopHalo();
        setMenuItemId(null);
        menuItemIdRef.current = null;
        dragStartPageX.current = dragStartPageX.current + gs.dx;
        dragStartPageY.current = dragStartPageY.current + gs.dy;
        dragOffset.setValue({ x: 0, y: 0 });
        return;
      }
      if (dragActive.current) {
        dragOffset.setValue({ x: gs.dx, y: gs.dy });
        const curItems = itemsRef.current;
        const currentPageX = dragStartPageX.current + gs.dx;
        const currentPageY = dragStartPageY.current + gs.dy;
        const targetIdx = computeTargetIndex(currentPageX, currentPageY, curItems, dragSrcIndex.current);
        if (targetIdx !== highlightIndex) {
          setHighlightIndex(targetIdx);
          moveDropIndicator(targetIdx);
        }
      }
    },
    onPanResponderRelease: (_, gs) => {
      setHighlightIndex(null);
      Animated.timing(dropOpa, { toValue: 0, duration: 120, useNativeDriver: false }).start();
      if (!dragActive.current) {
        if (menuItemIdRef.current) { setMenuItemId(null); menuItemIdRef.current = null; stopHalo(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
        return;
      }
      dragActive.current = false;
      setDragVisible(false);
      const curItems = itemsRef.current;
      if (curItems.length < 2) { dragOffset.setValue({ x: 0, y: 0 }); return; }
      const currentPageX = dragStartPageX.current + gs.dx;
      const currentPageY = dragStartPageY.current + gs.dy;
      const targetIdx = computeTargetIndex(currentPageX, currentPageY, curItems, dragSrcIndex.current);
      const srcIdx = dragSrcIndex.current;
      if (targetIdx === srcIdx || targetIdx < 0 || targetIdx >= curItems.length) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        dragOffset.setValue({ x: 0, y: 0 });
        return;
      }
      const prevItems = [...curItems];
      const next = [...curItems];
      const [moved] = next.splice(srcIdx, 1);
      const insertIdx = targetIdx > srcIdx ? targetIdx - 1 : targetIdx;
      next.splice(insertIdx, 0, moved);
      doJellySpring();
      setItems(next);
      showUndo(prevItems);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dragOffset.setValue({ x: 0, y: 0 });
    },
    onPanResponderTerminate: () => { setHighlightIndex(null); dragActive.current = false; setDragVisible(false); dragOffset.setValue({ x: 0, y: 0 }); },
  })).current;

  // 🔧 点击"+"按钮时提前检查里程碑
  const handlePlusPress = useCallback(() => {
    const limit = listInfoRef.current?.itemLimit || 100;
    const count = itemsRef.current.length;
    if (count >= 100) {
      Alert.alert('已达满载上限', '当前目录已达 100 件满载上限，开启一段新的旅程吧！');
      return;
    }
    if (count >= limit && limit < 100) {
      if (limit === 10) {
        Alert.alert('🎯 已达 10 件上限', '是否要扩充清单容量？', [
          { text: '暂不', style: 'cancel' },
          { text: '升级至 50', onPress: async () => { await updateListItemLimit(listId, 50); await animateAndRefresh(); setShowAddOverlay(true); } },
          { text: '直接挑战 100', onPress: async () => { await updateListItemLimit(listId, 100); await animateAndRefresh(); setShowAddOverlay(true); } },
        ]);
        return;
      }
      if (limit === 50) {
        Alert.alert('🎯 已达 50 件上限', '是否要扩充至 100 件上限？', [
          { text: '暂不', style: 'cancel' },
          { text: '升级至 100', onPress: async () => { await updateListItemLimit(listId, 100); await animateAndRefresh(); setShowAddOverlay(true); } },
        ]);
        return;
      }
    }
    setShowAddOverlay(true);
  }, [listId, animateAndRefresh]);

  // 🔧 三级里程碑状态机
  const handleAddItem = async (text: string) => {
    const limit = listInfo?.itemLimit || 100;
    if (items.length >= 100) {
      Alert.alert('已达满载上限', '当前目录已达 100 件满载上限，开启一段新的旅程吧！');
      return;
    }
    if (items.length >= limit && limit < 100) {
      if (limit === 10) {
        Alert.alert('🎉 恭喜达成 10 件小目标！', '要不要挑战更高的里程碑？', [
          { text: '暂不', style: 'cancel' },
          { text: '升级至 50', onPress: async () => { await updateListItemLimit(listId, 50); await addItem(listId, text.trim()); await animateAndRefresh(); } },
          { text: '直接挑战 100', onPress: async () => { await updateListItemLimit(listId, 100); await addItem(listId, text.trim()); await animateAndRefresh(); } },
        ]);
        return;
      }
      if (limit === 50) {
        Alert.alert('🎉 恭喜达成 50 件里程碑！', '要不要挑战 100 件上限？', [
          { text: '暂不', style: 'cancel' },
          { text: '升级至 100', onPress: async () => { await updateListItemLimit(listId, 100); await addItem(listId, text.trim()); await animateAndRefresh(); } },
        ]);
        return;
      }
    }
    await addItem(listId, text.trim()); await animateAndRefresh();
  };

  const onSave = async () => { setModalVisible(false); setSelectedItem(null); await animateAndRefresh(); };
  const onClose = () => { setModalVisible(false); setSelectedItem(null); };

  if (loading) return <View style={st.ld}><ActivityIndicator size="large" color="#9BA4B5" /></View>;

  const done = items.filter(i => i && i.status === 'completed').length;
  const mode = getLayoutMode(items.length);
  const f = mode === 'fluid' ? getFluidStyles(items.length) : null;

  const draggedItem = dragVisible ? items.find(i => i.id === dragItemId.current) : null;
  const menuItem = menuItemId ? items.find(i => i.id === menuItemId) : null;

  const draggedLayout = draggedItem ? layoutMapRef.current.get(draggedItem.id) : null;
  const coverX = draggedLayout ? scrollLeftRef.current + 12 + draggedLayout.x : 16;
  const coverTop = draggedLayout ? scrollTopRef.current + draggedLayout.y - scrollYRef.current - (dragIsGallery.current ? 10 : 6) : 0;

  return (
    <View style={st.r} {...dragPanResponder.panHandlers} onTouchStart={e => { dragStartPageX.current = e.nativeEvent.pageX; dragStartPageY.current = e.nativeEvent.pageY; }}>
      {ORBS.map((o, i) => <FloatingOrb key={i} {...o} />)}
      <View style={st.s}>
        <BlurView intensity={70} tint="light" style={st.h}>
          <TouchableOpacity onPress={() => { if (isSelectMode) { toggleSelectMode(); } else { handleBack(); } }} style={st.bb}>
            <Text style={st.bt}>{isSelectMode ? '✕' : '←'}</Text>
          </TouchableOpacity>
          <View style={st.hc}>
            <Text style={st.ht} numberOfLines={1}>{listInfo?.iconEmoji} {listInfo?.title}</Text>
            {isSelectMode && <Text style={st.selectCount}>{selectedIds.size} 项已选</Text>}
          </View>
          <TouchableOpacity onPress={toggleSelectMode} style={st.selectBtn}><Text style={st.selectBtnText}>{isSelectMode ? '完成' : '选择'}</Text></TouchableOpacity>
        </BlurView>
        <View style={st.pb}><View style={[st.pf, { width: `${items.length ? (done / items.length) * 100 : 0}%` }]} /></View>
        <Text style={st.pt}>{done}/{items.length}</Text>

        <ScrollView style={st.sc} scrollEnabled={!dragActive.current && !menuItemId}
          contentContainerStyle={mode === 'gallery' ? st.galleryContainer : { ...st.fluidContainer, gap: f!.gap }}
          showsVerticalScrollIndicator={false} onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
          ref={r => { if (r) (r as any).measureInWindow((x: number, y: number) => { scrollTopRef.current = y; scrollLeftRef.current = x; }); }}>
          {items.map((item, index) => {
            if (!item) return null;
            if (editingId === item.id) return <View key={item.id} style={st.e}><TextInput style={st.ei} value={editText} onChangeText={setEditText} autoFocus onBlur={async () => { if (editText.trim()) { await updateItemTitle(item.id, listId, editText.trim()); setEditingId(null); await animateAndRefresh(); } }} returnKeyType="done" /></View>;
            const c = JELLY[hash(item.title) % JELLY.length];
            const isDone = item.status === 'completed';
            const mem = !!(item.memoryText || (item.mediaUris && item.mediaUris !== '[]' && item.mediaUris !== ''));
            const isDragged = dragActive.current && dragItemId.current === item.id;
            const isHighlighted = highlightIndex === index && !isDragged;
            const isSelected = menuItemId === item.id;

            if (isDragged) {
              return <View key={item.id} style={mode === 'gallery' ? [st.galleryCard, { backgroundColor: 'transparent', borderColor: 'transparent', width: GALLERY_STYLES.cardWidth }] : [pil.p, { backgroundColor: 'transparent', borderColor: 'transparent', paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }]} />;
            }

            const isDeleting = deletingCapsuleId === item.id;

            return (
              <View key={item.id} onLayout={e => { const { y, height, x, width } = e.nativeEvent.layout; layoutMapRef.current.set(item.id, { y, h: height, x, w: width }); }}>
                {isSelected && (
                  <Animated.View style={[st.haloRing, mode === 'gallery' ? { width: GALLERY_STYLES.cardWidth } : { paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }, {
                    borderColor: c, backgroundColor: 'transparent', shadowColor: c, shadowRadius: 20,
                    shadowOpacity: haloOpacity, shadowOffset: { width: 0, height: 0 }, opacity: haloOpacity,
                    transform: [{ scale: haloScale }], elevation: 5,
                  }]} pointerEvents="none" />
                )}
                <TouchableOpacity activeOpacity={0.8} delayLongPress={400}
                  onPress={() => { if (!isSelectMode) toggleStatus(item); }}
                  onLongPress={() => {
                    if (isSelectMode) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    setMenuItemId(item.id); menuItemIdRef.current = item.id;
                    dragItemId.current = item.id; dragSrcIndex.current = index;
                    dragItemColor.current = c; dragItemTitle.current = item.title;
                    dragIsGallery.current = mode === 'gallery';
                    dragItemFontSize.current = mode === 'gallery' ? GALLERY_STYLES.fontSize : f!.fontSize;
                    dragItemPadH.current = mode === 'gallery' ? 20 : f!.padH; dragItemPadV.current = mode === 'gallery' ? 14 : f!.padV;
                    dragItemMinH.current = mode === 'gallery' ? 48 : f!.minH; dragItemCardW.current = mode === 'gallery' ? GALLERY_STYLES.cardWidth : 0;
                    const ly = layoutMapRef.current.get(item.id); dragPillX.current = ly?.x ?? 0; dragPillW.current = ly?.w ?? 80;
                    dragOffset.setValue({ x: 0, y: 0 });
                    startHalo();
                  }}>
                  {isDeleting ? (
                    <Animated.View style={[mode === 'gallery' ? st.galleryCard : pil.p, { backgroundColor: isDone ? `${c}66` : c },
                      mode === 'gallery' ? { width: GALLERY_STYLES.cardWidth } : { paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH },
                      { opacity: capsuleDelOpacity, transform: [{ scale: capsuleDelScale }] }]}>
                      <Text style={{ fontSize: mode === 'gallery' ? GALLERY_STYLES.fontSize : f!.fontSize, fontWeight: isDone ? '400' : '600',
                        color: isDone ? '#B2BEC3' : '#2D3436', textDecorationLine: isDone ? 'line-through' : 'none' }}>{item.title}</Text>
                      {mem && <View style={pil.g}><Text style={pil.gt}>✦</Text></View>}
                    </Animated.View>
                  ) : (
                    <View style={[mode === 'gallery' ? st.galleryCard : pil.p, { backgroundColor: isDone ? `${c}66` : c },
                      mode === 'gallery' ? { width: GALLERY_STYLES.cardWidth } : { paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH },
                      isHighlighted && st.highlightPill, isSelected && st.selectedLift]}>
                      <Text style={{ fontSize: mode === 'gallery' ? GALLERY_STYLES.fontSize : f!.fontSize, fontWeight: isDone ? '400' : '600',
                        color: isDone ? '#B2BEC3' : '#2D3436', textDecorationLine: isDone ? 'line-through' : 'none' }}>{item.title}</Text>
                      {mem && <View style={pil.g}><Text style={pil.gt}>✦</Text></View>}
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
          {!isSelectMode && <TouchableOpacity style={st.ab} onPress={handlePlusPress}><Text style={st.at}>+</Text></TouchableOpacity>}
        </ScrollView>
      </View>

      {/* 拖拽插位指示器：绝对定位果冻发光条 */}
      {highlightIndex !== null && dragActive.current && (
        <Animated.View style={[st.dropGlow, {
          position: 'absolute', left: dropLeft, top: dropTop, width: dropW, height: dropH,
          opacity: 0.85, backgroundColor: dragItemColor.current,
          shadowColor: dragItemColor.current,
        }]} pointerEvents="none" />
      )}

      {undoItems && (
        <Animated.View style={[st.undoFloater, { transform: [{ translateY: undoSlideAnim }], opacity: undoFadeAnim }]} pointerEvents="box-none">
          <BlurView intensity={85} tint="light" style={st.undoFloaterInner}>
            <Text style={st.undoText}>已重新排序</Text>
            <TouchableOpacity onPress={() => { if (!undoItems) return; doJellySpring(); setItems(undoItems); if (undoTimer.current) clearTimeout(undoTimer.current); setUndoItems(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); }} style={st.undoBtn}><Text style={st.undoBtnText}>撤销</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { if (undoTimer.current) clearTimeout(undoTimer.current); setUndoItems(null); }} style={st.undoClose}><Text style={st.undoCloseText}>✕</Text></TouchableOpacity>
          </BlurView>
        </Animated.View>
      )}

      {menuItem && (
        <View style={[st.menuOverlay, { top: scrollTopRef.current + (layoutMapRef.current.get(menuItemId!)?.y ?? 0) + (layoutMapRef.current.get(menuItemId!)?.h ?? 44) - scrollYRef.current + 8 }]} pointerEvents="box-none">
          <BlurView intensity={90} tint="prominent" style={st.menuBox}>
            <TouchableOpacity style={st.menuRow} onPress={() => handleMenuAction('edit')}><Text style={st.menuIcon}>✏️</Text><Text style={st.menuLabel}>编辑</Text></TouchableOpacity>
            <View style={st.menuSep} />
            <TouchableOpacity style={st.menuRow} onPress={() => handleMenuAction('memory')}><Text style={st.menuIcon}>💭</Text><Text style={st.menuLabel}>手记</Text></TouchableOpacity>
            <View style={st.menuSep} />
            <TouchableOpacity style={st.menuRow} onPress={() => handleMenuAction('delete')}><Text style={st.menuIcon}>🗑</Text><Text style={[st.menuLabel, { color: '#FF3B30' }]}>删除</Text></TouchableOpacity>
          </BlurView>
        </View>
      )}

      {dragVisible && draggedItem && (
        <Animated.View style={[st.dragOverlay, { top: coverTop, left: coverX, transform: [{ translateX: dragOffset.x }, { translateY: dragOffset.y }] }]} pointerEvents="none">
          <View style={[mode === 'gallery' ? st.galleryCard : pil.p, { backgroundColor: dragItemColor.current, width: mode === 'gallery' ? dragItemCardW.current : undefined }, mode !== 'gallery' && { paddingHorizontal: dragItemPadH.current, paddingVertical: dragItemPadV.current, minHeight: dragItemMinH.current }, st.dragPillShadow]}>
            <Text style={{ fontSize: dragItemFontSize.current, fontWeight: '700', color: '#2D3436', maxWidth: mode === 'gallery' ? undefined : 180 }} numberOfLines={mode === 'gallery' ? 2 : 1}>{dragItemTitle.current}</Text>
          </View>
        </Animated.View>
      )}

      {isSelectMode && selectedIds.size > 0 && (
        <View style={st.batchBar}>
          <BlurView intensity={85} tint="light" style={st.batchBarInner}>
            <TouchableOpacity style={[st.batchBtn, st.batchBtnComplete]} onPress={batchComplete}><Text style={st.batchBtnTextComplete}>完成 ({selectedIds.size})</Text></TouchableOpacity>
            <TouchableOpacity style={[st.batchBtn, st.batchBtnDelete]} onPress={batchDelete}><Text style={st.batchBtnTextDelete}>删除 ({selectedIds.size})</Text></TouchableOpacity>
          </BlurView>
        </View>
      )}

      {/* 🎉 全部完成庆祝动画 */}
      {showCelebration && (
        <Animated.View style={[st.celebOverlay, { opacity: celebOpacity }]} pointerEvents="box-none">
          <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
          <Animated.View style={[st.celebCenter, { transform: [{ scale: celebScale }] }]}>
            <Text style={st.celebTitle}>🎉 全部完成！</Text>
            <Text style={st.celebSub}>太棒了！</Text>
          </Animated.View>
          {celebEmojis.current.map((p, i) => (
            <Animated.Text key={i} style={[st.celebParticle, { left: p.x, top: p.y, opacity: celebOpacity }]}>
              {p.emoji}
            </Animated.Text>
          ))}
        </Animated.View>
      )}

      <MemoryModal visible={modalVisible} item={selectedItem} onClose={onClose} onSaved={onSave} />
      <AddItemOverlay visible={showAddOverlay} onAdd={handleAddItem} onClose={() => setShowAddOverlay(false)} currentCount={items.length} maxCount={listInfo?.itemLimit || 100} />
    </View>
  );
}

const st = StyleSheet.create({
  r: { flex: 1, backgroundColor: '#E8ECF1' },
  ld: { flex: 1, backgroundColor: '#E8ECF1', alignItems: 'center', justifyContent: 'center' },
  s: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  h: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 12, borderRadius: 32, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.55)' },
  bb: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(45,52,54,0.06)', alignItems: 'center', justifyContent: 'center' },
  bt: { fontSize: 20, color: '#2D3436', fontWeight: '600' },
  hc: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  ht: { fontSize: 18, fontWeight: '700', color: '#2D3436' },
  selectCount: { fontSize: 11, color: '#7A8A9E', marginTop: 1, fontWeight: '500' },
  selectBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(45,52,54,0.06)' },
  selectBtnText: { fontSize: 13, color: '#2D3436', fontWeight: '600' },
  pb: { height: 2, backgroundColor: 'rgba(45,52,54,0.06)', marginHorizontal: 16, marginTop: 8, borderRadius: 1, overflow: 'hidden' },
  pf: { height: '100%', backgroundColor: '#6C7A8D', borderRadius: 1 },
  pt: { fontSize: 11, color: '#7A8A9E', textAlign: 'center', marginTop: 4, marginBottom: 6, fontWeight: '500' },
  sc: { flex: 1 },
  galleryContainer: { flexDirection: 'column', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 60, paddingTop: 12, gap: 12 },
  galleryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', paddingHorizontal: 20, paddingVertical: 14, shadowColor: '#4A5568', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  fluidContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 60, paddingTop: 6, alignContent: 'flex-start' },
  e: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(45,52,54,0.12)', alignSelf: 'flex-start' },
  ei: { fontSize: 11.5, fontWeight: '600', color: '#2D3436', minWidth: 50, padding: 0 },
  ab: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#2D3436', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3, alignSelf: 'flex-start' },
  at: { fontSize: 20, color: '#FFF', marginTop: -1 },
  undoBar: { marginHorizontal: 12, marginBottom: 4, borderRadius: 16, overflow: 'hidden' },
  undoBarInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.55)' },
  undoText: { fontSize: 13, color: '#2D3436', fontWeight: '500', flex: 1 },
  undoBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, backgroundColor: '#2D3436' },
  undoBtnText: { fontSize: 12, color: '#FFF', fontWeight: '600' },
  undoClose: { marginLeft: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(45,52,54,0.06)', alignItems: 'center', justifyContent: 'center' },
  undoCloseText: { fontSize: 12, color: '#7A8A9E' },
  undoFloater: { position: 'absolute', top: 0, left: 12, right: 12, zIndex: 996, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  undoFloaterInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.65)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  menuOverlay: { position: 'absolute', left: 16, right: 16, zIndex: 998, alignItems: 'center' },
  menuBox: { flexDirection: 'row', borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.75)', paddingVertical: 2, paddingHorizontal: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8, alignSelf: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  menuIcon: { fontSize: 14, marginRight: 4 },
  menuLabel: { fontSize: 14, color: '#2D3436', fontWeight: '600' },
  menuSep: { width: 1, height: 20, backgroundColor: 'rgba(45,52,54,0.1)', alignSelf: 'center' },
  dragOverlay: { position: 'absolute', zIndex: 999 },
  dragPillShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 16, transform: [{ scale: 1.12 }] },
  highlightPill: { borderColor: 'rgba(255,215,0,0.5)', borderWidth: 2, shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  haloRing: { position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.05, shadowRadius: 4, zIndex: 1 },
  selectedLift: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 15, elevation: 6 },
  dropGlow: { borderRadius: 3, zIndex: 2, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  batchBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 12 },
  batchBarInner: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.7)', gap: 10 },
  batchBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  batchBtnComplete: { backgroundColor: '#2D3436' },
  batchBtnDelete: { backgroundColor: 'rgba(255,59,48,0.1)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)' },
  batchBtnTextComplete: { fontSize: 15, color: '#FFF', fontWeight: '600' },
  batchBtnTextDelete: { fontSize: 15, color: '#FF3B30', fontWeight: '600' },
  celebOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 995, alignItems: 'center', justifyContent: 'center' },
  celebCenter: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 32, paddingVertical: 24, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 10 },
  celebTitle: { fontSize: 36, marginBottom: 4 },
  celebSub: { fontSize: 22, fontWeight: '700', color: '#2D3436' },
  celebParticle: { position: 'absolute', fontSize: 32 },
});

const pil = StyleSheet.create({
  p: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', shadowColor: '#4A5568', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  g: { marginLeft: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(116,185,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  gt: { fontSize: 9, color: '#4A90D9' },
});