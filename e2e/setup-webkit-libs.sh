#!/usr/bin/env bash
# WebKit (iOS Safari エンジン) を headless 起動するための不足システムライブラリを
# sudo 無しで導入する。Playwright webkit の sys/lib に直接配置する方式。
#   要因: この環境では playwright install-deps webkit (sudo必須) が使えないため、
#         apt-get download で .deb を取得し dpkg -x で展開、WebKit 内部 sys/lib へコピー。
set -e
WKDIR=$(ls -d ~/.cache/ms-playwright/webkit-*/ 2>/dev/null | head -1)
[ -z "$WKDIR" ] && { echo "webkit が未インストール。npx playwright install webkit を先に"; exit 1; }
TMP=$(mktemp -d)
cd "$TMP"
echo "不足ライブラリを取得中..."
apt-get download libavif13 libgav1-0 libyuv0 libgstreamer-plugins-bad1.0-0 2>/dev/null || true
for d in *.deb; do [ -f "$d" ] && dpkg -x "$d" . 2>/dev/null; done
SYS="$TMP/usr/lib/x86_64-linux-gnu"
for sub in minibrowser-wpe minibrowser-gtk; do
  dest="$WKDIR/$sub/sys/lib"
  [ -d "$dest" ] && cp -n "$SYS"/*.so* "$dest/" 2>/dev/null && echo "  → $sub/sys/lib に配置"
done
rm -rf "$TMP"
echo "完了。node -e \"require('playwright').webkit.launch()\" で起動確認可"
