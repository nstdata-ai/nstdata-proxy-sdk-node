# Nstdata Proxy SDK for Node.js

[English](README.md)

使用 API Key 和可用余额获取代理连接。可直接运行交互式命令行，无需创建 Node.js 项目；也可通过 ESM SDK 集成到应用。提供 TypeScript 类型，无运行时依赖。

## 安装

需要 Node.js 22 系列的 22.18+ 或 Node.js 24 系列。应用中使用 SDK：

```sh
npm install @nstdata-ai/proxy
```

## 命令行使用

在任意目录运行。按提示输入 API Key（不回显），核对产品与国家后按 Enter 获取一条连接；选择 Advanced 可更换产品、国家或已有渠道。

```sh
npx --yes --package=@nstdata-ai/proxy nstdata-proxy
```

用于脚本时，从 [Nstdata 控制台](https://app.nstdata.io/) 获取获准使用的个人或团队 API Key，保存到本地 `.env` 文件：

```dotenv
NSTDATA_API_TOKEN=your-api-key
```

获取一条连接并保存到新的私密文件：

```sh
npx --yes --package=@nstdata-ai/proxy \
  nstdata-proxy --env .env --yes --output proxies.json
```

`--package` 前的 `--yes` 确认 npx 安装，后一个 `--yes` 确认渠道准备与出号。`proxies.json` 中的 `proxies` 数组保存含认证信息的完整连接 URL；文件权限设为 `0600`，已存在时不会覆盖。默认终端输出只含元数据，不保存 API Key。

## SDK 快速开始

使用上述 `.env` 文件，将以下程序保存为 `quickstart.mjs`：

```js
import { ProxyClient, ProxyAPIError } from '@nstdata-ai/proxy';

try {
    const client = new ProxyClient({
        apiKey: process.env.NSTDATA_API_TOKEN,
    });
    const proxy = await client.getProxy();
    // Pass proxy.url to your proxy-capable HTTP client; it contains credentials.
    console.log({ country: proxy.country, protocol: proxy.protocol });
} catch (error) {
    if (!(error instanceof ProxyAPIError)) throw error;
    console.error({ code: error.code, statusCode: error.statusCode });
    process.exitCode = 1;
}
```

```sh
node --env-file=.env quickstart.mjs
```

输出显示实际选择的国家和协议。将 `proxy.url` 交给支持代理的客户端使用。出号本身不测试连通性；实际代理流量按服务规则计量。

## 默认行为与控制

| 能力 | 行为 |
|---|---|
| 首次使用 | 查找兼容的 `nstdata-sdk-default` 渠道，没有时使用随机密码创建；不修改其他渠道。 |
| 自动选择 | 依据实际产品目录，优先 Residential Lite，其次 Residential；默认 HTTP、1 条、10 分钟会话。先遵守渠道固定国家，否则优先可用的 US，再选择支持的国家。 |
| 只读预览 | `prepareProxy()` 或 CLI `--dry-run` 查看方案，不创建渠道、不出号。 |
| 精确控制 | `getProxy({ country, channelId, ... })`、`getProxies({ count, ... })` 及原有渠道方法。显式指定的选择不支持时直接报错，不自动换产品或国家。 |

账号具备兼容产品和访问权限时，正常按量流程仅需 API Key 与余额。产品可用性和计费由服务端决定；SDK 不购买或续费套餐。

[完整指南](docs/guide_zh.md) 提供命令行选项、返回字段、渠道管理与异常恢复说明。

[贡献说明](CONTRIBUTING.md) · [安全反馈](SECURITY.md) · [变更记录](CHANGELOG.md) · [MIT 许可](LICENSE)
