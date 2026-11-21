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

# The CLI runs from dist/ (gitignored) and publishing uses --ignore-scripts, so build it
# here. A stale or missing dist would otherwise be published silently.
echo "🔨 Building @rn-perf-kit/cli..."
(cd "$ROOT_DIR/packages/cli" && rm -rf dist && npx tsc --project tsconfig.build.json)
test -f "$ROOT_DIR/packages/cli/dist/cli.js" || { echo "❌ CLI build produced no dist/cli.js"; exit 1; }
echo ""

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
  
  # Re-running after a partial failure skips what is already live; any other publish
  # error stops the script (packages depend on each other, so a gap breaks installs).
  if [ "$(npm view "$PKG_NAME@$PKG_VERSION" version 2>/dev/null)" = "$PKG_VERSION" ]; then
    echo "⏭  $PKG_NAME@$PKG_VERSION is already on npm, skipping."
    echo ""
    continue
  fi
  echo "📦 Publishing $PKG_NAME@$PKG_VERSION ($PKG)..."
  cd "$PKG_DIR"
  npm publish --access public --ignore-scripts
  echo "  ✓ Published $PKG_NAME@$PKG_VERSION"
  echo ""
done

echo "🎉 All packages published successfully to npm!"
echo "👉 Test installation in any app with: npm install rn-perf-kit"
