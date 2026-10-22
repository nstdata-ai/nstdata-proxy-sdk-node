# Nstdata Node.js Proxy SDK

用于 Nstdata 普通用户出号与渠道管理 API 的 ESM 客户端。支持 Node.js 22.18+（22.x）或 24.x，包含 TypeScript 声明，无运行时依赖。

[English](README.md)

## 安装

1.0.0 已在本地准备，尚未发布到 npm。审核时，在本仓库执行 `npm pack`，再于应用中通过 `npm install /path/to/nstdata-ai-proxy-1.0.0.tgz` 安装生成的包，无需解压。

1.0.0 发布后：

```sh
npm install @nstdata-ai/proxy@1.0.0
```

## 快速开始

将获准使用的个人或团队 API key 保存为 `NSTDATA_API_TOKEN`。已团队化的账号须使用团队 API key。本客户端不接受服务凭证（`nst_svc_`）或浏览器会话凭证。

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

代理 URL 和渠道记录可能包含密码，不要打印完整结果。SDK 通过 `x-api-key` 请求头发送凭据，不放入 URL，也不跟随重定向。

## 方法

以下路由相对于 `baseUrl + /api/v1/api`，属于普通用户 API，与 `/api/v1/service` 分销服务命名空间及 Dashboard 登录接口分开。

| 方法 | HTTP 路由 | 返回值 |
| --- | --- | --- |
| `generateProxies(input, options?)` | `GET /proxies` | `{ proxies: string[], count: number }` |
| `listChannels(query?, options?)` | `GET /channels` | 单页 `Channel[]` |
| `getChannel(channelId, options?)` | `GET /channel/:channelId` | `Channel[]`；无匹配的活跃渠道时为 `[]` |
| `createChannel(input, options?)` | `POST /channel` | `Channel` |
| `updateChannel(channelId, input, options?)` | `PUT /channel/:channelId` | `boolean` |
| `deleteChannel(channelId, options?)` | `DELETE /channel/:channelId` | `boolean`；服务端执行软删除 |

返回值为 API 响应中经过校验的 `data`，保留额外结果字段。创建成功使用 HTTP 201、业务 code 200。空数组及布尔值 `false` 都是有效结果；格式错误的结果作为异常处理。

- **出号：**必填 `channelId`、`country`、`protocol`（`http` 或 `socks5`）、正整数 `sessionDuration`（分钟）、1–1000 的整数 `count`。1000 是本客户端的限制，不代表服务端上限。可选 `state`、`city`、`asn`、`sense`、`gateway`；有 `city` 时必须有 `state`。从 Nstdata 账号中取得渠道及支持的地区、网关值。生成 SOCKS5 URL 不代表本包提供 SOCKS5 网络传输。
- **列表：**可选 `page`、`pageSize`（1–100）、`type`、`regionType`、`status`（0–4）、`createType`（`package` 或 `balance`）、`s`。服务端默认每页 50 条，按创建时间倒序，不返回总数或下一页游标。SDK 仅获取指定页，不自动遍历。
- **创建：**必填 `name`、`password`、`zoneName`、`type`。支持的类型为 `residential`、`residential_lite`、`ipv6`、`datacenter`、`mobile`、`isp`。
- **更新：**同时必填 `name` 与 `password`，不属于部分更新。创建和更新还支持 `limit`（正整数）、`country`、`state`、`city`、`whitelist`（IPv4 地址）、`senses`（字符串）。名称最多 40 个 UTF-16 代码单元；密码至少八位 ASCII 字母或数字。其他账号及产品规则由服务端校验；套餐渠道的地区可能不可编辑。
- **删除：**显式改变渠道可用状态。套餐余量或到期规则可能阻止删除；渠道不存在时返回错误。

未知输入字段在本地拒绝。本包不包含 ISP 购买续费、分销服务操作、Proxy Manager、网页抓取或代理连通性检测。

## 配置与取消

| 构造参数 | 默认值 | 含义 |
| --- | --- | --- |
| `apiKey` | 必填 | 个人或团队 API key |
| `baseUrl` | `https://api.nstdata.io` | HTTPS origin，不含凭据、路径、查询或片段；仅回环测试允许 HTTP |
| `teamId` | 不传 | 可选 `x-team-id` 上下文 |
| `timeoutMs` | `30000` | 包含正文读取的正整数总期限，最大 2147483647 |
| `maxResponseBytes` | `1048576` | 解码后响应字节数的正整数上限 |

每个方法的最后一个参数均可传 `{ signal: AbortSignal }`。信号已取消时不发送请求。超时或取消仅停止本地等待，不取消已提交的远端操作。

所有方法均不自动重试，包括会生成新会话的 `GET /proxies`。创建、更新或删除的执行结果不明时，先检查账号实际状态，再决定是否重新调用。

## 错误

`ProxyAPIError.code` 包括 `INVALID_CONFIG`、`INVALID_ARGUMENT`、`TIMEOUT`、`ABORTED`、`NETWORK_ERROR`、`HTTP_ERROR`、`API_ERROR`、`INVALID_RESPONSE`、`RESPONSE_TOO_LARGE`。

HTTP 失败或业务错误提供 `statusCode`；HTTP 成功但响应包含业务错误时还提供 `applicationCode`。错误消息不包含原始响应、凭据、网络错误详情或取消原因。调用方传入的取消信号对应 `ABORTED`；客户端自身期限对应 `TIMEOUT`。

## 开发

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run check:package
```

测试使用模拟响应和回环服务。包检查使用空 npm 缓存安装精确 tarball，运行安装后的客户端测试、编译 TypeScript 消费示例，并用回环服务执行快速开始示例。这些检查不代表线上 API 兼容性或 npm 公开安装已经通过。

参见[贡献说明](CONTRIBUTING.md)、[变更记录](CHANGELOG.md)及 [MIT 许可](LICENSE)。产品指引：[创建渠道](https://docs.nstdata.io/docs/quick-start/create-a-channel)、[生成代理](https://docs.nstdata.io/docs/quick-start/generate-proxies)。
