# EOW 前端安全预览与 GitHub Pages 发布

## 安全原则

- 日常开发在 `feature/eow-frontend-upgrade` 分支进行。
- 不要直接向 `main` 推送未验证的代码。
- 不要把 Supabase `service_role` 密钥、支付私钥、TURN 凭据或其他服务端密钥写进前端。
- 浏览器端只能使用 Supabase Publishable/anon key，并依靠正确的 RLS 策略保护数据。
- 本次新增的账号设置使用 Supabase Auth 的 `updateUser` API；邮箱变更是否立即生效取决于 Supabase 项目的邮箱验证配置。

## 本地预览（推荐）

需要安装 Git 和 Node.js 20 或更新版本。

```bash
git clone https://github.com/sgsgsg6555555-stack/EOW-Global.git
cd EOW-Global
git fetch origin
git switch feature/eow-frontend-upgrade
npm run check
npx --yes http-server . -p 4173 -c-1
```

浏览器打开 `http://localhost:4173`。必须通过本地 HTTP 服务器访问，不能直接双击 HTML 文件，否则 ES modules 和 Supabase 模块可能无法正常工作。

## 验证流程

1. 打开首页，确认导航、登录和注册页面可访问。
2. 使用测试账号登录，检查动态、好友、私信、社区、视频、钱包和通知。
3. 打开 `settings.html`，确认邮箱与密码表单能正常显示；如需验证变更，请使用专门测试账号。
4. 检查浏览器开发者工具 Console 和 Network，不应出现模块加载错误或意外的 4xx/5xx。
5. 真实数据操作前，确认 Supabase RLS、Storage policies 和测试数据均已准备好。

## GitHub Pages 发布

GitHub Pages 通常从仓库设置的发布分支/目录或 GitHub Actions 工作流发布。先在仓库 Settings → Pages 查看当前 Source。不要为了预览而把开发分支改成生产发布源。

当前项目使用原生静态 HTML/CSS/JavaScript，不需要构建打包。确认检查通过后，再通过 Pull Request 将功能分支合并到 `main`；若 Pages 的发布源是 `main`，合并后才会更新线上站点。

## 回滚

如果发布后出现问题，可在 GitHub 的 Pull Request / commit 页面 revert 对应合并提交；不要用重置历史的方式覆盖共享分支。
