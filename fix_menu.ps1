$file = 'src/screens/ListDetailScreen.tsx'
$content = [System.IO.File]::ReadAllText($file)

# 1) 调高拖拽触发阈值: 10 → 25
$content = $content.Replace('totalMove > 10', 'totalMove > 25')

# 2) 松手不再关闭菜单 — 删掉 release 里关闭菜单的逻辑
$old = 'if (!dragActive.current) { if (menuItemIdRef.current) { setMenuItemId(null); menuItemIdRef.current = null; stopGlow(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } return; }'
$new = 'if (!dragActive.current) return;'
$content = $content.Replace($old, $new)

[System.IO.File]::WriteAllText($file, $content)
Write-Host '✓ 菜单修复完成'