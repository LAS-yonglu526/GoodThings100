import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  InteractionManager,
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
import { getCurrentUserId } from '../services/auth';
import { pushItemStatusChange, subscribeSharedItems, SharedItem } from '../services/couple';
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

interface Props {
  listId: string;
  onBack: () => void;
  partnerUid?: string | null;
  isShared?: boolean;
  onOpenTimeline?: (title: string, icon: string) => void;
}

export default function ListDetailScreen({ listId, onBack, partnerUid, isShared, onOpenTimeline }: Props) {
  const [items, setItems] = useState<GoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GoodItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [listInfo, setListInfo] = useState<GoodList | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showAddOverlay, setShowAddOverlay] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);

  // Partner activity toast
  const [partnerToast, setPartnerToast] = useState<string>('');
  const toastFade = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const selectDimAnim = useRef(new Animated.Value(0)).current;
  const batchCacheRef = useRef<{ type: 'complete' | 'delete'; ids: string[]; prevItems: GoodItem[] } | null>(null);
  const [batchUndoLabel, setBatchUndoLabel] = useState('');
  const batchUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchUndoSlide = useRef(new Animated.Value(-80)).current;
  const batchUndoFade = useRef(new Animated.Value(0)).current;

  const memoryWarnedRef = useRef(false);

  const [showCelebration, setShowCelebration] = useState(false);
  const celebScale = useRef(new Animated.Value(0)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;
  const celebParticlesRef = useRef<{ tx: number; ty: number; color: string; shape: 'dot' | 'pill' | 'star'; size: number; rotEnd: number; x: Animated.Value; y: Animated.Value; sc: Animated.Value; rot: Animated.Value; op: Animated.Value }[]>([]);
  const celebAnimsRef = useRef<Animated.CompositeAnimation[]>([]);

  const [deletingCapsuleId, setDeletingCapsuleId] = useState<string | null>(null);
  const capsuleDelScale = useRef(new Animated.Value(1)).current;
  const capsuleDelOpacity = useRef(new Animated.Value(1)).current;
  const bounceRefs = useRef<Map<string, { x: Animated.Value; y: Animated.Value }>>(new Map());

  const dropLeft = useRef(new Animated.Value(0)).current;
  const dropTop = useRef(new Animated.Value(0)).current;
  const dropW = useRef(new Animated.Value(60)).current;
  const dropH = useRef(new Animated.Value(6)).current;
  const dropOpa = useRef(new Animated.Value(0)).current;

  const moveDropIndicator = useCallback((targetIndex: number | null) => {
    if (targetIndex === null || targetIndex < 0) { Animated.timing(dropOpa, { toValue: 0, duration: 120, useNativeDriver: false }).start(); return; }
    const curItems = itemsRef.current; const ci = curItems[targetIndex]; if (!ci?.id) return;
    const ly = layoutMapRef.current.get(ci.id); if (!ly) return;
    const isG = getLayoutMode(curItems.length) === 'gallery';
    const fStyles = isG ? null : getFluidStyles(curItems.length);
    const gap = isG ? GALLERY_STYLES.gap : (fStyles?.gap ?? 8);
    if (isG) {
      Animated.parallel([Animated.spring(dropLeft, { toValue: scrollLeftRef.current + 12 + ly.x, useNativeDriver: false }), Animated.spring(dropTop, { toValue: scrollTopRef.current + ly.y - scrollYRef.current - gap / 2 - 3, useNativeDriver: false }), Animated.timing(dropW, { toValue: ly.w, duration: 150, useNativeDriver: false }), Animated.timing(dropH, { toValue: 6, duration: 100, useNativeDriver: false }), Animated.timing(dropOpa, { toValue: 1, duration: 120, useNativeDriver: false })]).start();
    } else {
      Animated.parallel([Animated.spring(dropLeft, { toValue: scrollLeftRef.current + 12 + ly.x - gap / 2 - 3, useNativeDriver: false }), Animated.spring(dropTop, { toValue: scrollTopRef.current + ly.y - scrollYRef.current + 2, useNativeDriver: false }), Animated.timing(dropW, { toValue: 6, duration: 100, useNativeDriver: false }), Animated.timing(dropH, { toValue: ly.h - 4, duration: 150, useNativeDriver: false }), Animated.timing(dropOpa, { toValue: 1, duration: 120, useNativeDriver: false })]).start();
    }
  }, [dropLeft, dropTop, dropW, dropH, dropOpa]);

  const jellyScale = useRef(new Animated.Value(1)).current;
  const glowDriver = useRef(new Animated.Value(0)).current;
  const glowOpacity = glowDriver.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });
  const glowScale = glowDriver.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const glowOuterOpacity = glowDriver.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] });
  const glowOuterScale = glowDriver.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.12] });
  const glowLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const startGlow = useCallback(() => {
    glowLoopRef.current?.stop();
    glowDriver.setValue(0);
    glowLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowDriver, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glowDriver, { toValue: 0.2, duration: 900, useNativeDriver: true }),
      ]),
    );
    glowLoopRef.current.start();
  }, [glowDriver]);
  const stopGlow = useCallback(() => {
    glowLoopRef.current?.stop();
    glowLoopRef.current = null;
    Animated.timing(glowDriver, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [glowDriver]);
  const isExiting = useRef(false);

  const load = useCallback(async () => {
    const d = await getItemsByList(listId);
    setItems(d);
    const ls = await getAllLists();
    setListInfo(ls.find(l => l.id === listId) || null);
    setLoading(false);
  }, [listId]);
  useEffect(() => { memoryWarnedRef.current = false; initDatabase().then(() => load()); }, [load]);
  useEffect(() => { getCurrentUserId().then(setMyUid); }, []);

  // Realtime subscription for shared list
  useEffect(() => {
    if (!isShared) return;
    const unsub = subscribeSharedItems(
      listId,
      (item) => {
        // Partner added new item - reload
        load();
      },
      (item) => {
        // Partner changed status
        if (item.completed_by && item.completed_by !== myUid) {
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status as 'pending' | 'completed', completedAt: item.completed_at } : i));
          // Show toast
          const toastMsg = `💌 Ta 刚完成了「${item.title}」`;
          setPartnerToast(toastMsg);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastFade.setValue(0);
          Animated.spring(toastFade, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }).start();
          toastTimer.current = setTimeout(() => {
            Animated.timing(toastFade, { toValue: 0, duration: 300, useNativeDriver: true }).start();
          }, 4000);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      },
      (id) => {
        // Partner deleted item
        setItems(prev => prev.filter(i => i.id !== id));
      },
    );
    return () => unsub();
  }, [isShared, listId, myUid, load]);

  const animateAndRefresh = async () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); await load(); };

  const showUndo = useCallback((prevItems: GoodItem[]) => {
    if (undoTimer.current) { clearTimeout(undoTimer.current); }
    setUndoItems(prevItems);
    undoSlideAnim.setValue(-80); undoFadeAnim.setValue(0);
    Animated.parallel([Animated.spring(undoSlideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }), Animated.timing(undoFadeAnim, { toValue: 1, duration: 250, useNativeDriver: true })]).start();
    undoTimer.current = setTimeout(() => { Animated.parallel([Animated.timing(undoSlideAnim, { toValue: -80, duration: 200, useNativeDriver: true }), Animated.timing(undoFadeAnim, { toValue: 0, duration: 200, useNativeDriver: true })]).start(() => setUndoItems(null)); }, 5000);
  }, [undoSlideAnim, undoFadeAnim]);

  const triggerCelebration = useCallback(() => {
    const COLORS = ['#FF9AA2', '#6EB5FF', '#7BC67E', '#FFB347', '#FFD54F', '#4FC3F7', '#F48FB1', '#B39DDB', '#FFAB91', '#80CBC4', '#F06292', '#AED581'];
    const shapes: Array<'dot' | 'pill' | 'star'> = ['dot', 'pill', 'star'];
    const particles: { tx: number; ty: number; color: string; shape: 'dot' | 'pill' | 'star'; size: number; rotEnd: number; x: Animated.Value; y: Animated.Value; sc: Animated.Value; rot: Animated.Value; op: Animated.Value }[] = [];
    const count = 14 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const radius = 100 + Math.random() * 70;
      const size = 10 + Math.random() * 18;
      const rotEnd = (Math.random() - 0.5) * 20;
      particles.push({
        tx: Math.cos(angle) * radius, ty: Math.sin(angle) * radius,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: shapes[i % 3],
        size,
        rotEnd,
        x: new Animated.Value(0), y: new Animated.Value(0),
        sc: new Animated.Value(0), rot: new Animated.Value(0), op: new Animated.Value(0),
      });
    }
    celebParticlesRef.current = particles;
    setShowCelebration(true);
    celebScale.setValue(0); celebOpacity.setValue(0);
    celebAnimsRef.current.forEach(a => a.stop());
    celebAnimsRef.current = [];

    Animated.parallel([Animated.spring(celebScale, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }), Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true })]).start();

    const popAnims = particles.map(p =>
      Animated.parallel([
        Animated.spring(p.x, { toValue: p.tx, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.spring(p.y, { toValue: p.ty, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.spring(p.sc, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
        Animated.timing(p.op, { toValue: 0.85, duration: 200, useNativeDriver: true }),
      ]),
    );
    celebAnimsRef.current = popAnims;
    Animated.stagger(18, popAnims).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setTimeout(() => {
      const fadeAnims = particles.map(p =>
        Animated.parallel([
          Animated.timing(p.y, { toValue: p.ty + 22, duration: 2000, useNativeDriver: true }),
          Animated.timing(p.op, { toValue: 0, duration: 1600, useNativeDriver: true }),
          Animated.timing(p.sc, { toValue: 0.5, duration: 1600, useNativeDriver: true }),
          Animated.timing(p.rot, { toValue: p.rotEnd, duration: 2000, useNativeDriver: true }),
        ]),
      );
      celebAnimsRef.current = fadeAnims;
      Animated.parallel(fadeAnims).start();
    }, 300);

    setTimeout(() => {
      particles.forEach(p => {
        Animated.timing(p.x, { toValue: p.tx * 1.3, duration: 500, useNativeDriver: true }).start();
        Animated.timing(p.y, { toValue: p.ty * 1.3, duration: 500, useNativeDriver: true }).start();
      });
      Animated.parallel([Animated.timing(celebOpacity, { toValue: 0, duration: 500, useNativeDriver: true }), Animated.timing(celebScale, { toValue: 1.3, duration: 500, useNativeDriver: true })]).start(() => {
        setShowCelebration(false);
        const limit = listInfoRef.current?.itemLimit || 100; const count = itemsRef.current.length;
        if (count === 100 && limit === 100) {
          Alert.alert('🎉 全部完成！', '太厉害了！你已经完成了100件好事。要不要开启一段全新的旅程？', [
            { text: '先看看', style: 'cancel' },
            { text: '开启新旅程 ✨', onPress: () => { isExiting.current = true; stopGlow(); onBack(); } },
          ]);
        } else if ((limit === 10 || limit === 50) && count === limit && count < 100) {
          const msg = limit === 10 ? '要不要挑战升级至 50 甚至 100 件？' : '要不要挑战 100 件上限？'; const btns: any[] = [{ text: '暂不', style: 'cancel' }];
          if (limit === 10) { btns.push({ text: '升级至 50', onPress: async () => { await updateListItemLimit(listId, 50); await animateAndRefresh(); } }); btns.push({ text: '直接挑战 100', onPress: async () => { await updateListItemLimit(listId, 100); await animateAndRefresh(); } }); }
          else { btns.push({ text: '升级至 100', onPress: async () => { await updateListItemLimit(listId, 100); await animateAndRefresh(); } }); }
          Alert.alert('🎉 全部完成！', msg, btns);
        }
      });
    }, 2600);
  }, [celebScale, celebOpacity, listId]);

  const listInfoRef = useRef<GoodList | null>(null); listInfoRef.current = listInfo;

  const toggleStatus = useCallback(async (item: GoodItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const s = item.status === 'completed' ? 'pending' : 'completed';
    await updateItemStatus(item.id, listId, s);
    setItems(p => {
      const next = p.map(i => i.id === item.id ? { ...i, status: s as 'pending' | 'completed', completedAt: s === 'completed' ? new Date().toISOString() : null } : i);
      if (s === 'completed') { const total = next.length; if (total > 0 && next.every(i => i.status === 'completed')) setTimeout(() => triggerCelebration(), 150); }
      return next;
    });
    // Push to Supabase if shared
    if (isShared && myUid) {
      pushItemStatusChange(item.id, listId, s, myUid).catch(() => {});
    }
    if (s === 'completed') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [listId, triggerCelebration, isShared, myUid]);

  const scheduleBounceIn = useCallback((offsets: [string, number, number][]) => {
    const m = bounceRefs.current;
    const animations: Animated.CompositeAnimation[] = [];
    offsets.forEach(([id, dx, dy]) => {
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const existing = m.get(id);
      if (existing) {
        existing.x.setValue(dx); existing.y.setValue(dy);
        animations.push(Animated.spring(existing.x, { toValue: 0, friction: 4, tension: 80, useNativeDriver: true }));
        animations.push(Animated.spring(existing.y, { toValue: 0, friction: 4, tension: 80, useNativeDriver: true }));
      } else {
        const x = new Animated.Value(dx); const y = new Animated.Value(dy);
        m.set(id, { x, y });
        animations.push(Animated.spring(x, { toValue: 0, friction: 4, tension: 80, useNativeDriver: true }));
        animations.push(Animated.spring(y, { toValue: 0, friction: 4, tension: 80, useNativeDriver: true }));
      }
    });
    if (animations.length > 0) Animated.parallel(animations).start();
  }, []);

  const handleMenuAction = useCallback((action: 'edit' | 'memory' | 'delete') => {
    const itemId = menuItemIdRef.current; setMenuItemId(null); menuItemIdRef.current = null; stopGlow(); Animated.spring(jellyScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
    if (!itemId) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    if (action === 'edit') { setEditingId(item.id); setEditText(item.title); }
    else if (action === 'memory') { setSelectedItem(item); setModalVisible(true); }
    else if (action === 'delete') {
      const doDelete = () => {
        setDeletingCapsuleId(item.id);
        capsuleDelScale.setValue(1); capsuleDelOpacity.setValue(1);
        Animated.parallel([
          Animated.spring(capsuleDelScale, { toValue: 0.6, friction: 7, tension: 40, useNativeDriver: true }),
          Animated.timing(capsuleDelOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start(() => {
          const oldMap = new Map(layoutMapRef.current);
          const oldItemsArr = itemsRef.current;
          setItems(prev => prev.filter(i => i.id !== item.id));
          setDeletingCapsuleId(null);
          deleteItem(item.id, listId);
          InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
              const offsets: [string, number, number][] = [];
              const newMap = layoutMapRef.current;
              oldItemsArr.forEach(oi => {
                if (oi.id === item.id) return;
                const old = oldMap.get(oi.id); const neo = newMap.get(oi.id);
                if (!old || !neo) return;
                const dx = old.x - neo.x; const dy = old.y - neo.y;
                if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) offsets.push([oi.id, dx, dy]);
              });
              if (offsets.length > 0) scheduleBounceIn(offsets);
            }, 100);
          });
        });
      };
      const hasMemory = !!(item.memoryText || (item.mediaUris && item.mediaUris !== '[]' && item.mediaUris !== ''));
      if (hasMemory && !memoryWarnedRef.current) {
        memoryWarnedRef.current = true;
        Alert.alert('手记提醒', `「${item.title}」包含手记内容，删除后手记将一并丢失。确定删除吗？`, [
          { text: '取消', style: 'cancel' },
          { text: '仍然删除', style: 'destructive', onPress: doDelete },
        ]);
        return;
      }
      Alert.alert('删除', `确定删除「${item.title}」？`, [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [items, listId, stopGlow, jellyScale, scheduleBounceIn]);

  const toggleSelectMode = useCallback(() => {
    if (isSelectMode) {
      setIsSelectMode(false); setSelectedIds(new Set());
      Animated.timing(selectDimAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    } else {
      setIsSelectMode(true); setSelectedIds(new Set());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.timing(selectDimAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isSelectMode, selectDimAnim]);

  const toggleSelectItem = useCallback((itemId: string) => {
    setSelectedIds(p => { const s = new Set(p); if (s.has(itemId)) s.delete(itemId); else { s.add(itemId); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } return new Set(s); });
  }, []);

  const executeBatchInDB = useCallback(async (type: 'complete' | 'delete', ids: string[]) => {
    if (type === 'complete') { const now = new Date().toISOString(); await Promise.all(ids.map(id => updateItemStatus(id, listId, 'completed'))); }
    else { await Promise.all(ids.map(id => deleteItem(id, listId))); }
  }, [listId]);

  const batchComplete = useCallback(() => {
    const ids = Array.from(selectedIds); if (!ids.length) return;
    const prevItems = itemsRef.current;
    setItems(p => p.map(i => ids.includes(i.id) ? { ...i, status: 'completed' as const, completedAt: new Date().toISOString() } : i));
    setIsSelectMode(false); setSelectedIds(new Set()); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    batchCacheRef.current = { type: 'complete', ids, prevItems };
    setBatchUndoLabel(`已标记完成 ${ids.length} 项`);
    if (batchUndoTimer.current) clearTimeout(batchUndoTimer.current);
    batchUndoTimer.current = setTimeout(() => { executeBatchInDB('complete', ids); batchCacheRef.current = null; setBatchUndoLabel(''); }, 5000);
    batchUndoSlide.setValue(-80); batchUndoFade.setValue(0);
    Animated.parallel([Animated.spring(batchUndoSlide, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }), Animated.timing(batchUndoFade, { toValue: 1, duration: 250, useNativeDriver: true })]).start();
  }, [selectedIds, executeBatchInDB]);

  const batchDelete = useCallback(() => {
    const ids = Array.from(selectedIds); if (!ids.length) return;
    const prevItems = itemsRef.current;
    setItems(p => p.filter(i => !ids.includes(i.id)));
    setIsSelectMode(false); setSelectedIds(new Set()); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    batchCacheRef.current = { type: 'delete', ids, prevItems };
    setBatchUndoLabel(`已删除 ${ids.length} 项`);
    if (batchUndoTimer.current) clearTimeout(batchUndoTimer.current);
    batchUndoTimer.current = setTimeout(() => { executeBatchInDB('delete', ids); batchCacheRef.current = null; setBatchUndoLabel(''); }, 5000);
    batchUndoSlide.setValue(-80); batchUndoFade.setValue(0);
    Animated.parallel([Animated.spring(batchUndoSlide, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }), Animated.timing(batchUndoFade, { toValue: 1, duration: 250, useNativeDriver: true })]).start();
  }, [selectedIds, executeBatchInDB]);

  const handleBatchUndo = useCallback(() => {
    if (!batchCacheRef.current) return; const { prevItems } = batchCacheRef.current;
    setItems(prevItems); setBatchUndoLabel(''); batchCacheRef.current = null;
    if (batchUndoTimer.current) { clearTimeout(batchUndoTimer.current); batchUndoTimer.current = null; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const findItemAtPoint = (pageX: number, pageY: number, curItems: GoodItem[]) => {
    let candidates: any[] = []; const contentY = pageY - scrollTopRef.current + scrollYRef.current; const contentX = pageX - scrollLeftRef.current - 12;
    for (let i = 0; i < curItems.length; i++) { const ci = curItems[i]; if (!ci?.id) continue; const ly = layoutMapRef.current.get(ci.id); if (!ly) continue; if (contentY >= ly.y - 8 && contentY <= ly.y + ly.h + 8) candidates.push({ item: ci, index: i, ly }); }
    if (candidates.length === 0) { let minDist = Infinity; let best: any = null; for (let i = 0; i < curItems.length; i++) { const ci = curItems[i]; if (!ci?.id) continue; const ly = layoutMapRef.current.get(ci.id); if (!ly) continue; const d = Math.abs(contentY - (ly.y + ly.h / 2)); if (d < minDist) { minDist = d; best = { item: ci, index: i, ly }; } } if (best) candidates = [best]; }
    if (candidates.length === 0) return null; if (candidates.length === 1) return { item: candidates[0].item, index: candidates[0].index, layoutY: candidates[0].ly.y, layoutH: candidates[0].ly.h, layoutX: candidates[0].ly.x, layoutW: candidates[0].ly.w };
    let closest = candidates[0]; let cd = Infinity; for (const c of candidates) { const midX = c.ly.x + c.ly.w / 2; const d = Math.abs(contentX - midX); if (d < cd) { cd = d; closest = c; } }
    return { item: closest.item, index: closest.index, layoutY: closest.ly.y, layoutH: closest.ly.h, layoutX: closest.ly.x, layoutW: closest.ly.w };
  };
  const computeTargetIndex = (pageX: number, pageY: number, curItems: GoodItem[], excludeIndex: number) => { const r = findItemAtPoint(pageX, pageY, curItems); if (!r) return excludeIndex; if (r.index === excludeIndex) return excludeIndex; const contentY = pageY - scrollTopRef.current + scrollYRef.current; return contentY >= r.layoutY + r.layoutH / 2 && r.index < curItems.length ? r.index + 1 : r.index; };
  const doJellySpring = useCallback(() => { if (isExiting.current) return; LayoutAnimation.configureNext(LayoutAnimation.create(550, LayoutAnimation.Types.spring, LayoutAnimation.Properties.scaleXY)); }, []);
  const handleBack = useCallback(() => { isExiting.current = true; stopGlow(); onBack(); }, [onBack, stopGlow]);

  const dragPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => menuItemIdRef.current !== null || dragActive.current,
    onMoveShouldSetPanResponder: () => menuItemIdRef.current !== null || dragActive.current,
    onShouldBlockNativeResponder: () => false,
    onPanResponderGrant: () => {},
    onPanResponderMove: (_, gs) => { const totalMove = Math.abs(gs.dy) + Math.abs(gs.dx); if (!dragActive.current && menuItemIdRef.current && totalMove > 10) { dragActive.current = true; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setDragVisible(true); stopGlow(); setMenuItemId(null); menuItemIdRef.current = null; dragStartPageX.current = dragStartPageX.current + gs.dx; dragStartPageY.current = dragStartPageY.current + gs.dy; dragOffset.setValue({ x: 0, y: 0 }); return; } if (dragActive.current) { dragOffset.setValue({ x: gs.dx, y: gs.dy }); const curItems = itemsRef.current; const targetIdx = computeTargetIndex(dragStartPageX.current + gs.dx, dragStartPageY.current + gs.dy, curItems, dragSrcIndex.current); if (targetIdx !== highlightIndex) { setHighlightIndex(targetIdx); moveDropIndicator(targetIdx); } } },
    onPanResponderRelease: (_, gs) => { setHighlightIndex(null); Animated.timing(dropOpa, { toValue: 0, duration: 120, useNativeDriver: false }).start(); if (!dragActive.current) { if (menuItemIdRef.current) { setMenuItemId(null); menuItemIdRef.current = null; stopGlow(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } return; } dragActive.current = false; setDragVisible(false); const curItems = itemsRef.current; if (curItems.length < 2) { dragOffset.setValue({ x: 0, y: 0 }); return; } const targetIdx = computeTargetIndex(dragStartPageX.current + gs.dx, dragStartPageY.current + gs.dy, curItems, dragSrcIndex.current); const srcIdx = dragSrcIndex.current; if (targetIdx === srcIdx || targetIdx < 0 || targetIdx >= curItems.length) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); dragOffset.setValue({ x: 0, y: 0 }); return; } const prevItems = [...curItems]; const next = [...curItems]; const [moved] = next.splice(srcIdx, 1); const insertIdx = targetIdx > srcIdx ? targetIdx - 1 : targetIdx; next.splice(insertIdx, 0, moved); doJellySpring(); setItems(next); showUndo(prevItems); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); dragOffset.setValue({ x: 0, y: 0 }); },
    onPanResponderTerminate: () => { setHighlightIndex(null); dragActive.current = false; setDragVisible(false); dragOffset.setValue({ x: 0, y: 0 }); },
  })).current;

  const handlePlusPress = useCallback(() => { const limit = listInfoRef.current?.itemLimit || 100; const count = itemsRef.current.length; if (count >= 100) { Alert.alert('已达满载上限', '当前目录已达 100 件满载上限'); return; } if (count >= limit && limit < 100) { if (limit === 10) { Alert.alert('🎯 已达 10 件上限', '是否要扩充？', [{ text: '暂不', style: 'cancel' }, { text: '升级至 50', onPress: async () => { await updateListItemLimit(listId, 50); await animateAndRefresh(); setShowAddOverlay(true); } }, { text: '直接挑战 100', onPress: async () => { await updateListItemLimit(listId, 100); await animateAndRefresh(); setShowAddOverlay(true); } }]); return; } if (limit === 50) { Alert.alert('🎯 已达 50 件上限', '是否要扩充？', [{ text: '暂不', style: 'cancel' }, { text: '升级至 100', onPress: async () => { await updateListItemLimit(listId, 100); await animateAndRefresh(); setShowAddOverlay(true); } }]); return; } } setShowAddOverlay(true); }, [listId, animateAndRefresh]);
  const handleAddItem = async (text: string) => { const limit = listInfo?.itemLimit || 100; if (items.length >= 100) { Alert.alert('已达满载上限'); return; } if (items.length >= limit && limit < 100) { if (limit === 10) { Alert.alert('🎉 达成 10 件！', '挑战更多？', [{ text: '暂不', style: 'cancel' }, { text: '升级至 50', onPress: async () => { await updateListItemLimit(listId, 50); await addItem(listId, text.trim()); await animateAndRefresh(); } }, { text: '直接挑战 100', onPress: async () => { await updateListItemLimit(listId, 100); await addItem(listId, text.trim()); await animateAndRefresh(); } }]); return; } if (limit === 50) { Alert.alert('🎉 达成 50 件！', '挑战 100？', [{ text: '暂不', style: 'cancel' }, { text: '升级至 100', onPress: async () => { await updateListItemLimit(listId, 100); await addItem(listId, text.trim()); await animateAndRefresh(); } }]); return; } } await addItem(listId, text.trim()); await animateAndRefresh(); };
  const onSave = async () => { setModalVisible(false); setSelectedItem(null); await animateAndRefresh(); };
  const onClose = () => { setModalVisible(false); setSelectedItem(null); };

  if (loading) return <View style={st.ld}><ActivityIndicator size="large" color="#9BA4B5" /></View>;

  const done = items.filter(i => i && i.status === 'completed').length;
  const mode = getLayoutMode(items.length);
  const f = mode === 'fluid' ? getFluidStyles(items.length) : null;

  const draggedItem = dragVisible ? items.find(i => i.id === dragItemId.current) : null;
  const menuItem = menuItemId ? items.find(i => i.id === menuItemId) : null;

  return (
    <View style={st.r} {...dragPanResponder.panHandlers} onTouchStart={e => { dragStartPageX.current = e.nativeEvent.pageX; dragStartPageY.current = e.nativeEvent.pageY; }}>
      {ORBS.map((o, i) => <FloatingOrb key={i} {...o} />)}
      <View style={st.s}>
        <BlurView intensity={70} tint="light" style={st.h}>
          <TouchableOpacity onPress={() => { if (isSelectMode) toggleSelectMode(); else handleBack(); }} style={st.bb}><Text style={st.bt}>{isSelectMode ? '✕' : '←'}</Text></TouchableOpacity>
          <View style={st.hc}>
            <Text style={st.ht} numberOfLines={1}>{listInfo?.iconEmoji} {listInfo?.title}</Text>
            {isSelectMode && <Text style={st.selectCount}>{selectedIds.size} 项已选</Text>}
          </View>
          {isShared && onOpenTimeline ? (
            <TouchableOpacity onPress={() => onOpenTimeline(listInfo?.title || '', listInfo?.iconEmoji || '')} style={st.selectBtn}>
              <Text style={[st.selectBtnText, { color: '#E8A0BF' }]}>回忆</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={toggleSelectMode} style={st.selectBtn}><Text style={st.selectBtnText}>{isSelectMode ? '完成' : '选择'}</Text></TouchableOpacity>
          )}
        </BlurView>

        {/* Partner activity toast */}
        {partnerToast ? (
          <Animated.View style={[st.toastBar, { opacity: toastFade, transform: [{ translateY: toastFade.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
            <Text style={st.toastText}>{partnerToast}</Text>
          </Animated.View>
        ) : null}

        <View style={st.pb}><View style={[st.pf, { width: `${items.length ? (done / items.length) * 100 : 0}%` }]} /></View>
        <Text style={st.pt}>{done}/{items.length}</Text>

        <ScrollView style={st.sc} scrollEnabled={!dragActive.current && !menuItemId} contentContainerStyle={mode === 'gallery' ? st.galleryContainer : { ...st.fluidContainer, gap: f!.gap }} showsVerticalScrollIndicator={false} onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
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

            if (isDragged) return <View key={item.id} style={mode === 'gallery' ? [st.galleryCard, { backgroundColor: 'transparent', borderColor: 'transparent', width: GALLERY_STYLES.cardWidth }] : [pil.p, { backgroundColor: 'transparent', borderColor: 'transparent', paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }]} />;

            const isDeleting = deletingCapsuleId === item.id;
            const bv = bounceRefs.current.get(item.id);
            const bounceX = bv?.x;
            const bounceY = bv?.y;

            return (
              <Animated.View key={item.id} style={{ transform: bounceX && bounceY ? [{ translateX: bounceX }, { translateY: bounceY }] : [] }}
                onLayout={e => { const { y, height, x, width } = e.nativeEvent.layout; layoutMapRef.current.set(item.id, { y, h: height, x, w: width }); }}>
                {isSelected && (
                  <>
                    <Animated.View style={[st.glowLayer, mode === 'gallery' ? { width: GALLERY_STYLES.cardWidth } : { paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }, { backgroundColor: c, opacity: glowOuterOpacity, transform: [{ scale: glowOuterScale }] }]} pointerEvents="none" />
                    <Animated.View style={[st.glowLayer, mode === 'gallery' ? { width: GALLERY_STYLES.cardWidth } : { paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }, { backgroundColor: c, opacity: glowOpacity, transform: [{ scale: glowScale }] }]} pointerEvents="none" />
                  </>
                )}
                <TouchableOpacity activeOpacity={0.8} delayLongPress={400}
                  onPress={() => { if (isSelectMode) { toggleSelectItem(item.id); return; } toggleStatus(item); }}
                  onLongPress={(e) => {
                    if (isSelectMode || dragActive.current) return;
                    const raw = items.find(i => i.id === item.id);
                    if (!raw) return;
                    setMenuListId(item.id);
                    menuItemIdRef.current = item.id;
                    dragItemId.current = item.id;
                    dragSrcIndex.current = index;
                    dragItemColor.current = c;
                    dragItemTitle.current = raw.title;
                    const isG = mode === 'gallery';
                    dragIsGallery.current = isG;
                    if (isG) { dragItemFontSize.current = GALLERY_STYLES.fontSize; dragItemPadH.current = 16; dragItemPadV.current = 10; dragItemMinH.current = 44; dragItemCardW.current = GALLERY_STYLES.cardWidth; }
                    else {
                      const fStyles = getFluidStyles(items.length);
                      dragItemFontSize.current = fStyles.fontSize;
                      dragItemPadH.current = fStyles.padH;
                      dragItemPadV.current = fStyles.padV;
                      dragItemMinH.current = fStyles.minH;
                      dragItemCardW.current = SW - 44;
                    }
                    const ly = layoutMapRef.current.get(item.id);
                    if (ly) { dragPillX.current = scrollLeftRef.current + 12 + ly.x; dragPillW.current = ly.w; }
                    const pillXCenter = dragPillX.current + dragPillW.current / 2;
                    const pillTop = scrollTopRef.current + (layoutMapRef.current.get(item.id)?.y ?? 0) - scrollYRef.current;
                    dragStartPageX.current = pillXCenter;
                    dragStartPageY.current = pillTop + (layoutMapRef.current.get(item.id)?.h ?? 0) / 2;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    startGlow();
                  }}
                  style={[
                    mode === 'gallery' ? st.galleryCard : pil.p,
                    mode !== 'gallery' ? { paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH } : {},
                    mode === 'gallery' ? { width: GALLERY_STYLES.cardWidth } : {},
                    isSelected ? { backgroundColor: c, borderColor: 'rgba(255,255,255,0.7)', transform: [{ scale: jellyScale.interpolate({ inputRange: [0.6, 1], outputRange: [0.96, 1] }) }] } : {},
                    isDone ? { backgroundColor: c + '88' } : { backgroundColor: c + 'AA' },
                    isSelectMode && isSelected ? { backgroundColor: '#E8A0BF' } : {},
                  ]}
                >
                  <Animated.View style={isSelectMode && !selectedIds.has(item.id) ? { opacity: selectDimAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) } : {}}>
                    <View style={mode === 'gallery' ? st.galleryRow : pil.r}>
                      {isSelectMode && <View style={[st.checkCircle, selectedIds.has(item.id) && st.checkCircleSelected]}><Text style={st.checkMark}>{selectedIds.has(item.id) ? '✓' : ''}</Text></View>}
                      <Text style={mode === 'gallery' ? [st.galleryText, isDone && st.galleryTextDone] : [pil.t, { fontSize: f!.fontSize }, isDone && pil.tDone]} numberOfLines={2}>{item.title}</Text>
                      {!isSelectMode && isDone && <Text style={mode === 'gallery' ? st.galleryDoneMark : pil.dm}>✓</Text>}
                    </View>
                    {mem && <View style={mode === 'gallery' ? st.galleryMem : pil.mem}><Text style={mode === 'gallery' ? st.galleryMemT : pil.memT}>📓</Text></View>}
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </ScrollView>

        {isSelectMode && selectedIds.size > 0 && (
          <BlurView intensity={80} tint="light" style={st.batchBar}>
            <TouchableOpacity style={st.batchBtn} onPress={batchComplete}><Text style={st.batchBtnText}>✓ 完成</Text></TouchableOpacity>
            <TouchableOpacity style={[st.batchBtn, st.batchDelBtn]} onPress={batchDelete}><Text style={[st.batchBtnText, { color: '#FF3B30' }]}>🗑 删除</Text></TouchableOpacity>
          </BlurView>
        )}

        {batchUndoLabel ? (
          <BlurView intensity={85} tint="light" style={[st.batchBar, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
            <Animated.View style={{ flexDirection: 'row', alignItems: 'center', opacity: batchUndoFade, transform: [{ translateY: batchUndoSlide }] }}>
              <Text style={st.undoText}>{batchUndoLabel}</Text>
              <TouchableOpacity onPress={handleBatchUndo} style={st.undoBtn}><Text style={st.undoBtnText}>撤销</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setBatchUndoLabel(''); batchCacheRef.current = null; if (batchUndoTimer.current) { clearTimeout(batchUndoTimer.current); } }}><Text style={st.undoClose}>✕</Text></TouchableOpacity>
            </Animated.View>
          </BlurView>
        ) : null}

        {!isSelectMode && (undoItems ? (
          <BlurView intensity={85} tint="light" style={st.undoBar}>
            <Animated.View style={{ flexDirection: 'row', alignItems: 'center', opacity: undoFadeAnim, transform: [{ translateY: undoSlideAnim }] }}>
              <Text style={st.undoText}>已移动</Text>
              <TouchableOpacity onPress={() => { const p = undoItems; setUndoItems(null); setItems(p); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); }} style={st.undoBtn}><Text style={st.undoBtnText}>撤销</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setUndoItems(null)}><Text style={st.undoClose}>✕</Text></TouchableOpacity>
            </Animated.View>
          </BlurView>
        ) : null)}

        {!isSelectMode && !deletingCapsuleId && (
          <TouchableOpacity style={st.fab} onPress={handlePlusPress}>
            <Text style={st.fabText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      <MemoryModal visible={modalVisible} item={selectedItem} onClose={onClose} onSaved={onSave} />
      <AddItemOverlay visible={showAddOverlay} listId={listId} existingTitles={items.map(i => i.title)} onAdd={handleAddItem} onClose={() => setShowAddOverlay(false)} />

      {showCelebration && (
        <View style={st.celebO} pointerEvents="none">
          <Animated.View style={[st.celebCard, { opacity: celebOpacity, transform: [{ scale: celebScale }] }]}>
            <Text style={st.celebEmoji}>🎉</Text>
            <Text style={st.celebText}>太棒了！</Text>
          </Animated.View>
          {celebParticlesRef.current.map((p, i) => (
            <Animated.View key={i} style={{
              position: 'absolute', left: SW / 2, top: SH / 2,
              width: p.size, height: p.size,
              transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.sc }, { rotate: p.rot.interpolate({ inputRange: [-1, 1], outputRange: ['-20deg', '20deg'] }) }],
              opacity: p.op,
            }}>
              {p.shape === 'dot' ? (
                <View style={{ width: '100%', height: '100%', borderRadius: p.size / 2, backgroundColor: p.color }} />
              ) : p.shape === 'pill' ? (
                <View style={{ width: '100%', height: '60%', borderRadius: p.size / 3, backgroundColor: p.color, alignSelf: 'center', marginTop: '20%' }} />
              ) : (
                <Text style={{ fontSize: p.size, color: p.color }}>✦</Text>
              )}
            </Animated.View>
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  r: { flex: 1, backgroundColor: '#E8ECF1' },
  ld: { flex: 1, backgroundColor: '#E8ECF1', alignItems: 'center', justifyContent: 'center' },
  s: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  h: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 12, marginBottom: 4,
    borderRadius: 32, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.55)',
  },
  bb: { width: 36, height: 36 },
  bt: { fontSize: 20, color: '#2D3436', fontWeight: '600' },
  hc: { flex: 1, alignItems: 'center' },
  ht: { fontSize: 17, fontWeight: '700', color: '#2D3436' },
  selectCount: { fontSize: 12, color: '#7A8A9E' },
  selectBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.04)' },
  selectBtnText: { fontSize: 13, fontWeight: '600', color: '#636E72' },
  toastBar: {
    marginHorizontal: 12, marginBottom: 4, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 16, backgroundColor: '#FFE0E5', alignItems: 'center',
    borderWidth: 1, borderColor: '#E8A0BF44',
  },
  toastText: { fontSize: 13, fontWeight: '600', color: '#E8A0BF' },
  pb: { height: 3, backgroundColor: 'rgba(45,52,54,0.06)', marginHorizontal: 16, borderRadius: 1.5, overflow: 'hidden' },
  pf: { height: '100%', backgroundColor: '#7BC67E', borderRadius: 1.5 },
  pt: { fontSize: 11, color: '#7A8A9E', fontWeight: '600', textAlign: 'center', marginTop: 2 },
  sc: { flex: 1 },
  galleryContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 100, gap: 12 },
  fluidContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 100 },
  galleryCard: {
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, minHeight: 50,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#4A5568', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  galleryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  galleryText: { fontSize: 18, color: '#2D3436', fontWeight: '600', flex: 1, lineHeight: 24 },
  galleryTextDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  galleryDoneMark: { fontSize: 16, color: '#7BC67E', fontWeight: '700' },
  galleryMem: { marginTop: 4 },
  galleryMemT: { fontSize: 12, color: '#7A8A9E' },
  checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B2BEC3', alignItems: 'center', justifyContent: 'center' },
  checkCircleSelected: { borderColor: '#E8A0BF', backgroundColor: '#E8A0BF' },
  checkMark: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  e: { padding: 16 },
  ei: { fontSize: 16, color: '#2D3436', backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 12, padding: 12 },
  glowLayer: { position: 'absolute', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  batchBar: {
    position: 'absolute', bottom: 30, left: 20, right: 20, borderRadius: 20, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.55)', flexDirection: 'row', justifyContent: 'center', padding: 8, gap: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
  },
  batchBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(45,52,54,0.08)' },
  batchDelBtn: { backgroundColor: 'rgba(255,59,48,0.1)' },
  batchBtnText: { fontSize: 14, fontWeight: '700', color: '#2D3436' },
  undoBar: {
    position: 'absolute', bottom: 30, left: 20, right: 20, borderRadius: 20, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.55)', flexDirection: 'row', justifyContent: 'center', padding: 8, gap: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
  },
  undoText: { fontSize: 13, fontWeight: '600', color: '#2D3436' },
  undoBtn: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: '#E8A0BF' },
  undoBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  undoClose: { fontSize: 14, color: '#7A8A9E', marginLeft: 8 },
  fab: {
    position: 'absolute', bottom: 30, right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#2D3436', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  fabText: { fontSize: 28, color: '#FFF', marginTop: -2 },
  celebO: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  celebCard: {
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 24, paddingHorizontal: 40, paddingVertical: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#4A5568', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
    alignItems: 'center',
  },
  celebEmoji: { fontSize: 48 },
  celebText: { fontSize: 20, fontWeight: '800', color: '#2D3436', marginTop: 8 },
});

const pil = StyleSheet.create({
  p: {
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#4A5568', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  r: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  t: { color: '#2D3436', fontWeight: '600', flex: 1, lineHeight: 24 },
  tDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  dm: { fontSize: 16, color: '#7BC67E', fontWeight: '700' },
  mem: { marginTop: 4 },
  memT: { fontSize: 12, color: '#7A8A9E' },
});