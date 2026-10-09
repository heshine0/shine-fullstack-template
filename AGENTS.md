# AGENTS.md — 桐乡武协（tongxiangwuxie）

本仓库包含两个**相互独立、非 monorepo** 的工程：各自拥有 `package.json` / lockfile / 配置，
**没有 workspace、没有根 `package.json`，禁止在仓库根目录执行安装依赖**。

各工程的 AI 协作规范已拆分到对应目录，开发前请查阅相应文档：

| 工程 | 详细文档 | 内容范围 |
|------|----------|----------|
| **backend/** — Nuxt 4 全栈（REST API + 管理后台页面） | [backend/AGENTS.md](./backend/AGENTS.md) | 技术栈与目录结构、环境准备（Bun/PostgreSQL/.env）、快速开始、本地联调与 CORS、统一响应格式、认证授权与限流、Drizzle 数据层、Nuxt UI v4 踩坑、质量门禁、Git 与安全、品牌参数化脚本 |
| **frontend/** — unibest（uniapp + Vue3）多端应用 | [frontend/AGENTS.md](./frontend/AGENTS.md) | 本项目技术栈与目录结构、环境与快速开始、vite 代理联调架构、相对 unibest 模板的偏差（Cookie 认证/生成物/条件编译/env）、Hermes 模板规范索引（含已废弃章节标注）、质量门禁、Git 与安全、品牌参数化脚本 |

跨工程共识（两份文档中均有完整记载）：

- 包管理器统一 **Bun 1.4.0**；后端端口 **3000**，前端 H5 端口 **9000**。
- 认证为 **Better Auth Cookie 单通道**：HttpOnly Cookie 会话，全链路无 token/Authorization。
- H5 经 vite 代理同源访问：`http://localhost:9000/api/**` → `http://localhost:3000/api/**`（保留前缀不 rewrite）。
- Git 仓库在根目录，两个子工程均无独立 `.git`；不要自动创建 commit。
- 派生新项目使用根目录脚本 `scripts/init-template.mjs`（用法与白名单详见两份子文档）。
