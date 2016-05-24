#!/bin/sh

cat tools/manifest-{base,fx}.json > manifest.json
zip -r tools/wanikani-notifier-fx.xpi ./* -x README.md .git tools/\*
rm -f manifest.json