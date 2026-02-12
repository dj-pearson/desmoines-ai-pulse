# ──────────────────────────────────────────────────
# Des Moines AI Pulse — Mobile App Build Targets
# ──────────────────────────────────────────────────
# Usage:
#   make setup          # First-time setup (install everything)
#   make ios            # Build & open iOS simulator
#   make android        # Build & open Android emulator
#   make screenshots    # Generate store submission screenshots
#   make beta-ios       # Ship to TestFlight
#   make beta-android   # Ship to Play Internal Testing
# ──────────────────────────────────────────────────

.PHONY: help setup install pods build build-ios build-android \
        ios android sync clean lint type-check validate \
        beta-ios beta-android release-ios release-android \
        screenshots screenshots-apple screenshots-google

SHELL := /bin/bash

# ─── Help ────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Setup ───────────────────────────────────────
setup: install pods ## First-time project setup
	@echo "✅ Setup complete. Run 'make ios' or 'make android' to start."

install: ## Install npm dependencies
	npm install
	cd .. && npm install

pods: ## Install CocoaPods dependencies (macOS only)
	@if command -v pod &> /dev/null; then \
		cd ios/App && pod install; \
	else \
		echo "⚠️  CocoaPods not found. Install with: sudo gem install cocoapods"; \
	fi

# ─── Build ───────────────────────────────────────
build: ## Build web assets for mobile
	npm run build

build-ios: build ## Build web assets and sync to iOS
	npm run build:ios

build-android: build ## Build web assets and sync to Android
	npm run build:android

# ─── Run ─────────────────────────────────────────
ios: build-ios ## Build and open in iOS Simulator
	npx cap open ios

android: build-android ## Build and open in Android Studio
	npx cap open android

dev: ## Start Vite dev server for live-reload
	npm run dev

sync: ## Sync web assets to native projects
	npx cap sync

# ─── Quality ─────────────────────────────────────
lint: ## Run ESLint
	cd .. && npm run lint

type-check: ## Run TypeScript type checker
	cd .. && npm run type-check

validate: lint type-check build ## Full validation (lint + types + build)
	@echo "✅ Validation passed."

# ─── Screenshots ─────────────────────────────────
screenshots: ## Generate all store screenshots (Apple + Google)
	cd .. && npm run screenshots:stores

screenshots-apple: ## Generate Apple App Store screenshots only
	cd .. && npm run screenshots:apple

screenshots-google: ## Generate Google Play Store screenshots only
	cd .. && npm run screenshots:google

# ─── Fastlane Releases ───────────────────────────
beta-ios: build ## Build and upload to TestFlight
	@if command -v bundle &> /dev/null; then \
		bundle exec fastlane ios beta; \
	else \
		echo "⚠️  Bundler not found. Run: gem install bundler && bundle install"; \
	fi

beta-android: build ## Build and upload to Play Internal Testing
	@if command -v bundle &> /dev/null; then \
		bundle exec fastlane android beta; \
	else \
		echo "⚠️  Bundler not found. Run: gem install bundler && bundle install"; \
	fi

release-ios: build ## Build and upload to App Store
	@if command -v bundle &> /dev/null; then \
		bundle exec fastlane ios release; \
	else \
		echo "⚠️  Bundler not found. Run: gem install bundler && bundle install"; \
	fi

release-android: build ## Build and upload to Google Play Production
	@if command -v bundle &> /dev/null; then \
		bundle exec fastlane android release; \
	else \
		echo "⚠️  Bundler not found. Run: gem install bundler && bundle install"; \
	fi

# ─── Clean ───────────────────────────────────────
clean: ## Remove build artifacts
	rm -rf www/
	rm -rf ios/App/Pods/
	rm -rf android/app/build/
	rm -rf android/.gradle/
	rm -rf node_modules/
	@echo "🧹 Cleaned build artifacts. Run 'make setup' to reinstall."
