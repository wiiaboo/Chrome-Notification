#!/bin/sh

cat tools/manifest-{base,fx}.json > manifest.json
rm -f tools/wanikani-notifier-fx.xpi
zip -r tools/wanikani-notifier-fx.xpi ./* -x README.md .git tools/\*
rm -f manifest.json
