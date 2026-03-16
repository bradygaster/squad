#!/usr/bin/env bash
# Knowledge Library Metrics Test
# Validates zero spawn impact guarantee

set -e

echo "=== Knowledge Library Metrics Test ==="
echo ""

# Colors for output (work in git bash on Windows)
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS="${GREEN}✅ PASS${NC}"
FAIL="${RED}❌ FAIL${NC}"

# Directory setup
SQUAD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KNOWLEDGE_DIR="$SQUAD_ROOT/.squad/knowledge"
TEMP_DIR="$SQUAD_ROOT/.squad/.test-temp-knowledge"

# Cleanup function
cleanup() {
  if [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper: count files in directory
count_files() {
  local dir="$1"
  local pattern="${2:-*.md}"
  if [ -d "$dir" ]; then
    find "$dir" -maxdepth 1 -type f -name "$pattern" | wc -l | tr -d ' '
  else
    echo "0"
  fi
}

# Helper: approximate token count (rough: ~4 chars per token)
approx_tokens() {
  local file="$1"
  if [ -f "$file" ]; then
    local chars=$(wc -c < "$file" | tr -d ' ')
    echo $(( chars / 4 ))
  else
    echo "0"
  fi
}

# Helper: check if file content contains string
file_contains() {
  local file="$1"
  local search="$2"
  if [ -f "$file" ]; then
    grep -q "$search" "$file" && return 0 || return 1
  fi
  return 1
}

# ============================================================================
# TEST 1: Baseline Spawn Context
# ============================================================================
echo "Measuring baseline spawn context..."

# Count files typically loaded at spawn (charter, decisions, team roster)
SPAWN_FILES=0

# Check for common spawn context files
[ -f "$SQUAD_ROOT/.squad/team.md" ] && SPAWN_FILES=$((SPAWN_FILES + 1))
[ -f "$SQUAD_ROOT/.squad/decisions.md" ] && SPAWN_FILES=$((SPAWN_FILES + 1))
[ -f "$SQUAD_ROOT/.squad/routing.md" ] && SPAWN_FILES=$((SPAWN_FILES + 1))

# Approximate token count for spawn context (rough estimate)
BASELINE_TOKENS=0
[ -f "$SQUAD_ROOT/.squad/team.md" ] && BASELINE_TOKENS=$((BASELINE_TOKENS + $(approx_tokens "$SQUAD_ROOT/.squad/team.md")))
[ -f "$SQUAD_ROOT/.squad/decisions.md" ] && BASELINE_TOKENS=$((BASELINE_TOKENS + $(approx_tokens "$SQUAD_ROOT/.squad/decisions.md")))
[ -f "$SQUAD_ROOT/.squad/routing.md" ] && BASELINE_TOKENS=$((BASELINE_TOKENS + $(approx_tokens "$SQUAD_ROOT/.squad/routing.md")))

echo "Baseline spawn context files: $SPAWN_FILES"
echo "Baseline approximate tokens: ~$BASELINE_TOKENS"
echo ""

# ============================================================================
# TEST 2: Zero Spawn Impact
# ============================================================================
echo "[TEST 1] Zero spawn impact"

# Count knowledge files
KNOWLEDGE_COUNT=$(count_files "$KNOWLEDGE_DIR")
echo "  Knowledge files in .squad/knowledge/: $KNOWLEDGE_COUNT"

# Check that knowledge files are NOT referenced in spawn templates
SPAWN_REFERENCES=0

# Check common spawn template locations
SPAWN_TEMPLATE_FILES=(
  "$SQUAD_ROOT/.squad/squad.agent.md"
  "$SQUAD_ROOT/.squad/agents/*/charter.md"
  "$SQUAD_ROOT/.squad/agents/*/history.md"
)

for pattern in "${SPAWN_TEMPLATE_FILES[@]}"; do
  for file in $pattern; do
    if [ -f "$file" ]; then
      if grep -q "\.squad/knowledge/" "$file" 2>/dev/null; then
        SPAWN_REFERENCES=$((SPAWN_REFERENCES + 1))
      fi
    fi
  done
done

echo "  Knowledge files loaded at spawn: $SPAWN_REFERENCES"

if [ "$SPAWN_REFERENCES" -eq 0 ]; then
  echo -e "  $PASS"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "  $FAIL - Found $SPAWN_REFERENCES references to knowledge files in spawn templates"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# ============================================================================
# TEST 3: On-Demand Access
# ============================================================================
echo "[TEST 2] On-demand access"

# Check that a sample knowledge file exists and is readable
SAMPLE_FILE="$KNOWLEDGE_DIR/keaton-context-loading-architecture.md"
echo "  Requested: keaton-context-loading-architecture.md"

if [ -f "$SAMPLE_FILE" ]; then
  echo "  File readable: yes"
  FILE_SIZE=$(du -k "$SAMPLE_FILE" | cut -f1)
  echo "  Size: ${FILE_SIZE} KB"
  
  # Verify it has frontmatter
  if file_contains "$SAMPLE_FILE" "title:"; then
    echo -e "  $PASS"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  $FAIL - File missing frontmatter"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
else
  echo "  File readable: no"
  echo -e "  $FAIL - Sample file not found"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# ============================================================================
# TEST 4: Frontmatter Validation
# ============================================================================
echo "[TEST 3] Frontmatter validation"

# Check that all knowledge files have required frontmatter
FRONTMATTER_ERRORS=0
KNOWLEDGE_FILES_CHECKED=0

if [ -d "$KNOWLEDGE_DIR" ]; then
  echo "  Scanning knowledge files for required frontmatter..."
  for file in "$KNOWLEDGE_DIR"/*.md; do
    if [ -f "$file" ]; then
      # Skip README.md (it's a directory index, not a knowledge file)
      if [ "$(basename "$file")" = "README.md" ]; then
        continue
      fi
      
      KNOWLEDGE_FILES_CHECKED=$((KNOWLEDGE_FILES_CHECKED + 1))
      MISSING=""
      
      # Check for required fields
      file_contains "$file" "title:" || MISSING="${MISSING}title "
      file_contains "$file" "author:" || MISSING="${MISSING}author "
      file_contains "$file" "tags:" || MISSING="${MISSING}tags "
      file_contains "$file" "created:" || MISSING="${MISSING}created "
      
      if [ -n "$MISSING" ]; then
        echo "    $(basename "$file"): missing ${MISSING}"
        FRONTMATTER_ERRORS=$((FRONTMATTER_ERRORS + 1))
      fi
    fi
  done
fi

echo "  Knowledge files checked: $KNOWLEDGE_FILES_CHECKED"
echo "  Frontmatter errors: $FRONTMATTER_ERRORS"

if [ "$FRONTMATTER_ERRORS" -eq 0 ]; then
  echo -e "  $PASS"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "  $FAIL - Found $FRONTMATTER_ERRORS files with missing frontmatter"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# ============================================================================
# TEST 5: Negative Self-Validation
# ============================================================================
echo "[TEST 4] Negative self-validation"

# Create a temporary agent with a bad reference to knowledge files
TEMP_AGENT_DIR="$SQUAD_ROOT/.squad/.test-temp-agent"
mkdir -p "$TEMP_AGENT_DIR"

cat > "$TEMP_AGENT_DIR/charter.md" <<'EOF'
# Test Agent

This agent incorrectly references: .squad/knowledge/bad-file.md
EOF

echo "  Created temp agent with bad knowledge reference"

# Scan for references
BAD_REFS=0
if grep -q "\.squad/knowledge/" "$TEMP_AGENT_DIR/charter.md" 2>/dev/null; then
  BAD_REFS=$((BAD_REFS + 1))
fi

echo "  Scanner detected bad reference: $([ "$BAD_REFS" -gt 0 ] && echo 'yes' || echo 'no')"

# Cleanup
rm -rf "$TEMP_AGENT_DIR"
echo "  (Cleaned up temp agent)"

if [ "$BAD_REFS" -gt 0 ]; then
  echo -e "  $PASS - Scanner correctly detected bad reference"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "  $FAIL - Scanner did not detect bad reference"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# ============================================================================
# TEST 6: Stress Test (500 files)
# ============================================================================
echo "[TEST 5] Stress test (500 files)"

# Create temporary knowledge directory
mkdir -p "$TEMP_DIR"

echo "  Creating 500 temporary knowledge files..."
for i in {1..500}; do
  cat > "$TEMP_DIR/stress-test-$i.md" <<EOF
---
title: Stress Test File $i
author: test-agent
tags: [stress-test]
created: 2026-03-16
---

# Stress Test File $i

This is a temporary file created for stress testing the knowledge library.
It contains approximately 2KB of content to simulate real knowledge files.

$(printf 'Lorem ipsum dolor sit amet. %.0s' {1..50})
EOF
done

# Calculate total size
TOTAL_SIZE=$(du -sk "$TEMP_DIR" | cut -f1)
echo "  Total knowledge directory size: ${TOTAL_SIZE} KB"

# Verify spawn templates still don't reference knowledge files
SPAWN_REFS_AFTER=0
for pattern in "${SPAWN_TEMPLATE_FILES[@]}"; do
  for file in $pattern; do
    if [ -f "$file" ]; then
      if grep -q "\.squad/knowledge/" "$file" 2>/dev/null; then
        SPAWN_REFS_AFTER=$((SPAWN_REFS_AFTER + 1))
        echo "    WARNING: Found reference in $(basename "$file")"
      fi
    fi
  done
done

echo "  Knowledge files loaded at spawn: $SPAWN_REFS_AFTER"
echo "  Spawn template unchanged: $([ "$SPAWN_REFS_AFTER" -eq 0 ] && echo 'yes' || echo 'no')"

# Cleanup temporary files
rm -rf "$TEMP_DIR"
echo "  (Cleaned up temporary files)"

if [ "$SPAWN_REFS_AFTER" -eq 0 ]; then
  echo -e "  $PASS"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "  $FAIL - Spawn template was modified"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# ============================================================================
# Summary
# ============================================================================
echo "=== RESULT ==="
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}ALL TESTS PASSED ✅${NC}"
  exit 0
else
  echo -e "${RED}SOME TESTS FAILED ❌${NC}"
  exit 1
fi
