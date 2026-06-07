const fs = require('fs');
let f = fs.readFileSync('src/screens/ListDetailScreen.tsx', 'utf8');

// Fix 1: bb center
f = f.replace(
  '  bb: { width: 36, height: 36 },',
  "  bb: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },"
);

// Fix 2: select mode keep original color + border
f = f.replace(
  "isSelectMode && selectedIds.has(item.id) ? { backgroundColor: '#E8A0BF' } : {},",
  "isSelectMode && selectedIds.has(item.id) ? { backgroundColor: c + 'DD', borderColor: c, borderWidth: 2.5 } : {},"
);

// Fix 3: pil.p justifyContent center
f = f.replace(
  '    borderRadius: 20, paddingHorizontal: 16, minHeight: 44,',
  "    borderRadius: 20, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center',"
);

// Fix 4: glow layer use actual dimensions
const oldGlow = `{isSelected && (
                  <>
                    <Animated.View style={[st.glowLayer, mode === 'gallery' ? { width: GALLERY_STYLES.cardWidth } : { paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }, { backgroundColor: c, opacity: glowOuterOpacity, transform: [{ scale: glowOuterScale }] }]} pointerEvents="none" />
                    <Animated.View style={[st.glowLayer, mode === 'gallery' ? { width: GALLERY_STYLES.cardWidth } : { paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }, { backgroundColor: c, opacity: glowOpacity, transform: [{ scale: glowScale }] }]} pointerEvents="none" />
                  </>
                )}`;
const newGlow = `{isSelected && (() => {
                  const gl = layoutMapRef.current.get(item.id);
                  const gw = gl ? gl.w : (mode === 'gallery' ? GALLERY_STYLES.cardWidth : (SW - 44));
                  const gh = gl ? gl.h : (f ? f.minH : 44);
                  return (
                    <>
                      <Animated.View style={[st.glowLayer, { width: gw, height: gh }, { backgroundColor: c, opacity: glowOuterOpacity, transform: [{ scale: glowOuterScale }] }]} pointerEvents="none" />
                      <Animated.View style={[st.glowLayer, { width: gw, height: gh }, { backgroundColor: c, opacity: glowOpacity, transform: [{ scale: glowScale }] }]} pointerEvents="none" />
                    </>
                  );
                })()}`;
f = f.replace(oldGlow, newGlow);

// Fix 5: memory warning always show if hasMemory
f = f.replace(
  'if (hasMemory && !memoryWarnedRef.current) {',
  'if (hasMemory) {'
);
f = f.replace(
  "memoryWarnedRef.current = true;\n        Alert.alert('手记提醒'",
  "Alert.alert('手记提醒'"
);

// Fix 6a: batchBar bottom→top
f = f.replace(
  "bottom: 30, left: 20, right: 20, borderRadius: 20, overflow: 'hidden',\n    backgroundColor: 'rgba(255,255,255,0.55)', flexDirection: 'row', justifyContent: 'center', padding: 8, gap: 10,\n    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',\n  },\n  batchBtn",
  "top: 100, left: 20, right: 20, borderRadius: 20, overflow: 'hidden',\n    backgroundColor: 'rgba(255,255,255,0.55)', flexDirection: 'row', justifyContent: 'center', padding: 8, gap: 10,\n    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',\n  },\n  batchBtn"
);

// Fix 6b: undoBar bottom→top
f = f.replace(
  "bottom: 30, left: 20, right: 20, borderRadius: 20, overflow: 'hidden',\n    backgroundColor: 'rgba(255,255,255,0.55)', flexDirection: 'row', justifyContent: 'center', padding: 8, gap: 10,\n    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',\n  },\n  undoText",
  "top: 100, left: 20, right: 20, borderRadius: 20, overflow: 'hidden',\n    backgroundColor: 'rgba(255,255,255,0.55)', flexDirection: 'row', justifyContent: 'center', padding: 8, gap: 10,\n    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',\n  },\n  undoText"
);

// Fix 7: Remove ✕ from batchUndo
f = f.replace(
  "              <TouchableOpacity onPress={() => { setBatchUndoLabel(''); batchCacheRef.current = null; if (batchUndoTimer.current) { clearTimeout(batchUndoTimer.current); } }}><Text style={st.undoClose}>✕</Text></TouchableOpacity>",
  ""
);

// Fix 8: Remove ✕ from undoBar
f = f.replace(
  "              <TouchableOpacity onPress={() => setUndoItems(null)}><Text style={st.undoClose}>✕</Text></TouchableOpacity>",
  ""
);

fs.writeFileSync('src/screens/ListDetailScreen.tsx', f);
console.log('All fixes applied successfully');