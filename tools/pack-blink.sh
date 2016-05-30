#!/bin/sh

echo -e "\n}\n" | cat tools/manifest-base.json - > manifest.json
zip -r tools/wanikani-notifier-fx.xpi ./* -x README.md .git tools/\*
rm -f manifest.json
