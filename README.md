# Share timeline

一个不需要注册账号的多人空闲时间预约工具。用户通过自定义 ID/昵称找回自己的事件和 Tag，通过六位邀请码加入事件，并在北京时间 10:00–24:00 的周视图中标记空闲时间。参与者可以共享各自的备注；事件创建者可以删除本事件记录。

事件分为两类：一次性事件仅预约当前周，并在过期后于下一次访问时自动清理；常驻事件可以持续向后预约，不设周数上限。

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000`。

## 环境变量

在项目根目录创建 `.env.local`：

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_key
```

`SUPABASE_SECRET_KEY` 只能存在于服务端环境变量中，不要提交到 Git。

## 数据库

在 Supabase SQL Editor 中运行 [`supabase/schema.sql`](./supabase/schema.sql)。浏览器没有数据库直连权限，所有读写均经过 Next.js Route Handlers。

已有数据库升级时，按文件名顺序运行 [`supabase/migrations`](./supabase/migrations) 中尚未执行的迁移。

## 验证

```bash
npm run lint
npm run build
node --env-file=.env.local scripts/verify-db.mjs
node --env-file=.env.local scripts/smoke-api.mjs
```

`smoke-api.mjs` 会创建临时身份和事件，测试完成后自动清理。

## 部署

将仓库推送至 GitHub，在 Vercel 导入仓库，并配置与本地相同的两个环境变量。
