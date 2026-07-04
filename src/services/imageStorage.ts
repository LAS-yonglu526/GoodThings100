/**
 * @copyright 2025 L.A.S 庸禄 (LAS-yonglu526). All rights reserved.
 * 好事100 (GoodThings100) — 数字清单 App
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator';

const MEDIA_DIR = `${FileSystem.documentDirectory}media/`;

/**
 * 确保媒体存储目录存在
 */
async function ensureMediaDirectory(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(MEDIA_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  }
}

/**
 * 将选取的图片复制到 App 永久存储目录
 */
async function copyImageToStorage(uri: string): Promise<string> {
  await ensureMediaDirectory();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
  const destPath = `${MEDIA_DIR}${fileName}`;
  await FileSystem.copyAsync({ from: uri, to: destPath });
  return destPath;
}

/**
 * 从相册选取图片（支持多选）
 */
export async function pickFromGallery(allowsMultiple = true): Promise<string[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('需要相册访问权限');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: allowsMultiple,
    quality: 0.8,
  });

  if (result.canceled || !result.assets) {
    return [];
  }

  const storedPaths: string[] = [];
  for (const asset of result.assets) {
    const storedPath = await copyImageToStorage(asset.uri);
    storedPaths.push(storedPath);
  }
  return storedPaths;
}

/**
 * 打开相机拍摄照片
 */
export async function takePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('需要相机访问权限');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  return copyImageToStorage(result.assets[0].uri);
}

/**
 * 删除指定路径的媒体文件
 */
export async function deleteMediaFile(uri: string): Promise<void> {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (fileInfo.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}
/**
 * 选择并压缩头像 (120×120)
 */
export async function pickAndCompressAvatar(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('需要相册访问权限');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  // 压缩到 150×150
  const manipResult = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 150, height: 150 } }],
    { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG }
  );
  // 复制到本地存储
  await ensureMediaDirectory();
  const fileName = `avatar_${Date.now()}.jpg`;
  const destPath = `${MEDIA_DIR}${fileName}`;
  await FileSystem.copyAsync({ from: manipResult.uri, to: destPath });
  return destPath;
}