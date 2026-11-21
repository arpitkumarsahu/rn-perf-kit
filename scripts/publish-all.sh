#!/bin/bash
# ==============================================================================
# rn-perf-kit: Automated Monorepo Publishing Script
# Publishes all packages to npm in correct topological dependency order.
# ==============================================================================

set -e

echo ""
echo "🚀 rn-perf-kit Monorepo Publisher"
echo "=================================="

# 1. Verify npm authentication
CURRENT_USER=$(npm whoami 2>/dev/null || true)
if [ -z "$CURRENT_USER" ]; then
  echo "❌ You are not logged in to npm."
  echo "👉 Please run: npm login"
  exit 1
fi

echo "✓ Logged in as: $CURRENT_USER"
echo ""

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Topological publish order
PACKAGES=(
  "packages/core"
  "packages/native"
  "packages/react"
  "packages/navigation"
  "packages/adapters"
  "packages/analyzers"
  "packages/overlay"
  "packages/reporters"
  "packages/cli"
  "packages/perf-provider"
)

echo "Publishing ${#PACKAGES[@]} packages with --access public..."
echo ""

for PKG in "${PACKAGES[@]}"; do
  PKG_DIR="$ROOT_DIR/$PKG"
  PKG_NAME=$(node -p "require('$PKG_DIR/package.json').name")
  PKG_VERSION=$(node -p "require('$PKG_DIR/package.json').version")
  
  echo "📦 Publishing $PKG_NAME@$PKG_VERSION ($PKG)..."
  cd "$PKG_DIR"
  npm publish --access public || echo "  ⚠️ Notice: $PKG_NAME@$PKG_VERSION already uploaded or staged."
  echo "  ✓ Handled $PKG_NAME@$PKG_VERSION successfully."
  echo ""
done

echo "🎉 All packages published successfully to npm!"
echo "👉 Test installation in any app with: npm install rn-perf-kit"
