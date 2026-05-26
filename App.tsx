import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { initDatabase, getAllItems, updateItemStatus, GoodItem } from './src/services/database';
import MemoryModal from './src/components/MemoryModal';

// 翻转卡片组件（RN 内置 Animated API）
function FlipCard({
  item,
  onPress,
  onLongPress,
  isCompleted,
  hasMemory,
}: {
  item: GoodItem;
  onPress: () => void;
  onLongPress: () => void;
  isCompleted: boolean;
  hasMemory: boolean;
}) {
  const flipAnim = useRef(new Animated.Value(0)).current;

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5],
    outputRange: [1, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0.5, 1],
    outputRange: [0, 1],
  });

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.spring(flipAnim, {
      toValue: 1,
      friction: 6,
      tension: 60,
      useNativeDriver: true,
    }).start();
    onLongPress();
  };

  const handleFlipBack = () => {
    Animated.spring(flipAnim, {
      toValue: 0,
      friction: 6,
      tension: 60,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={gStyles.cardWrapper}>
      <Animated.View
        style={[
          gStyles.cardFace,
          {
            transform: [{ perspective: 800 }, { rotateY: frontInterpolate }],
            opacity: frontOpacity,
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onPress}
          onLongPress={handleLongPress}
          delayLongPress={400}
          style={gStyles.cardTouchable}
        >
          <View style={gStyles.cardInner}>
            <Text
              style={[gStyles.cardTitle, isCompleted && gStyles.cardTitleDone]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <View style={gStyles.cardRight}>
              {hasMemory && <Text style={gStyles.memoryDot}>●</Text>}
              {isCompleted && <Text style={gStyles.checkMark}>✓</Text>}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={[
          gStyles.cardFace,
          {
            transform: [{ perspective: 800 }, { rotateY: backInterpolate }],
            opacity: backOpacity,
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleFlipBack}
          style={gStyles.cardBackTouchable}
        >
          <Text style={gStyles.cardBackText}>
            {isCompleted ? '已完成 ✨' : '记录此刻'}
          </Text>
          <Text style={gStyles.cardBackHint}>轻点返回</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function App() {
  const [items, setItems] = useState<GoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GoodItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const completedCount = items.filter((i) => i.status === 'completed').length;

  useEffect(() => {
    async function bootstrap() {
      await initDatabase();
      const data = await getAllItems();
      setItems(data);
      setLoading(false);
    }
    bootstrap();
  }, []);

  const refreshItems = useCallback(async () => {
    const data = await getAllItems();
    setItems(data);
  }, []);

  const handlePress = useCallback(async (item: GoodItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newStatus = item.status === 'completed' ? 'pending' : 'completed';
    await updateItemStatus(item.id, newStatus);
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              status: newStatus,
              completedAt: newStatus === 'completed' ? new Date().toISOString() : null,
            }
          : i
      )
    );
    if (newStatus === 'completed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  const handleLongPress = useCallback((item: GoodItem) => {
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setSelectedItem(null);
  }, []);

  const handleSaved = useCallback(async () => {
    setModalVisible(false);
    setSelectedItem(null);
    await refreshItems();
  }, [refreshItems]);

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#9BA4B5" />
        <Text style={s.loadingText}>好事加载中...</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      <View style={s.bgGradient}>
        <View style={s.bgCircle1} />
        <View style={s.bgCircle2} />
      </View>

      <View style={s.safeArea}>
        {/* 顶部导航（半透明毛玻璃模拟） */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>好事100</Text>
            <Text style={s.headerSub}>
              {completedCount === items.length
                ? '🎉 全部完成！'
                : `${items.length - completedCount} 件好事等你去做`}
            </Text>
          </View>
          <View style={s.placeholderBtn} />
        </View>

        {/* 进度条 */}
        <View style={s.progressBar}>
          <View
            style={[
              s.progressFill,
              { width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` },
            ]}
          />
        </View>

        {/* 列表 */}
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <FlipCard
              item={item}
              isCompleted={item.status === 'completed'}
              hasMemory={!!item.memoryText}
              onPress={() => handlePress(item)}
              onLongPress={() => handleLongPress(item)}
            />
          )}
        />

        {/* 底部提示 */}
        <View style={s.footer}>
          <Text style={s.footerText}>轻点标记 · 长按记录</Text>
        </View>
      </View>

      <MemoryModal
        visible={modalVisible}
        item={selectedItem}
        onClose={handleCloseModal}
        onSaved={handleSaved}
      />
    </View>
  );
}

// ====== 全局样式 ======
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8ECF1' },
  bgGradient: { ...StyleSheet.absoluteFillObject },
  bgCircle1: {
    position: 'absolute', top: -80, right: -60,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: '#C8D6E5', opacity: 0.4,
  },
  bgCircle2: {
    position: 'absolute', bottom: 100, left: -80,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#B8C9DD', opacity: 0.3,
  },
  loadingContainer: {
    flex: 1, backgroundColor: '#E8ECF1',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { fontSize: 15, color: '#7A8A9E', fontWeight: '500' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, marginHorizontal: 12, marginBottom: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#2D3436', letterSpacing: 3 },
  headerSub: { fontSize: 13, color: '#636E72', marginTop: 2, fontWeight: '500' },
  placeholderBtn: { width: 50 },
  progressBar: {
    height: 3, backgroundColor: 'rgba(45,52,54,0.06)',
    marginHorizontal: 16, borderRadius: 1.5, marginBottom: 8, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#6C7A8D', borderRadius: 1.5 },
  listContent: { paddingHorizontal: 14, paddingBottom: 80 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingVertical: 10, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  footerText: { fontSize: 12, color: '#7A8A9E', fontWeight: '500', letterSpacing: 1 },
});

// ====== 卡片样式 ======
const gStyles = StyleSheet.create({
  cardWrapper: { marginBottom: 10, height: 72 },
  cardFace: {
    position: 'absolute', width: '100%', height: '100%',
    backfaceVisibility: 'hidden',
  },
  cardTouchable: { width: '100%', height: '100%' },
  cardInner: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#4A5568', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#2D3436', flex: 1, letterSpacing: 0.5 },
  cardTitleDone: { textDecorationLine: 'line-through', color: '#B2BEC3', fontWeight: '400' },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  memoryDot: { fontSize: 10, color: '#74B9FF' },
  checkMark: { fontSize: 17, color: '#55A3AB', fontWeight: '700' },
  cardBackTouchable: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
  },
  cardBackText: { fontSize: 16, fontWeight: '700', color: '#2D3436', letterSpacing: 1 },
  cardBackHint: { fontSize: 11, color: '#7A8A9E', marginTop: 4 },
});