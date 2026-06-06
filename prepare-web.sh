#!/bin/sh
rm -rf web-dist
mkdir web-dist
cp index.html style.css web-dist/
cp -r js web-dist/
# Copy PWA files if they exist
cp manifest.json web-dist/ 2>/dev/null || true
cp icon-192.png web-dist/ 2>/dev/null || true
cp sw.js web-dist/ 2>/dev/null || true
