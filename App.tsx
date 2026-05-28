import { StatusBar } from 'expo-status-bar';
import React, { useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, View } from 'react-native';
import ListHomeScreen from './src/screens/ListHomeScreen';
import ListDetailScreen from './src/screens/ListDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { CardLayout } from './src/screens/ListHomeScreen';

const { width: SW } = Dimensions.get('window');

type Overlay = 'none' | 'detail' | 'settings';

export default function App() {
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const cardLayout = useRef<CardLayout>({ x: 0, y: 0, width: SW, height: 600 });

  // 覆盖层右滑返回手势
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderMove: (_, g) => { if (g.dx > 0) slideAnim.setValue(g.dx); },
    onPanResponderRelease: (_, g) => {
      if (g.dx > SW * 0.3) {
        Animated.timing(slideAnim, { toValue: SW, duration: 220, useNativeDriver: true }).start(() => closeOverlay());
      } else {
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  const openOverlay = (type: Overlay, listId?: string, layout?: CardLayout) => {
    if (listId) setSelectedListId(listId);
    if (layout) cardLayout.current = layout;
    setOverlay(type);
    if (type === 'settings') {
      // 设置页保持右滑推入
      slideAnim.setValue(SW * 0.15);
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
    } else if (layout) {
      // 详情页：卡片缩放转场
      scaleAnim.setValue(0.5);
      slideAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
      ]).start();
    }
  };

  const closeOverlay = () => {
    if (overlay === 'detail') {
      // 详情页：缩小回卡片
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.5, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: SW * 0.1, friction: 9, tension: 30, useNativeDriver: true }),
      ]).start(() => { setOverlay('none'); scaleAnim.setValue(1); slideAnim.setValue(0); });
    } else {
      Animated.spring(slideAnim, { toValue: SW, friction: 9, tension: 30, useNativeDriver: true })
        .start(() => { setOverlay('none'); });
    }
  };

  // 首页始终渲染
  return (
    <View style={s.container}>
      <StatusBar style="dark" />
      {/* 首页底层 */}
      <ListHomeScreen
        onSelectList={(id, layout) => openOverlay('detail', id, layout)}
        onGoSettings={() => openOverlay('settings', undefined, undefined)}
      />

      {/* 详情页覆盖层 */}
      {overlay === 'detail' && (
        <Animated.View style={[s.overlay, { transform: [{ translateX: slideAnim }, { scale: scaleAnim }] }]} {...panResponder.panHandlers}>
          <ListDetailScreen listId={selectedListId} onBack={closeOverlay} />
        </Animated.View>
      )}

      {/* 设置页覆盖层 */}
      {overlay === 'settings' && (
        <Animated.View style={[s.overlay, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
          <SettingsScreen onBack={closeOverlay} />
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E8ECF1',
  },
});