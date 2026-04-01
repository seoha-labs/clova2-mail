#!/bin/bash
#
# clova2Mail Evaluation Pipeline
#
# Runs the full eval harness: summarize all dataset samples via the
# production prompt, then score each result with an LLM judge.
#
# Usage:
#   OPENAI_API_KEY=sk-xxx ./eval/run-eval.sh          # full pipeline
#   OPENAI_API_KEY=sk-xxx ./eval/run-eval.sh run       # runner only
#   OPENAI_API_KEY=sk-xxx ./eval/run-eval.sh judge     # judge only
#
# Environment variables:
#   OPENAI_API_KEY  - OpenAI API key (required)
#   JUDGE_MODEL     - model for judging (default: gpt-4o)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  clova2Mail Evaluation Pipeline${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Validate API key
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo -e "${RED}Error: OPENAI_API_KEY environment variable is required.${NC}"
  echo ""
  echo "  OPENAI_API_KEY=sk-xxx $0"
  exit 1
fi

# Ensure tsx is available
if ! npx tsx --version > /dev/null 2>&1; then
  echo "Installing tsx..."
  npm install -D tsx
fi

MODE="${1:-all}"

run_step() {
  echo -e "${BLUE}----------------------------------------${NC}"
  echo -e "${GREEN}Step 1: Generate summaries (runner)${NC}"
  echo -e "${BLUE}----------------------------------------${NC}"
  echo ""
  npx tsx eval/runner.ts
}

judge_step() {
  if [ ! -f "eval/test-results/results.json" ]; then
    echo -e "${RED}Error: eval/test-results/results.json not found.${NC}"
    echo "Run './eval/run-eval.sh run' first."
    exit 1
  fi

  echo ""
  echo -e "${BLUE}----------------------------------------${NC}"
  echo -e "${GREEN}Step 2: Score with LLM judge${NC}"
  echo -e "${BLUE}----------------------------------------${NC}"
  echo ""
  npx tsx eval/judge.ts
}

case "$MODE" in
  run)
    run_step
    ;;
  judge)
    judge_step
    ;;
  all)
    run_step
    judge_step
    echo ""
    echo -e "${GREEN}Done!${NC}"
    echo ""
    echo "Reports:"
    echo "  Summary : eval/test-results/index.html"
    echo "  Judging : eval/test-results/judge-report.html"
    echo ""
    ;;
  *)
    echo "Usage: $0 [run|judge|all]"
    exit 1
    ;;
esac
