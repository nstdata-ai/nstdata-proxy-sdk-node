# Proxy SDK 使用指南

[English](guide.md) · [快速开始](../README_zh.md)

## 方法

各方法返回 API 响应中已校验的 `data`，保留额外结果字段。下列路由相对于 `baseUrl + /api/v1/api`。

| 方法 | 路由 | 结果 |
|---|---|---|
| `generateProxies(input, options?)` | `GET /proxies` | `{ proxies: string[], count: number }` |
| `listChannels(query?, options?)` | `GET /channels` | 单页 `Channel[]` |
| `getChannel(channelId, options?)` | `GET /channel/:channelId` | 活跃渠道 `Channel[]`，不存在为 `[]` |
| `createChannel(input, options?)` | `POST /channel` | `Channel` |
| `updateChannel(channelId, input, options?)` | `PUT /channel/:channelId` | `boolean` |
| `deleteChannel(channelId, options?)` | `DELETE /channel/:channelId` | `boolean` |

空列表和布尔值 false 都是有效结果，不伪造成成功或异常。创建使用 HTTP 201、业务 code 200。结果结构校验不证明账号权限或产品可用性。

## 代理出号

使用现有渠道 ID，以及账号支持的地区／网关值。以下片段替换快速开始 `try` 块中的 `listChannels` 调用及其输出语句，每次只执行一项操作；需要的 `NSTDATA_CHANNEL_ID` 等变量添加到同一 `.env` 文件。

```js
const generated = await client.generateProxies({
    channelId: process.env.NSTDATA_CHANNEL_ID,
    country: 'US', protocol: 'http', sessionDuration: 10, count: 1,
});
console.log({ count: generated.count });
```

| 输入 | 约束 |
|---|---|
| `channelId`、`country` | 必填非空字符串，使用账号中的渠道和地区值。 |
| `protocol` | `http` 或 `socks5`。 |
| `sessionDuration` | 正整数分钟。 |
| `count` |1–1000整数；这是客户端保护上限，不代表服务端最大值。 |
| `state`、`city` | 可选；有 city 时须有 state。 |
| `asn` | 可选正整数。 |
| `sense`、`gateway` | 可选非空字符串。 |

出号虽使用 GET，也可能创建新会话。返回的连接串含凭据，须安全保存。生成 SOCKS5 URL 不代表本包实现 SOCKS5 网络传输或检测连通性。所有操作均不自动重试。

## 渠道读取

`listChannels` 只读取指定页。可选输入为 `page`、`pageSize`（1–100）、`type`、`regionType`（`country`／`state`／`city`）、`status`（0–4）、`createType`（`package`／`balance`）和搜索文本 `s`。

服务默认每页50条、按创建时间倒序，不返回总数或下一游标。渠道变更时，页长度不能保证读取到一致快照；自行遍历时须设置明确页数上限。

`getChannel(id)` 返回数组，不是单个对象；空数组表示没有匹配的活跃渠道。记录可能含密码和额外字段，使用导出的 `Channel` 类型并只选择应用需要的字段。

```js
const channels = await client.getChannel(process.env.NSTDATA_CHANNEL_ID);
console.log({ matchingChannels: channels.length });
```


## 渠道管理

以下操作改变账号状态。各段单独执行，并保存创建后的渠道 ID；结果不确定时先核对实际状态，再决定是否提交。创建成功不表示该账号支持全部代理产品。

### 创建

选择已有 `zoneName` 及匹配的产品类型。在本地设置 `NSTDATA_ZONE_NAME` 和唯一的 `NSTDATA_CHANNEL_PASSWORD`；真实密码不写代码或日志。

```js
const channel = await client.createChannel({
    name: 'development', password: process.env.NSTDATA_CHANNEL_PASSWORD,
    zoneName: process.env.NSTDATA_ZONE_NAME, type: 'residential',
});
// Persist channel.channelId locally before further operations.
```

必填 `name`、`password`、`zoneName`、`type`。支持的类型：`residential`、`residential_lite`、`ipv6`、`datacenter`、`mobile`、`isp`。

### 更新

`name` 与 `password` 同时必填，不属于部分更新；明确提供要保存的值，包括有权设置的密码。

```js
const updated = await client.updateChannel(process.env.NSTDATA_CHANNEL_ID, {
    name: 'development-updated', password: process.env.NSTDATA_CHANNEL_PASSWORD,
});
console.log({ updated });
```

创建与更新还支持正整数 `limit`、`country`、`state`、`city`、IPv4 `whitelist` 和字符串数组 `senses`。空白名单／senses 数组原样发送。名称最多40个 UTF-16 代码单元，密码至少八位 ASCII 字母／数字。账号及产品规则由服务校验；套餐渠道地区可能不可编辑。

### 删除

服务端执行软删除。套餐余量或到期规则可能阻止删除，渠道不存在时可能返回 API 错误。

```js
const deleted = await client.deleteChannel(process.env.NSTDATA_CHANNEL_ID);
console.log({ deleted });
```

## 配置与错误

| 构造参数 | 默认值／含义 |
|---|---|
| `apiKey` | 必填个人／团队 key，仅通过 `x-api-key` 发送；拒绝服务或浏览器会话凭据。 |
| `baseUrl` | 可选 API 服务地址，默认 `https://api.nstdata.io`。仅使用获准的替代接口或本地测试时覆盖；不是代理网关地址。须为不含凭据／路径／查询／片段的 HTTPS origin，仅回环测试允许 HTTP。 |
| `teamId` | 可选 `x-team-id` 上下文。 |
| `timeoutMs` |30000；正整数且不超过2147483647，覆盖正文读取。 |
| `maxResponseBytes` |1048576；解码响应字节数的正安全整数上限。 |

方法的最后一个参数可传 `{ signal: AbortSignal }`。信号已取消则不发送请求。拒绝重定向；未知输入、控制字符和不完整 Unicode 文本在本地拒绝。取消／期限只停止本地等待，不取消已提交的远端操作。

| `ProxyAPIError.code` | 含义 |
|---|---|
| `INVALID_CONFIG`、`INVALID_ARGUMENT` | 客户端配置或方法输入不合法。 |
| `TIMEOUT`、`ABORTED` | 客户端期限或调用方取消。 |
| `NETWORK_ERROR` | 连接或正文读取失败。 |
| `HTTP_ERROR`、`API_ERROR` | HTTP 状态失败或 API 外层业务错误。 |
| `INVALID_RESPONSE` | UTF-8／JSON／外层包装或方法结果结构不合法。 |
| `RESPONSE_TOO_LARGE` | 响应超出配置字节上限。 |

HTTP／业务失败提供 `statusCode`，业务错误另提供 `applicationCode`。错误文字不包含原始正文、凭据、传输详情或取消原因。传输失败后的出号／写入结果可能未知，应核对实际状态，再决定是否重新调用。

本包范围为上述六个普通用户方法。分销 `/api/v1/service`、Dashboard 会话、ISP 购买续费和框架集成使用独立契约。公开示例和日志不记录 Key、代理连接或完整渠道记录。
