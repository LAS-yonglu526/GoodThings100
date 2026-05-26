import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GoodItem, updateItemMemory } from '../services/database';
import { pickFromGallery, takePhoto, deleteMediaFile } from '../services/imageStorage';

interface MemoryModalProps {
  visible: boolean;
  item: GoodItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function MemoryModal({ visible, item, onClose, onSaved }: MemoryModalProps) {
  const [memoryText, setMemoryText] = useState('');
  const [mediaUris, setMediaUris] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setMemoryText(item.memoryText || '');
      try {
        setMediaUris(JSON.parse(item.mediaUris || '[]'));
      } catch {
        setMediaUris([]);
      }
    }
  }, [item]);

  if (!item) return null;

  const handleTakePhoto = async () => {
    try {
      const uri = await takePhoto();
      if (uri) setMediaUris((prev) => [...prev, uri]);
    } catch (err: any) {
      Alert.alert('提示', err.message || '无法打开相机');
    }
  };

  const handlePickImage = async () => {
    try {
      const uris = await pickFromGallery(true);
      setMediaUris((prev) => [...prev, ...uris]);
    } catch (err: any) {
      Alert.alert('提示', err.message || '无法访问相册');
    }
  };

  const handleRemoveImage = (uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    deleteMediaFile(uri);
    setMediaUris((prev) => prev.filter((u) => u !== uri));
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await updateItemMemory(item.id, memoryText, JSON.stringify(mediaUris));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (err: any) {
      Alert.alert('保存失败', err.message || '请重试');
    } finally {
      setIsSaving(false);
    }
  };

  const renderMediaGrid = () => {
    if (mediaUris.length === 0) return null;
    return (
      <View style={ms.mediaGrid}>
        {mediaUris.map((uri) => {
          const total = mediaUris.length;
          let w: any = '48%'; let h = 120;
          if (total === 1) { w = '100%'; h = 200; }
          else if (total === 2) { w = '48%'; h = 140; }

          return (
            <TouchableOpacity
              key={uri}
              style={[ms.mediaItem, { width: w, height: h }]}
              onLongPress={() => handleRemoveImage(uri)}
              activeOpacity={0.8}
            >
              <Image source={{ uri }} style={ms.mediaImage} />
              <View style={ms.removeHint}>
                <Text style={ms.removeHintText}>长按删除</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={ms.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 顶部栏（半透明毛玻璃） */}
        <View style={ms.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={ms.cancelText}>取消</Text>
          </TouchableOpacity>
          <Text style={ms.headerTitle}>手记</Text>
          <TouchableOpacity onPress={handleSave} disabled={isSaving}>
            <Text style={[ms.saveText, isSaving && ms.saveDisabled]}>
              {isSaving ? '保存中...' : '保存'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={ms.scroll}
          contentContainerStyle={ms.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={ms.itemTitle}>{item.title}</Text>

          {renderMediaGrid()}

          <View style={ms.addRow}>
            <TouchableOpacity style={ms.addBtn} onPress={handleTakePhoto}>
              <Text style={ms.addIcon}>📷</Text>
              <Text style={ms.addLabel}>拍照</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ms.addBtn} onPress={handlePickImage}>
              <Text style={ms.addIcon}>🖼️</Text>
              <Text style={ms.addLabel}>相册</Text>
            </TouchableOpacity>
          </View>

          <View style={ms.textBox}>
            <TextInput
              style={ms.textInput}
              placeholder="记录此刻的心情..."
              placeholderTextColor="#B2BEC3"
              multiline
              value={memoryText}
              onChangeText={setMemoryText}
              textAlignVertical="top"
            />
          </View>

          {item.completedAt && (
            <Text style={ms.dateStamp}>{formatDate(item.completedAt)}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8ECF1' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 16, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  cancelText: { fontSize: 16, color: '#636E72', fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#2D3436' },
  saveText: { fontSize: 16, fontWeight: '700', color: '#2D3436' },
  saveDisabled: { color: '#B2BEC3' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 },
  itemTitle: { fontSize: 24, fontWeight: '800', color: '#2D3436', marginBottom: 20, letterSpacing: 0.5 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  mediaItem: { borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.3)' },
  mediaImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  removeHint: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  removeHintText: { fontSize: 10, color: '#FFF', fontWeight: '500' },
  addRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  addBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 16, paddingVertical: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
  },
  addIcon: { fontSize: 28, marginBottom: 6 },
  addLabel: { fontSize: 13, color: '#636E72', fontWeight: '600' },
  textBox: {
    backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 16, marginBottom: 12, minHeight: 150,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
  textInput: {
    padding: 16, fontSize: 16, color: '#2D3436', minHeight: 150, lineHeight: 25, fontWeight: '500',
  },
  dateStamp: { fontSize: 13, color: '#7A8A9E', fontWeight: '500', marginTop: 4 },
});