# ──────────────────────────────────────────────────
# Des Moines Insider — Native iOS Build Targets
# ──────────────────────────────────────────────────
# Usage:
#   make setup          # First-time setup
#   make build          # Build for Simulator
#   make open           # Open in Xcode
#   make beta           # Ship to TestFlight
#   make release        # Ship to App Store Connect
# ──────────────────────────────────────────────────

.PHONY: help setup secrets generate build open clean beta release

SHELL := /bin/bash
PROJECT := DesMoinesInsider.xcodeproj
SCHEME := DesMoinesInsider

# ─── Help ────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Setup ───────────────────────────────────────
setup: ## First-time project setup (install tools + generate project)
	@echo "=== Installing dependencies ==="
	@command -v xcodegen &> /dev/null || brew install xcodegen
	@echo "=== Copying secrets template ==="
	@test -f Secrets.xcconfig || cp Secrets.xcconfig.example Secrets.xcconfig
	@echo "⚠️  Edit Secrets.xcconfig with your Supabase credentials"
	@echo ""
	$(MAKE) generate
	@echo ""
	@echo "✅ Setup complete. Run 'make open' to open in Xcode."

# ─── Generate Secrets ────────────────────────────
secrets: ## Generate Secrets.generated.swift from env vars or Secrets.xcconfig
	@bash scripts/generate-secrets.sh

# ─── Generate ────────────────────────────────────
generate: secrets ## Generate Xcode project from project.yml (runs secrets first)
	xcodegen generate
	@echo "✅ $(PROJECT) generated"

# ─── Build ───────────────────────────────────────
build: generate ## Build for iOS Simulator (no signing)
	xcodebuild build \
		-project $(PROJECT) \
		-scheme $(SCHEME) \
		-configuration Debug \
		-destination "platform=iOS Simulator,name=iPhone 16,OS=latest" \
		CODE_SIGN_IDENTITY="" \
		CODE_SIGNING_REQUIRED=NO \
		CODE_SIGNING_ALLOWED=NO \
		| xcpretty --color
	@echo "✅ Simulator build succeeded"

# ─── Open in Xcode ──────────────────────────────
open: generate ## Generate project and open in Xcode
	open $(PROJECT)

# ─── Fastlane: TestFlight ───────────────────────
beta: ## Build and upload to TestFlight
	@if command -v bundle &> /dev/null; then \
		bundle exec fastlane ios beta; \
	elif command -v fastlane &> /dev/null; then \
		fastlane ios beta; \
	else \
		echo "⚠️  Fastlane not found. Install with: gem install fastlane"; \
	fi

# ─── Fastlane: App Store ───────────────────────
release: ## Build and upload to App Store Connect
	@if command -v bundle &> /dev/null; then \
		bundle exec fastlane ios release; \
	elif command -v fastlane &> /dev/null; then \
		fastlane ios release; \
	else \
		echo "⚠️  Fastlane not found. Install with: gem install fastlane"; \
	fi

# ─── Clean ──────────────────────────────────────
clean: ## Remove build artifacts and generated project
	rm -rf build/
	rm -rf $(PROJECT)
	rm -rf DerivedData/
	rm -rf .build/
	@echo "🧹 Cleaned. Run 'make setup' to regenerate."
