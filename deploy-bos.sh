#!/bin/bash
# deploy-bos.sh — 一键部署到百度 BOS 内网
# 首次使用前需要：
#   1. brew tap baidubce/tap && brew install bcecmd
#   2. bcecmd configure  (输入 region: bj, AK, SK)
#   3. 在百度云控制台创建 bucket 并开启静态网站托管

BUCKET="${BOS_BUCKET:-preview-tool}"
REGION="${BOS_REGION:-bj}"
ENDPOINT="https://${BUCKET}.${REGION}.bcebos.com"

BCECMD="${HOME}/bin/bcecmd"

if ! [ -x "$BCECMD" ]; then
  echo "错误: bcecmd 未安装"
  echo "安装: 下载 arm64-mac-bcecmd 到 ~/bin/bcecmd"
  exit 1
fi

echo "正在同步到 BOS: bos:/${BUCKET}/ ..."

$BCECMD bos sync . "bos:/${BUCKET}/" \
  --exclude ".git/*" \
  --exclude ".codegraph/*" \
  --exclude "CLAUDE.md" \
  --exclude "deploy-bos.sh" \
  --exclude ".github/*" \
  --exclude ".claude/*"

if [ $? -eq 0 ]; then
  echo ""
  echo "部署成功!"
  echo "访问地址: ${ENDPOINT}/index.html"
else
  echo "部署失败，请检查 bcecmd configure 配置"
  exit 1
fi
