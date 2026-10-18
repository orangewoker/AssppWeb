# 登录空响应修复与飞牛部署

## 原因与范围

当前 Apple bag 广告登录接口需要 SAP `X-Apple-ActionSignature`。
原代码未签名；旧 `/WebObjects/MZFinance.woa/wa/authenticate` 地址还缺少末尾 `/`。
2026-10-18 本地使用虚构账号探测：旧路径得到 HTTP 204；规范化路径未签名
得到 HTTP 403 空响应，同一正文签名后得到 HTTP 200、可解析 plist。
这是协议链路验证，不代表真实账号登录或飞牛网络已验证。

移植来源（均为尚未合并的上游提案，保留其源码与构建脚本）：

- SAP 引擎及资源提取：<https://github.com/Lakr233/AssppWeb/pull/89>
  固定提交 `835a54dd773caeaa6ad6b342d5cde1bf3e6ceb29`。
- 登录 URL 与相对重定向修正：<https://github.com/Lakr233/AssppWeb/pull/91>。
- Swift 协议对照：<https://github.com/Lakr233/ApplePackage>。

另修正了 SAP Wisp 白名单遗漏、Worker 出错/超时无法退出、缓存配额失败、
重定向丢失 pod、部分预置资源误判就绪。后端只分发经过 SHA-256 校验的公开
Apple 资源；签名及带密码的请求仍在浏览器中处理，通过 Wisp 加密隧道发送。

## 飞牛更新

1. 备份现有 Compose 配置和数据目录。将本项目完整目录同步到飞牛。
2. 保留原有端口、`ACCESS_PASSWORD`、反向代理和数据卷路径。
   示例中的 `./mnt/asspp-data:/data` 必须对应你原来的数据目录。
3. 本项目 Compose 使用 `ghcr.io/orangewoker/assppweb:latest`，镜像由 GitHub Actions 构建，不再拉取原作者镜像。
   在飞牛项目目录运行：

   ```sh
   docker compose pull
   docker compose up -d
   docker compose logs --tail=100 asspp
   ```

   GitHub 构建时从 Apple CDN 获取公开签名资源；飞牛只需要拉取构建好的镜像。
   镜像内预置资源，后续登录不再重新解包。支持 amd64 / arm64。

4. 使用 HTTPS 打开网页，刷新页面以加载新前端。首次登录会出现“正在准备签名组件”。
   浏览器下载约 14 MB 压缩资源并缓存；不要在此时反复点击登录或更换设备标识符。
5. 在网页中自行输入账号密码和验证码，验证真实登录。无需把密码交给维护者。

## 验证记录

- 前端 112 项单元测试、前后端生产构建通过；新增 SAP Wisp 白名单测试通过。
- Apple 公开资源实际下载、四个摘要校验、WASM 引擎初始化和真实 SAP 密钥交换通过。
- 相同虚构账号请求：不签名 HTTP 403，签名 HTTP 200 plist。
- Windows 后端原有 IPA 注入测试有 5 项因缺少 `zip` 可执行程序失败；Dockerfile 已安装 zip。
- 独立 TypeScript 检查仍报告原有 `frontend/src/utils/crypto.ts:30` 的 BufferSource 类型问题。
- 尚未在飞牛构建镜像，尚未使用真实账号验证。

## 引擎来源

Unicorn 2.1.4 的许可证位于 `frontend/src/apple/sap/vendor/COPYING*`。
重建引擎使用 WSL/Linux：`bash frontend/scripts/unicorn-wasm-patch/build.sh`，需要 Docker。
不把 Apple 提取资源或账号资料提交到 Git。
