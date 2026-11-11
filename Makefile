.PHONY: help test test-unit test-validation benchmark lint ci clean

PYTHON ?= python3
PYTEST ?= pytest
RUFF ?= ruff

help:
	@echo "Available commands:"
	@echo "  make test             - Run all unit and validation tests via pytest"
	@echo "  make test-unit        - Run unit tests only"
	@echo "  make test-validation  - Run validation benchmark tests only"
	@echo "  make benchmark        - Run validation benchmark accuracy evaluation harness"
	@echo "  make lint             - Run ruff linter checks"
	@echo "  make ci               - Full CI test suite: lint, unit & validation tests, and benchmark metrics"
	@echo "  make clean            - Remove cache artifacts"

test:
	$(PYTEST) -v

test-unit:
	$(PYTEST) tests/test_health.py tests/test_quality.py tests/test_marker.py tests/test_segmentation.py tests/test_landmarks.py tests/test_measurements.py tests/test_scoring.py tests/test_recompute.py tests/test_pipeline.py -v

test-validation:
	$(PYTEST) tests/test_validation_benchmarks.py -v

benchmark:
	$(PYTHON) scripts/run_benchmarks.py

lint:
	$(RUFF) check src/ tests/ scripts/

ci: lint test benchmark
	@echo "All CI unit, validation, and benchmark checks passed."

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true

