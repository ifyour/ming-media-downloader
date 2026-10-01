# 更新日志

## 1.0.0 - 2026-10-01

### 新功能
- 单 Worker 部署：前端静态资源合并进 Worker
- Logo 可点击返回首页

### 修复
- 支持小红书新短链域名 `xhslink.cn`
- 启用 Cloudflare Browser Rendering 兜底，解决小红书风控页解析失败问题

### 重构
- 项目拆分为 `frontend/` 和 `backend/` 目录
- 后端工具链从 Wrangler 迁移到 Cloudflare CLI（`cf`）

### 文档
- 新增英文 README，含 zh-CN 语言切换
