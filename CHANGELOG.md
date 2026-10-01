# Changelog

## 1.0.0 - 2026-10-01

### Features
- Single-Worker deployment: frontend static assets merged into the Worker
- Clickable logo returns to home page

### Fixes
- Support new RedNote (小红书) short-link domain `xhslink.cn`
- Enable Cloudflare Browser Rendering fallback so RedNote anti-bot pages parse correctly

### Refactor
- Split project into `frontend/` and `backend/` directories
- Migrate backend tooling from Wrangler to Cloudflare CLI (`cf`)

### Documentation
- Add English README with zh-CN language switcher
