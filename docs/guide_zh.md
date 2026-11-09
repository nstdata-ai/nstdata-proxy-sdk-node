# Proxy SDK 使用指南

[English](guide.md) · [快速开始](../README_zh.md)

[命令行选项](#命令行选项) · [便捷出号](#便捷出号) · [API 参考](#普通用户-api-方法) · [配置与错误](#配置与错误)

## 命令行选项

按[快速开始](../README_zh.md#命令行使用)通过 npx 运行 `nstdata-proxy`。需要长期使用时，可执行 `npm install --global @nstdata-ai/proxy`，再运行 `nstdata-proxy`；两种方式均无需创建 Node.js 项目。

| 选项 | 行为 |
|---|---|
| 不传选项 | 交互式流程：隐藏输入 Key、查看选择摘要、确认、按需私密导出。 |
| `--env <path>` | 只加载指定环境文件；已有环境变量优先，不自动搜索 `.env`。 |
| `--dry-run` | 只读准备，不创建渠道、不生成会话。 |
| `--yes` | 无提示确认准备与出号；非交互式出号必须明确指定。 |
| `--channel <id>` | 只使用此已有渠道。 |
| `--type <type>`、`--zone <name>`、`--country <code>` | 要求指定产品类型、实际产品名称和支持的国家。 |
| `--protocol <http\|socks5>` | 默认 `http`；SOCKS5 输出仅为连接字符串，不包含 SOCKS5 客户端。 |
| `--duration <minutes>`、`--count <1–1000>` | 默认 10 分钟、1 条连接。 |
| `--json` | 关闭交互提示；stdout 输出一条 JSON 结果。 |
| `--output <path>` | 将完整连接保存到新的 JSON 文件，权限 `0600`，不覆盖已有文件。 |
| `--show-url` | 明确允许 stdout 包含带认证信息的 URL；与 `--output` 互斥。 |
| `--help`、`-h` | 查看帮助，不需要 Key、不发 API 请求。 |

文件模式 `0600` 在 POSIX 系统限制访问权限；Windows 应使用具有适当访问控制的目录。

`NSTDATA_API_TOKEN` 来自环境变量或显式指定的环境文件；交互模式可隐藏输入，不回显、不保存。`NSTDATA_TEAM_ID` 是可选团队上下文。`NSTDATA_API_BASE_URL` 仅用于高级 API 服务地址覆盖，不是常规必填参数，也不是代理 URL；默认使用官方 API。

默认 stdout 包含选择元数据和 `count`；`saved: true` 表示文件已保存。导出的 JSON 另含 `proxies` 数组。

错误以 `{ error: { code, message } }` 写入 stderr，已知时附带 `statusCode` 和整数 `applicationCode`；常见认证、权限、限流和服务错误另有简短的 `hint`。

退出码：0 成功，1 API／准备失败，2 命令行输入需修正，130 中断；以 `ProxyAPIError` 返回的 API 配置错误使用退出码 1。

## 便捷出号

| 方法 | 结果与副作用 |
|---|---|
| `prepareProxy(input?, options?)` | 只读 `ProxyPreparation`：实际产品／国家、参考价、余额、渠道名、`channelAction`（`create` 或 `reuse`）以及已知时的 `channelId`。 |
| `getProxy(input?, options?)` | `ProxyConnection`：一条完整 `url`，以及 `channelId`、`type`、`zoneName`、`country`、`protocol`、`sessionDuration`、`priceGB`、`createdChannel`。可能创建 SDK 默认渠道。 |
| `getProxies(input?, options?)` | 同样的元数据，使用 `proxies: string[]` 替代 `url`；可传 `count`（1–1000，默认 1），整批只发一次出号请求。 |

共同可选输入为 `channelId`、`type`、`zoneName`、`country`、`protocol`、`sessionDuration`；仅 `getProxies` 接受 `count`。`prepareProxy` 不预留资源，也不证明连通性。返回 URL 含认证信息，应交给兼容的客户端使用，不要直接打印。

### 选择规则

1. 读取当前账号余额与实际产品目录。未指定渠道时，按量产品优先 Residential Lite，其次 Residential；同类型按参考价、产品名称稳定排序。
2. 优先复用活跃且兼容的 `nstdata-sdk-default` 按量渠道，没有时才创建。不自动选取其他名称或套餐渠道；显式指定的渠道单独核对，不会被悄悄替换。
3. 遵守指定国家或渠道固定国家；否则优先地区接口返回的 US，再按代码排序选取支持的国家。与渠道固定国家冲突时失败，不修改原渠道。
4. 默认 HTTP、1 条、10 分钟会话；不指定网关，由服务端选择默认值。会话时长不代表 IP 固定或在线时长保证。
5. 需要时使用密码学随机密码创建不限国家的默认渠道，再执行一次出号。不改名、重置或删除其他渠道，不购买套餐，不访问检测目标。

显式选择的产品须支持所选协议和国家。ISP 必须提供已有可用渠道，便捷方法不购买或续费 ISP 资源。指定仍有配额的套餐渠道时，无需钱包余额为正；实际权限和可用资源由服务端最终判定。`priceGB` 是产品目录参考值，不是最终账单保证。

### 复用与恢复

同一 `ProxyClient` 内准备结果最多缓存 30 秒、16 组选项；同一账号上下文应复用客户端。并发调用共享初始化和默认渠道创建，包括不同国家的调用；出号仍分别执行。取消一个调用不会中断其他等待者。`createdChannel` 描述共享初始化是否创建过渠道，不是每次调用的创建计数。

协调不跨客户端实例、进程或机器，也不承诺服务端渠道唯一性。多 worker 部署可保存已确认的渠道 ID。默认渠道最多搜索 5 页、每页 100 条；分页不完整或重复时停止，不据此创建渠道。

创建和出号均不自动重试。创建响应丢失后，同一客户端记录未知结果；后续调用先只读查找并复用已确认的匹配渠道，找不到则返回 `CHANNEL_CREATION_UNCERTAIN`，不再次创建。应查看控制台或传入已确认的 `channelId`；重启进程不证明上一次创建失败。出号传输失败返回 `PROXY_GENERATION_UNCERTAIN`，再次请求会话前须核对结果。取消本地等待不会撤销远端操作。

## 普通用户 API 方法

各方法返回 API 响应中已校验的 `data`，保留额外结果字段。下列路由相对于 `baseUrl + /api/v1/api`。

| 方法 | 路由 | 结果 |
|---|---|---|
| `getAccountInfo(options?)` | `GET /user/info` | `AccountInfo`，包含数值 `balance` |
| `listPlans(query?, options?)` | `GET /plan/info` | `ProxyPlan[]`，可按产品 `type` 过滤 |
| `listCountries({ type }, options?)` | `GET /region/country` | `ProxyCountry[]`，以返回的 `value` 作为地区值 |
| `generateProxies(input, options?)` | `GET /proxies` | `{ proxies: string[], count: number }` |
| `listChannels(query?, options?)` | `GET /channels` | 单页 `Channel[]` |
| `getChannel(channelId, options?)` | `GET /channel/:channelId` | 活跃渠道 `Channel[]`，不存在为 `[]` |
| `createChannel(input, options?)` | `POST /channel` | `Channel` |
| `updateChannel(channelId, input, options?)` | `PUT /channel/:channelId` | `boolean` |
| `deleteChannel(channelId, options?)` | `DELETE /channel/:channelId` | `boolean` |

空列表和布尔值 false 都是有效结果，不伪造成成功或异常。创建使用 HTTP 201、业务 code 200。结果结构校验不证明账号权限或产品可用性。

产品目录返回 `name`、`type`、`protocols`、参考 `priceGB` 和 `supports`；地区记录包含 `value`，并可能包含 `label`、`regionId`。API Key 和可选团队 ID 决定账号上下文。

## 代理出号

使用现有渠道 ID，以及账号支持的地区／网关值。以下片段替换快速开始 `try` 块中的 `getProxy` 调用、紧接的注释与输出语句，每次只执行一项操作；需要的 `NSTDATA_CHANNEL_ID` 等变量添加到同一 `.env` 文件。

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

`listChannels` 只读取指定页。使用 `page`、`pageSize`（1–100）、`type`、`regionType`（`country`／`state`／`city`）和 `status`（0–4）限定列表。精确名称和按量渠道在返回行中本地筛选，便捷入口已包含此逻辑。为保持兼容，仍转发已有 `s`、`createType` 输入，但需要接口支持，不用于自动渠道发现。

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
| `INSUFFICIENT_BALANCE` | 无可用余额或指定渠道配额。 |
| `NO_COMPATIBLE_PLAN`、`COUNTRY_UNAVAILABLE` | 无法确定符合要求的产品或国家。 |
| `CHANNEL_UNAVAILABLE`、`CHANNEL_REQUIRED` | 指定渠道不可用，或该产品需要已有渠道。 |
| `CHANNEL_DISCOVERY_LIMIT` | 渠道发现不完整，应指定已确认的渠道 ID。 |
| `CHANNEL_CREATION_UNCERTAIN`、`PROXY_GENERATION_UNCERTAIN` | 远端操作可能已成功，未自动重试。 |
| `NO_PROXY_GENERATED` | API 返回空代理列表。 |

HTTP／业务失败提供 `statusCode`，业务错误另提供 `applicationCode`。错误文字不包含原始正文、凭据、传输详情或取消原因。传输失败后的出号／写入结果可能未知，应核对实际状态，再决定是否重新调用。

本包范围为上述普通用户方法和便捷入口。分销 `/api/v1/service`、Dashboard 会话、ISP 购买续费和框架集成使用独立契约。公开示例和日志不记录 Key、代理连接或完整渠道记录。
