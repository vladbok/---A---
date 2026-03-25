#!/bin/bash
# update.sh — скачивает свежий zip с GitHub и пушит на телефон
REPO="vladbok/---A---"
ZIP_URL="https://github.com/$REPO/raw/main/avr-extension.zip"
TMP="/tmp/avr-extension.zip"

echo "⬇ Скачиваю с GitHub..."
curl -sL "$ZIP_URL" -o "$TMP"

echo "📲 Пушу на телефон..."
adb push "$TMP" /storage/emulated/0/Download/avr-extension.zip

echo "✅ Готово. Переустанови расширение в Лемур: lemur://extensions"
