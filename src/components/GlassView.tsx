/**
 * @copyright 2025 L.A.S 庸禄 (LAS-yonglu526). All rights reserved.
 * 好事100 (GoodThings100) — 数字清单 App
 */

import React from 'react';
import { Platform, View, ViewStyle, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';

/** 标准化安全区顶部高度，替代所有硬编码 Platform.OS === 'ios' ? 54 : 30 */
export const SAFE_TOP = Platform.OS === 'ios'
  ? Math.max(Constants.statusBarHeight, 44) + 10
  : Math.max(Constants.statusBarHeight, 24) + 8;

interface GlassViewProps {
  intensity: number;
  tint?: 'light' | 'dark' | 'default';
  style?: ViewStyle;
  children?: React.ReactNode;
}

/**
 * iOS: 原生 UIBlurEffect 毛玻璃
 * Android: 半透明白底 + elevation 投影降级（无系统级模糊 API）
 */
export default function GlassView({ intensity, tint, style, children }: GlassViewProps) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint={tint || 'light'} style={style}>
        {children}
      </BlurView>
    );
  }

  // Android fallback: 半透明白底模拟毛玻璃感
  return (
    <View
      style={[
        style,
        styles.androidFallback,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  androidFallback: {
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});