/**
 * @copyright 2025 L.A.S 庸禄 (LAS-yonglu526). All rights reserved.
 *
 * 热更新检测 — 仅 Android 端触发
 * iOS 端通过 App Store 正规审核渠道更新，不走 EAS Update OTA 机制
 */

import { Alert, Platform } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * iOS 端跳过检测（走 App Store 正规上架流程）
 * Android 端 checkForUpdateAsync → fetchUpdateAsync → 弹窗提示重启
 */
export async function checkAndPromptUpdate(): Promise<void> {
  // iOS 端不上热更新，直接返回
  if (Platform.OS !== 'android') {
    return;
  }

  // Expo 开发模式下 Updates API 不可用，直接返回
  if (__DEV__) {
    return;
  }

  try {
    const update = await Updates.checkForUpdateAsync();

    if (!update.isAvailable) {
      // 已是最新，无需操作
      return;
    }

    // 有新更新，静默下载
    const result = await Updates.fetchUpdateAsync();

    if (!result.isNew) {
      // 下载失败或无需更新
      return;
    }

    // 下载完成，提示用户重启
    Alert.alert(
      '✨ 新版本已就绪',
      '更新已下载完成，是否立即重启应用以体验最新版本？',
      [
        {
          text: '稍后再说',
          style: 'cancel',
        },
        {
          text: '立即重启',
          style: 'default',
          onPress: () => {
            Updates.reloadAsync();
          },
        },
      ],
      { cancelable: false },
    );
  } catch {
    // 静默失败——更新检测不应阻断正常使用
  }
}