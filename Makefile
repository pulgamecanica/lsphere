PACKAGE_MANAGER ?= bun

ifeq ($(NPM),1)
    PACKAGE_MANAGER = npm
endif

.PHONY: help

help:
	@echo "make deps       - install dependencies"
	@echo "make build      - build dist/lsphere executable"
	@echo "make run        - run lsphere CLI (demo: circle)"
	@echo "make show       - open output/composite.svg"
	@echo "make clean      - remove dist/ and output/"
	@echo "make distclean  - clean + remove node_modules/"
	@echo "make lint       - check code style + errors"
	@echo "make format     - auto-format with Prettier"

.PHONY: deps
deps:
	$(PACKAGE_MANAGER) install

build: deps dist/lsphere

dist/lsphere: $(shell find src -type f) package.json tsconfig.json
	$(PACKAGE_MANAGER) run build

.PHONY: run
run: build
	$(PACKAGE_MANAGER) run run

.PHONY: show
show: run
	$(PACKAGE_MANAGER) run show

.PHONY: clean distclean
clean:
	$(PACKAGE_MANAGER) run clean


distclean: clean
	rm -rf node_modules

.PHONY: lint format
lint:
	$(PACKAGE_MANAGER) run lint

format:
	$(PACKAGE_MANAGER) run format

.PHONY: re
re: clean build