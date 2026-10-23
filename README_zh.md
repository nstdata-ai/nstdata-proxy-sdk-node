# Nstdata Node.js Proxy SDK

[English](README.md)

通过 Nstdata 普通用户 API 生成代理连接并管理渠道。ESM 包含 TypeScript 声明，无运行时依赖。

## 功能

| 能力 | 指南 |
|---|---|
| 代理出号 | [HTTP／SOCKS5 连接串及会话参数](docs/guide_zh.md#代理出号)。 |
| 渠道读取 | [分页列表和活跃渠道详情](docs/guide_zh.md#渠道读取)。 |
| 渠道管理 | [创建、更新和软删除](docs/guide_zh.md#渠道管理)。 |
| 可靠性 | [期限、取消和安全错误](docs/guide_zh.md#配置与错误)。 |

## 安装

需要 Node.js 22 系列的22.18+，或 Node.js 24 系列。

```sh
npm install @nstdata-ai/proxy@1.0.0
```

`1.0.0` 尚未发布。本地安装和开发检查见[贡献说明](CONTRIBUTING.md)。

## 快速开始

将获准使用的个人或团队 API key 设置为 `NSTDATA_API_TOKEN`；已团队化的账号须使用团队 key。此例读取一页渠道列表。

```js
import { ProxyClient, ProxyAPIError } from '@nstdata-ai/proxy';

const client = new ProxyClient({
    apiKey: process.env.NSTDATA_API_TOKEN,
    baseUrl: process.env.NSTDATA_API_BASE_URL,
});

try {
    const channels = await client.listChannels({ page: 1, pageSize: 10 });
    console.log({ channelsOnPage: channels.length });
} catch (error) {
    if (!(error instanceof ProxyAPIError)) throw error;
    console.error({ code: error.code, statusCode: error.statusCode });
    process.exitCode = 1;
}
```

渠道记录和代理 URL 可能包含密码。只读取应用所需字段，不打印完整结果。各项功能的参数、返回值和操作影响见[使用指南](docs/guide_zh.md)。

本包调用普通用户 API。代理网络传输、连通性检测和 Proxy Manager 属于独立能力。

[贡献说明](CONTRIBUTING.md) · [安全反馈](SECURITY.md) · [变更记录](CHANGELOG.md) · [MIT 许可](LICENSE)
