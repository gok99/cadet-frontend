#!/bin/bash
set -e

REPO="git@github.com:gok99/source-dc.git"
BUILD_DIR="build"

echo "Building with ASSET_PREFIX=/source-dc/ ..."
ASSET_PREFIX="/source-dc/" REACT_APP_BASE_URL="/source-dc" yarn build

cp "$BUILD_DIR/index.html" "$BUILD_DIR/404.html"

echo "Deploying to $REPO (gh-pages branch)..."
cd "$BUILD_DIR"
git init
git checkout -b gh-pages
git add -A
git commit -m "Deploy"
git push -f "$REPO" gh-pages
rm -rf .git

echo "Deployed to gh-pages branch of $REPO"
