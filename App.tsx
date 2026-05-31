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
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const cardLayout = useRef<CardLayout>({ x: 0, y: 0, width: SW, height: 600 });

  // 🔧 简化右滑返回：直接平推，去掉卡片折叠的二次动画
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderMove: (_, g) => { if (g.dx > 0) slideAnim.setValue(g.dx); },
    onPanResponderRelease: (_, g) => {
      if (g.dx > SW * 0.3) {
        // 直接滑出，不重置 slideAnim（避免卸载前闪现）
        Animated.timing(slideAnim, { toValue: SW, duration: 250, useNativeDriver: true }).start(() => {
          setOverlay('none');
          setHomeRefreshKey(k => k + 1);
        });
      } else {
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
      }
    },
  })).current;

  const openOverlay = (type: Overlay, listId?: string, layout?: CardLayout) => {
    if (listId) setSelectedListId(listId);
    if (layout) cardLayout.current = layout;
    setOverlay(type);
    if (type === 'settings') {
      slideAnim.setValue(SW * 0.15);
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
    } else {
      // 详情页：纯右滑推入，无缩放
      slideAnim.setValue(SW * 0.15);
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
    }
  };

  // 🔧 关闭不经过二次动画，直接平推关闭（不重置值避免闪屏）
  const closeOverlay = () => {
    Animated.timing(slideAnim, { toValue: SW, duration: 250, useNativeDriver: true })
      .start(() => { setOverlay('none'); setHomeRefreshKey(k => k + 1); });
  };

  return (
    <View style={s.container}>
      <StatusBar style="dark" />
      <ListHomeScreen
        refreshKey={homeRefreshKey}
        onSelectList={(id, layout) => openOverlay('detail', id, layout)}
        onGoSettings={() => openOverlay('settings', undefined, undefined)}
      />

      {overlay === 'detail' && (
        <Animated.View style={[s.overlay, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
          <ListDetailScreen listId={selectedListId} onBack={closeOverlay} />
        </Animated.View>
      )}

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