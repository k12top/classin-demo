# classroom — Next.js 项目常用命令
# 使用: make <target>   或   make help

.PHONY: help install dev build start lint clean db-migrate db-push db-generate

NPM := npm

help:
	@echo "可用目标:"
	@echo "  make install  - 安装依赖 (npm ci 若存在 lock，否则 npm install)"
	@echo "  make dev      - 开发服务器 (next dev)"
	@echo "  make build    - 生产构建 (next build)"
	@echo "  make start    - 生产启动 (next start，需先 build)"
	@echo "  make lint     - 运行 ESLint"
	@echo "  make clean    - 删除 .next 构建目录"
	@echo "  make db-migrate - 应用 Prisma 迁移 (migrate dev)"
	@echo "  make db-push    - 将 schema 同步到数据库 (db push)"
	@echo "  make db-generate- 生成 Prisma Client"

install:
	@if [ -f package-lock.json ]; then $(NPM) ci; else $(NPM) install; fi

dev:
	$(NPM) run dev

build:
	$(NPM) run build

start:
	$(NPM) run start

lint:
	$(NPM) run lint

clean:
	rm -rf .next

db-generate:
	$(NPM) run db:generate

db-migrate:
	$(NPM) run db:migrate

db-push:
	$(NPM) run db:push
