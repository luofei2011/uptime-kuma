# Uptime Kuma 子路径二开、升级与部署

本文档适用于本私有 fork，将 Uptime Kuma 发布在类似
`https://monitor.example.com/kuma/` 的子路径下，并继续跟随官方稳定版本升级。

## 实现约定

子路径由环境变量 `UPTIME_KUMA_BASE_PATH` 配置：

```text
UPTIME_KUMA_BASE_PATH=/kuma
```

该变量同时是前端构建参数和服务端运行参数。两处值必须完全一致：

- 构建阶段决定静态资源、Vue Router、Axios、Socket.IO、Service Worker 和
  Web App Manifest 的公开路径。
- 运行阶段决定 Express 路由、Socket.IO 服务端路径、重定向和服务端生成的
  URL。
- 服务启动时会检查 `dist/index.html` 中内嵌的构建路径。如果构建值和运行值
  不一致，服务会拒绝启动并输出明确错误，避免部署一个半可用镜像。

合法示例：`/`、`/kuma`、`/tools/kuma`。尾部 `/` 会自动移除。不允许查询
参数、fragment、反斜杠、空路径段、`.` 或 `..` 路径段。

本 fork 在服务端原生处理 `/kuma/*`，反向代理不得 StripPrefix。

## 日常开发验证

安装依赖：

```bash
npm ci --no-audit
```

如果本机 `~/.npm` 权限异常，可以使用临时缓存，不要通过 sudo 运行 npm：

```bash
npm ci --no-audit --cache /tmp/uptime-kuma-npm-cache
```

验证根路径兼容性：

```bash
npm run lint:js
npm run build
node --test --test-reporter=spec \
  test/backend-test/test-base-path.js \
  test/backend-test/test-status-page.js
```

验证 `/kuma` 子路径：

```bash
npm run build:subpath
npm run test-e2e-subpath
```

`test-e2e-subpath` 会覆盖首次 SQLite 配置、管理员初始化、登录退出、monitor
基本操作、深链、静态资源、API 和 Socket.IO 路径。状态页、WebPush、上传和
反向代理仍需按“部署后人工验证”逐项确认。

`dist` 是忽略目录。最后一次 Docker 构建前必须保证最后执行的是
`npm run build:subpath`，而不是根路径的 `npm run build`。

## 人工构建 Docker 镜像

以下步骤需要人工执行，本次代码升级不会代为构建或发布镜像。

1. 确认工作区和版本：

   ```bash
   git status --short
   git describe --tags --always
   ```

2. 安装锁定依赖并完成验证：

   ```bash
   npm ci --no-audit
   npm run lint:js
   node --test --test-reporter=spec test/backend-test/test-base-path.js
   npm run build:subpath
   ```

3. 检查构建路径：

   ```bash
   grep -F '<base href="/kuma/"' dist/index.html
   grep -F 'src="/kuma/assets/' dist/index.html
   ```

4. 构建单架构镜像：

   ```bash
   docker build \
     --build-arg UPTIME_KUMA_BASE_PATH=/kuma \
     --target release \
     -f docker/dockerfile \
     -t registry.example.com/uptime-kuma:2.5.0-subpath.1 \
     .
   ```

   `--build-arg` 会把同一个路径写入镜像运行环境。不要省略，也不要使用与
   `npm run build:subpath` 不同的值。

5. 如需多架构镜像，人工登录镜像仓库后使用 buildx：

   ```bash
   docker buildx build \
     --platform linux/amd64,linux/arm64 \
     --build-arg UPTIME_KUMA_BASE_PATH=/kuma \
     --target release \
     -f docker/dockerfile \
     -t registry.example.com/uptime-kuma:2.5.0-subpath.1 \
     --push \
     .
   ```

6. 发布前记录镜像 digest，并在生产配置中使用 digest 或不可变版本标签，
   不使用 `latest`。

## Docker Compose 部署示例

```yaml
services:
  uptime-kuma:
    image: registry.example.com/uptime-kuma:2.5.0-subpath.1
    restart: unless-stopped
    environment:
      UPTIME_KUMA_BASE_PATH: /kuma
      TZ: Asia/Shanghai
    volumes:
      - ./data:/app/data
    expose:
      - "3001"
    networks:
      - monitor

networks:
  monitor:
    external: true
```

建议不要把 `3001` 直接发布到公网，统一通过反向代理访问。

## Docker Swarm 部署注意事项

- 默认保持 `replicas: 1`。
- 使用 SQLite 时设置 `update_config.order: stop-first`，避免更新过程中两个实例
  同时操作数据库。
- `/app/data` 必须使用可靠持久卷；如果卷只能落在单节点，需要加 placement
  constraint，防止任务漂移后读取到空目录。
- 更新前备份整个 `/app/data`，不仅是 `kuma.db`。状态页上传文件和其他运行
  数据也位于该目录。
- 生产更新使用不可变镜像版本或 digest，并配置回滚镜像。

示例：

```yaml
services:
  uptime-kuma:
    image: registry.example.com/uptime-kuma:2.5.0-subpath.1
    environment:
      UPTIME_KUMA_BASE_PATH: /kuma
      TZ: Asia/Shanghai
    volumes:
      - uptime-kuma-data:/app/data
    networks:
      - edge
    deploy:
      replicas: 1
      update_config:
        order: stop-first
        failure_action: rollback
      rollback_config:
        order: stop-first

volumes:
  uptime-kuma-data:
    external: true

networks:
  edge:
    external: true
```

## 反向代理

应用原生识别 `/kuma`，因此代理必须保留原始路径。

Nginx 示例：

```nginx
location = /kuma {
    return 308 /kuma/;
}

location ^~ /kuma/ {
    # 注意：proxy_pass 后面没有 /，不能去掉 /kuma 前缀
    proxy_pass http://uptime-kuma:3001;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Traefik 使用以下规则路由即可，不要配置 StripPrefix middleware：

```text
PathPrefix(`/kuma`)
```

完成部署后，在 Uptime Kuma 的 General 设置中人工确认：

```text
Primary Base URL = https://monitor.example.com/kuma
```

不要添加尾部 `/`。该设置用于通知消息、Push URL 和 Badge URL；它不能替代
`UPTIME_KUMA_BASE_PATH`。

如果状态页使用独立自定义域名并希望从该域名的 `/` 访问，需要在该域名的
反向代理中把根请求映射到应用的 `/kuma/`，同时确保该域名上的 `/kuma/*`
资源也转发到同一服务。该场景要单独验收；默认配置以同域 `/kuma/status/*`
为准。

## 上游版本升级步骤

以下步骤每次跟随官方稳定 release tag 时都要保留并人工执行。

1. 记录当前生产镜像 digest，停止自动更新，并完整备份 `/app/data`。
2. 在独立升级分支中获取新的官方稳定 tag。不要直接基于 `master`、nightly 或
   `latest` 发布生产镜像。

   假设私有 fork 是 `origin`，官方仓库是只读 remote `upstream`：

   ```bash
   git remote -v
   git fetch upstream --tags --prune
   git switch -c codex/upgrade-<官方版本> <当前私有版本分支>
   git merge --no-ff <官方稳定tag>
   ```

   如果团队统一使用 rebase，可以将最后一条替换为：

   ```bash
   git rebase <官方稳定tag>
   ```

   merge 和 rebase 二选一，不要在同一次升级中混用。

3. 将新 tag merge 或 rebase 到私有 fork，先解决官方代码本身的冲突。
4. 重点人工审查以下下游适配点是否仍然有效：

   - `server/base-path.js` 和 `server/config.js`
   - `config/vite.config.js`、`index.html`、`public/manifest.json`
   - `server/uptime-kuma-server.js`、`server/setup-database.js`
   - `src/router.js`、`src/util-frontend.js`
   - `src/mixins/public.js`、`src/mixins/socket.js`、`src/main.js`
   - 状态页 SSR、manifest、RSS、Primary Base URL 和 Badge URL
   - `docker/dockerfile` 中的 build arg/runtime env

5. 搜索上游新增的根路径假设：

   ```bash
   rg -n 'location\.(href|replace|assign).*"/' src
   rg -n '<a[^>]+href="/' src
   rg -n '(data|src)="/' src
   rg -n 'response\.redirect\("/' server
   rg -n 'navigator\.serviceWorker|socket\.io|createWebHistory' src server
   ```

6. 依次执行根路径和子路径验证：

   ```bash
   npm ci --no-audit
   npm run lint:js
   node --test --test-reporter=spec test/backend-test/test-base-path.js
   npm run build
   npm run build:subpath
   npm run test-e2e-subpath
   ```

7. 人工构建候选镜像，部署到独立测试环境，完成下一节的浏览器验收。
8. 验收通过后再更新生产镜像。更新完成后保留旧镜像和数据备份，直到观察期
   结束。

## 部署后人工验证

基础 HTTP 验证：

```bash
curl -I https://monitor.example.com/kuma/
curl -I https://monitor.example.com/kuma/icon.svg
curl -I https://monitor.example.com/kuma/manifest.json
curl -sS https://monitor.example.com/kuma/api/entry-page
curl -i 'https://monitor.example.com/kuma/socket.io/?EIO=4&transport=polling'
```

浏览器中必须逐项验证：

1. 首次安装时 `/kuma/setup-database` 能完成 SQLite 或 MariaDB 配置。
2. 登录、退出、刷新 `/kuma/dashboard` 和刷新某个 monitor 详情深链均正常。
3. DevTools Network 中静态资源、XHR 和 Socket.IO 请求全部位于 `/kuma/`，
   没有请求域名根路径的 `/assets`、`/api` 或 `/socket.io`。
4. Socket.IO transport 能从 polling 升级为 WebSocket，且没有持续重连。
5. 新建、编辑、删除 monitor；检查 Push URL 包含 `/kuma/api/push/...`。
6. 新建和编辑状态页，验证状态页深链、RSS、manifest、上传 logo 和自定义图标。
7. Badge 生成器输出的 URL 包含 `/kuma/api/badge/...`。
8. Real Browser monitor 的截图可以显示。
9. 浏览器 Application 面板中的 Service Worker scope 是 `/kuma/`，WebPush
   在实际 HTTPS 域名上完成一次授权和通知测试。
10. General 设置中的 Primary Base URL 为完整外部地址且包含 `/kuma`。
11. 同域名下其他根路径应用仍可访问；访问未带 `/kuma` 的 Kuma API 应返回
    404，而不是被 Kuma 接管。

## 回滚

1. 停止新版本服务。
2. 如果新版本执行过数据库迁移，恢复升级前完整 `/app/data` 备份。
3. 切回记录的旧镜像 digest，并保持原来的 `UPTIME_KUMA_BASE_PATH=/kuma`。
4. 验证登录、Socket.IO、状态页和至少一个 monitor 后再恢复入口流量。
