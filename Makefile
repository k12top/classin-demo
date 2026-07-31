# classroom — Next.js 项目常用命令
# 使用: make <target>   或   make help

.PHONY: help install dev dev-clean build start lint clean db-migrate db-migrate-dev db-push db-push-unsafe db-generate

NPM := npm

help:
	@echo "可用目标:"
	@echo "  make install  - 安装依赖 (npm ci 若存在 lock，否则 npm install)"
	@echo "  make dev      - 开发服务器 (next dev)"
	@echo "  make dev-clean - 清理 Next 缓存后启动开发服务器（处理 ChunkLoadError）"
	@echo "  make build    - 生产构建 (next build)"
	@echo "  make start    - 生产启动 (next start，需先 build)"
	@echo "  make lint     - 运行 ESLint"
	@echo "  make clean    - 删除 .next 构建目录"
	@echo "  make db-migrate - 应用 Prisma 迁移 (migrate deploy，适合现有/远程数据库)"
	@echo "  make db-migrate-dev - 开发迁移 (migrate dev，仅用于可重置的本地开发库)"
	@echo "  make db-push    - 兼容入口：安全应用增量迁移 (migrate deploy)"
	@echo "  make db-push-unsafe - 直接同步 schema（仅限可重置的本地临时数据库）"
	@echo "  make db-generate- 生成 Prisma Client"

install:
	@if [ -f package-lock.json ]; then $(NPM) ci; else $(NPM) install; fi

dev:
	$(NPM) run dev

dev-clean:
	rm -rf .next
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

db-migrate-dev:
	$(NPM) run db:migrate:dev

db-push:
	$(NPM) run db:push

db-push-unsafe:
	$(NPM) run db:push:unsafe
