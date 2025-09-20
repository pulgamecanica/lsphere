PACKAGE_MANAGER ?= bun

ifeq ($(NPM),1)
    PACKAGE_MANAGER = npm
endif

.PHONY: help deps build run clean distclean show

help:
	@echo "make deps       - install dependencies"
	@echo "make build      - build dist/lsphere executable"
	@echo "make run        - run lsphere CLI (demo: circle)"
	@echo "make show       - open output/composite.svg"
	@echo "make clean      - remove dist/ and output/"
	@echo "make distclean  - clean + remove node_modules/"

deps:
	$(PACKAGE_MANAGER) install

build: dist/lsphere

dist/lsphere: $(shell find src -type f) package.json tsconfig.json
	$(PACKAGE_MANAGER) run build
	@chmod +x dist/lsphere

run: build
	$(PACKAGE_MANAGER) run run

show:
	$(PACKAGE_MANAGER) run show

clean:
	$(PACKAGE_MANAGER) run clean

distclean: clean
	rm -rf node_modules
