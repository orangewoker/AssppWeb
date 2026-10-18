# 飞牛 fnOS 安装 / 更新 Asspp Web

镜像：`ghcr.io/orangewoker/assppweb:latest`（amd64 / arm64 自动选择）。
构建记录：<https://github.com/orangewoker/AssppWeb/actions/workflows/docker.yml>。

## 一、已有旧版：推荐直接更新

1. 打开飞牛的 **Docker** 应用，在 **Compose / 项目** 中找到原来的 Asspp 项目。
   不同 fnOS 版本名称可能略有差异。先复制保存原 YAML，记下数据目录和端口。
2. 编辑原项目 YAML，只把 `image:` 改成：

   ```yaml
   image: ghcr.io/orangewoker/assppweb:latest
   ```

   原有 `ports`、`volumes`、`ACCESS_PASSWORD`、`PUBLIC_BASE_URL` 等设置全部保留。
   若有 `build:` 配置则移除；飞牛无需本地编译。
3. 拉取新镜像，然后重新部署 / 重建项目。只点击“重启”不会切换已有容器的镜像。
   如果界面不方便操作，可以启用飞牛 SSH，在终端登录飞牛后进入原 Compose 目录：

   ```sh
   cd /你的实际路径/assppweb
   docker compose pull
   docker compose up -d
   docker compose ps
   docker compose logs --tail=100 asspp
   ```

   当前 SSH 用户没有 Docker 权限时，为 Docker 命令加 `sudo`。
   不需要 `down -v`，不要删除原数据目录。
4. 使用原来的网站地址访问，刷新网页或关闭页面后重新打开。继续使用原浏览器及域名：
   Apple 账号保存在浏览器 IndexedDB，不在 NAS 数据卷；换浏览器或域名后需要重新添加账号。

## 二、从零安装

1. 在飞牛文件管理器创建一个应用目录，例如共享文件夹下的 `docker/assppweb`。
2. Docker → Compose / 项目 → 新建。项目名称可填 `assppweb`，选择刚建立的目录。
3. 使用仓库根目录的 `compose.yml`，也可粘贴下面的最小配置：

   ```yaml
   services:
     asspp:
       image: ghcr.io/orangewoker/assppweb:latest
       ports:
         - "8080:8080"
       volumes:
         - ./mnt/asspp-data:/data
       environment:
         DATA_DIR: /data
         PORT: "8080"
         # ACCESS_PASSWORD: "替换为你自己设置的网页访问密码"
       restart: unless-stopped
       logging:
         driver: json-file
         options:
           max-size: "128m"
           max-file: "5"
   ```

   相对数据目录跟随项目目录。如果飞牛要求绝对路径，在文件管理器复制实际路径后替换
   `./mnt/asspp-data`，不要照抄其他机器的 `/vol1/...` 路径。

4. 保存并启动。若宿主机 8080 已被使用，仅将端口左侧改成 `8088:8080`。
5. `http://飞牛IP:8080` 可以先检查网页是否能打开；正式登录使用受信任证书的 **HTTPS** 地址。
   在现有反向代理中，将该 HTTPS 域名转发到 `http://飞牛IP:8080`，并开启 WebSocket 支持
   （`/wisp/` 路径）。访问密码是自设网页密码，不是 Apple ID 密码。
   不建议清空浏览器站点数据，因为其中保存着你的 Apple 账号信息。

## 三、首次登录与检查

- 点击登录后，首次需要下载并准备签名组件（压缩后约 14 MB），等待提示结束。
- 在网页中输入 Apple ID、密码及验证码。不需要向维护者提供密码。
- 签名组件失败时，检查 HTTPS、反向代理 WebSocket 和 NAS 到 Apple 的网络连接。
- 更新后若仍看到旧界面，先刷新网页；不要直接清空站点数据。

## 四、拉取镜像失败

- `denied` / `unauthorized`：先确认 GitHub 镜像包为 Public。
  打开 <https://github.com/users/orangewoker/packages/container/package/assppweb>，进入
  Package settings → Change visibility → Public。公开仓库不代表镜像包自动公开。
- `timeout` / 连接失败：检查飞牛到 `ghcr.io` 的网络。只配置 Docker Hub 加速器通常不会加速 GHCR。
- `manifest unknown`：确认 Actions 的构建成功，镜像名和 `latest` 标签拼写正确。

## 五、以后更新

GitHub 构建成功后，在原项目目录执行 `docker compose pull && docker compose up -d`。
该操作重建容器但保留数据卷。不要新建另一套项目占用同一端口，也不要改掉原数据路径。
