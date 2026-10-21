# due-client-cocos

### 1.介绍

due-client-cocos 是面向 Cocos Creator 3.8（最新稳定版）的客户端库，实现了 [due](https://github.com/dobyte/due) 游戏服务器框架的 WS 二进制通信协议与会话安全（security），方便在 Cocos Creator 项目中快速接入 due 网关服务器。

### 2.优势

* 💡 简单性：核心仅 `packer`、`client` 与 `security` 三个模块，无任何第三方依赖，密码学算法均为纯 TypeScript 实现。
* 🚀 高性能：采用原生 `ArrayBuffer` + `DataView` 直接读写二进制，无多余拷贝与序列化开销。
* 🧊 标准化：遵循 due 框架标准打包协议，服务端无需改动。
* ✈️ 跨平台：兼容浏览器、微信小游戏、原生（Android/iOS）等 Cocos Creator 支持的全部平台。
* 🔑 平滑性：内置心跳保活、断线重连，连接状态管理完善。
* 🔒 安全性：适配 due 会话安全（security）握手，支持服务端签名校验、X25519 密钥交换与 AEAD 加密。
* 🧰 易调试：附带 due 协议模拟服务器、TCP 桥接器与端到端测试脚本，无需真实网关即可联调。

### 3.功能

* 连接：基于 WebSocket 的客户端连接，支持自定义连接地址与打包器。
* 打包：支持大小端字节序、可变长度的 route/seq 编码，以及心跳帧、握手帧编解码。
* 消息：支持异步消息 `send` 与同步请求响应 `request`（需服务器开启 seq 支持）。
* 心跳：可配置心跳间隔，接收服务器心跳携带的时间戳。
* 安全：可开启会话安全，握手后所有业务消息自动加解密，并校验服务端签名与消息重放。
* 回调：提供连接、断开、接收、错误、心跳五类钩子函数。
* 重连：断开后可一键重连，演示组件内置自动重连逻辑。

### 4.安装

将本仓库的 `assets/scripts` 目录拷贝到你的 Cocos Creator 3.8 项目的 `assets` 下即可，无需额外安装依赖：

```bash
cp -r assets/scripts /path/to/your-cocos-project/assets/scripts
```

> 只拷贝 `assets/scripts`。仓库根目录的 `tsconfig.json`、`types/cc.d.ts` 仅用于本仓库独立类型检查，不要拷贝到业务工程（业务工程使用 Cocos 编辑器自带的 `cc` 类型）。

目录结构：

```
assets/scripts/
├── network/
│   ├── packer.ts        # 二进制打包器（size/header/route/seq/buffer，含握手帧）
│   ├── client.ts        # WebSocket 客户端（连接/心跳/请求响应/安全会话）
│   ├── security/        # 会话安全（按需动态加载）
│   │   ├── handshake.ts # ClientHello / ServerHello / Finished、会话加解密
│   │   ├── verifier.ts  # RSA / ECDSA 服务端签名校验
│   │   ├── pem.ts       # PEM/DER 公钥解析
│   │   ├── aead.ts      # AES-256-GCM、ChaCha20-Poly1305
│   │   ├── x25519.ts    # X25519 密钥交换
│   │   ├── digest.ts    # 签名哈希（SHA-1 / SHA-224 / SHA-256 / SHA-384 / SHA-512）
│   │   ├── sha256.ts    # SHA-256 / HMAC / HKDF
│   │   └── bytes.ts     # 字节工具
│   └── index.ts         # 模块导出
└── NetworkTest.ts       # 演示组件（挂载到节点即可使用）
```

#### 构建要求

| 项目 | 要求 | 说明 |
|------|------|------|
| Cocos Creator | 3.8.x | 使用原生 `WebSocket`、`ArrayBuffer`、`DataView` |
| TypeScript target | **ES2020 及以上** | 会话安全使用 BigInt 字面量；低于 ES2020 会报 `TS2737` |
| 装饰器 | `experimentalDecorators: true` | Cocos 默认已开启 |
| 随机数 | `crypto.getRandomValues` 或注入 `security.random` | 仅开启会话安全时需要 |
| 文本编解码 | `TextEncoder` / `TextDecoder` | 原生平台建议提供 polyfill（见第 10 节） |

> 未开启 `security` 时，`security` 模块不会被加载，因此不会触发 BigInt 运行时依赖；但 TypeScript 仍会编译该目录，所以 target 需为 ES2020。

### 5.快速开始

在场景中创建空节点并挂载 `NetworkTest` 组件（可选择性拖入一个 `Label` 用于显示状态），或在代码中直接调用：

```ts
import { Client, Packer } from './network';

// 请求数据包
const buffer = new TextEncoder().encode(JSON.stringify({
    message: 'hello server'
}));

// 创建客户端
const client = new Client({
    url: 'ws://127.0.0.1:3533',
    heartbeat: 10000,
    packer: new Packer({
        byteOrder: 'big',
        seqBytes: 2,
        routeBytes: 2,
        bufferBytes: 5000
    })
});

// 监听连接
client.onConnect((c) => {
    console.log('connect success');

    // 发送异步消息
    c.send({ route: 1, buffer });

    // 发送同步请求，需要客户端和服务器同时开启seq配置
    c.request(2, buffer, 2000).then((message) => {
        console.log('response message: ', new TextDecoder().decode(message.buffer));
    }).catch(() => {
        console.log('reject');
    });
});

// 监听连接断开
client.onDisconnect((c) => {
    console.log('disconnect success');

    // 重新连接
    c.connect();
});

// 监听接收到消息
client.onReceive((c, message) => {
    console.log('receive message: ', new TextDecoder().decode(message.buffer));
});

// 监听连接错误
client.onError((c) => {
    console.log('connect error');
});

// 监听服务器心跳附带的服务器时间戳
// millisecond 为服务器时间戳（毫秒），可用于计算客户端与服务端的时间偏移
client.onHeartbeat((c, millisecond) => {
    if (millisecond) {
        // 打印服务器时间戳
        console.log('server heartbeat timestamp: ', millisecond);

        // 计算客户端与服务端的时间偏移（毫秒）
        const offset = millisecond - Date.now();
        console.log('client-server time offset: ', offset, 'ms');
    }
});

// 建立连接
client.connect();
```

#### 5.1 启用会话安全（security）

网关侧通过 `WithSessionSecurity` 开启会话安全：

```go
gate := gate.NewGate(
    gate.WithServer(ws.NewServer()),
    gate.WithLocator(redis.NewLocator()),
    gate.WithRegistry(nacos.NewRegistry()),
    // 开启会话安全：signer 用于签发 ServerHello
    gate.WithSessionSecurity(ecc.NewSigner()),
    // 可选：握手超时，默认 5s
    gate.WithSessionSecurityHandshakeTimeout(5*time.Second),
)
```

- `ecc.NewSigner()` / `rsa.NewSigner()` 从 `[crypto.ecc.signer]` / `[crypto.rsa.signer]` 读取密钥；
- 默认签名哈希为 SHA-256；RSA 默认 PSS 填充，也支持 PKCS#1 v1.5；ECDSA 签名为 `r<delimiter>s` 十进制文本（`delimiter` 默认空格）；详细支持范围见 5.2。
- 客户端只需持有与网关 `privateKey` 配对的**公钥**（如网关的 `resource/key.pub.pem`）。

客户端配置服务端公钥对应的校验器后，握手成功才会触发 `onConnect`，业务消息自动加解密：

```ts
import { Client, Packer } from './network';
import { Verifier } from './network/security';

const client = new Client({
    url: 'ws://127.0.0.1:3533',
    heartbeat: 10000,
    packer: new Packer(),
    security: {
        // 服务端签名校验器：Verifier.ecdsa(publicKey, hash?, delimiter?)
        // 公钥支持 PKCS#1（RSA PUBLIC KEY）与 PKIX（PUBLIC KEY / ECDSA PUBLIC KEY）
        verifier: Verifier.ecdsa(`-----BEGIN ECDSA PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...
-----END ECDSA PUBLIC KEY-----`),
        // 可选：协商套件，1=AES-256-GCM，2=ChaCha20-Poly1305；默认两者都参与协商
        suites: [1, 2],
        // 可选：握手超时（毫秒），默认 5000，小于等于 0 表示不限制
        handshakeTimeout: 5000,
        // 可选：自定义随机字节源（原生平台未提供 crypto.getRandomValues 时注入）
        // random: (length) => fillSecureRandom(length),
    },
});

client.onConnect(() => {
    // 握手完成后 send/request 会自动加密
    client.send({ route: 1, buffer: new TextEncoder().encode('hello secure server') });
});

client.connect();
```

* 网关使用 RSA 签名时，改为 `verifier: Verifier.rsa(pem)`（参数为 `publicKey, hash?, pss?`）。
* 服务端签名默认使用 SHA-256；RSA 默认 PSS 填充（`Verifier.rsa(pem, hash, false)` 切换 PKCS#1 v1.5），ECDSA 支持 P-256/P-384/P-521；哈希算法需与服务端 `hash` 配置一致。
* 握手期间不发送心跳；握手完成后心跳帧仍为明文，与 due 保持一致。
* 握手失败会关闭连接，并触发 `onError`（随后触发 `onDisconnect`）；每次 `connect()` 都会重新握手，会话密钥不复用。

**校验器创建与自定义**：`Verifier` 的参数与 Unity 版一致（`hash` 默认 sha256，`pss` 默认 true，`delimiter` 默认空格）：

```ts
import { Verifier, type HandshakeVerifier } from './network/security';

const ecdsa = Verifier.ecdsa(publicKeyPem);                  // SHA-256 + 空格分隔
const rsa = Verifier.rsa(publicKeyPem);                      // SHA-256 + PSS
const rsa512 = Verifier.rsa(publicKeyPem, 'sha512', false);  // SHA-512 + PKCS#1 v1.5

// 完全自定义校验逻辑（必须同步返回 boolean）
const custom: HandshakeVerifier = (data, signature) => true;
```

**协商套件**：

| ID | 套件 | 说明 |
|----|------|------|
| 1 | AES-256-GCM | 默认首选 |
| 2 | ChaCha20-Poly1305 | 无 AES 硬件加速时更稳 |

网关未显式指定套件时，双方在 `[1, 2]` 中协商，服务端按自身偏好选择第一个交集；客户端 `suites` 需与服务端存在交集，否则握手失败。

#### 5.2 签名校验器支持情况

内置校验器覆盖 RSA 与 ECDSA，API 与 Unity 版保持一致：`Verifier.ecdsa(publicKey, hash?, delimiter?)`、`Verifier.rsa(publicKey, hash?, pss?)`，返回的校验函数通过 `security.verifier` 传入。

**RSA**

| 项目 | 支持情况 |
|------|----------|
| 哈希算法 | `sha1` / `sha224` / `sha256`（默认）/ `sha384` / `sha512` |
| 填充方式 | PSS（默认，salt 长度 = 哈希长度）、PKCS#1 v1.5（`pss: false`） |
| 公钥格式 | PKCS#1（`RSA PUBLIC KEY`）、PKIX/SPKI（`PUBLIC KEY`） |
| 密钥长度 | 任意；按模数实际位长计算 emBits，兼容非字节对齐模数 |

```ts
import { Verifier } from './network/security';

Verifier.rsa(pem);                                  // 默认 SHA-256 + PSS
Verifier.rsa(pem, 'sha256', false);                 // PKCS#1 v1.5
Verifier.rsa(pem, 'sha512');                        // SHA-512 + PSS
Verifier.rsa(pem, 'sha384', false);                 // SHA-384 + PKCS#1 v1.5
```

**ECDSA**

| 项目 | 支持情况 |
|------|----------|
| 曲线 | NIST P-256、P-384、P-521 |
| 哈希算法 | `sha1` / `sha224` / `sha256`（默认）/ `sha384` / `sha512`；哈希长于曲线阶时按 Go 规则截断 |
| 签名格式 | due 的十进制文本 `r<delimiter>s`，`delimiter` 默认空格 |
| 公钥格式 | PKIX/SPKI（`PUBLIC KEY` / `ECDSA PUBLIC KEY`），非压缩点 |

```ts
import { Verifier } from './network/security';

Verifier.ecdsa(pem);                        // 默认 SHA-256 + 空格分隔
Verifier.ecdsa(pem, 'sha384');              // SHA-384
Verifier.ecdsa(pem, 'sha256', ',');         // 自定义分隔符
```

**与服务端配置对照**

| Verifier 参数 | due 服务端配置 |
|--------------|----------------|
| `hash`（第 2 个参数） | `[crypto.ecc.signer] hash` / `[crypto.rsa.signer] hash` |
| `delimiter`（第 3 个参数，ECDSA） | `[crypto.ecc.signer] delimiter` |
| `pss`（第 3 个参数，RSA） | `[crypto.rsa.signer] padding`（`PSS` → `true`，`PKCS` → `false`） |

**自定义校验函数**（与 Unity 的 `HandshakeVerifier` 委托一致）

```ts
import type { HandshakeVerifier } from './network/security';

const custom: HandshakeVerifier = (data: Uint8Array, signature: Uint8Array): boolean => {
    // 自定义校验逻辑
    return true;
};
```

公钥入参支持 PEM 字符串、base64 字符串、DER `Uint8Array`，或已解析的 `PublicKey` 对象。

**暂不支持**（可通过 `security.verifier` 自行实现）：

- RSA-PSS 的非标准 salt 长度（固定为哈希长度，与 Go 的 `PSSSaltLengthEqualsHash` 一致）
- Ed25519、secp256k1 等其它算法/曲线
- ECDSA 的二进制 `r||s`、DER、base64 签名（仅支持 due 的十进制文本格式）
- X.509 证书形式的公钥（仅支持裸公钥）
- 公钥文件路径（仅接受 PEM/base64/DER 内容，请由业务层读取文件后传入）
- 异步校验器（`verify` 必须同步返回 `boolean`）

#### 5.3 Packer 与服务端配置对照

客户端 `Packer` 必须与网关的 `[packet]` 配置一致，否则会出现解析错位或 `message too large`：

| 网关配置 | 客户端字段 | 可选值 |
|----------|-----------|--------|
| `byteOrder` | `byteOrder` | `big`（默认）/ `little` |
| `routeBytes` | `routeBytes` | 1 / 2 / 4 |
| `seqBytes` | `seqBytes` | 0 / 1 / 2 / 4 |
| `bufferBytes` | `bufferBytes` | 与网关相同的消息上限 |

例如 `due-benchmark/cluster/ws` 的网关配置为 `routeBytes = 4`、`seqBytes = 4`，客户端需使用：

```ts
new Packer({ byteOrder: 'big', routeBytes: 4, seqBytes: 4, bufferBytes: 5000 })
```

#### 5.4 发送语义

- `send()` 返回 `boolean`：未连接或未完成安全握手时返回 `false`。
- `route` / `seq` 溢出、`buffer` 超过 `bufferBytes` 会**同步抛出异常**，属于调用方配置错误。
- `request()` 会按 route 维护 seq，并按 seq 匹配响应；网关需开启 seq（`seqBytes > 0`），超时时间小于等于 0 时不启用超时。

#### 5.5 完整示例组件

```ts
import { _decorator, Component } from 'cc';
import { Client, Message, Packer } from './network';
import { Verifier } from './network/security';

const { ccclass, property } = _decorator;

@ccclass('DueClient')
export class DueClient extends Component {
    @property
    url = 'ws://127.0.0.1:3553';

    @property({ multiline: true })
    publicKey = '';

    private client: Client | null = null;
    private retryTimer: any = null;

    start() {
        this.client = new Client({
            url: this.url,
            heartbeat: 10000,
            packer: new Packer({ byteOrder: 'big', routeBytes: 2, seqBytes: 2, bufferBytes: 5000 }),
            security: {
                // 网关使用 RSA 签名时改为 Verifier.rsa(this.publicKey)
                verifier: Verifier.ecdsa(this.publicKey),
                handshakeTimeout: 5000,
            },
        });

        this.client.onConnect(() => {
            console.log('[DueClient] 握手完成，已连接');
        });

        this.client.onDisconnect(() => {
            console.log('[DueClient] 连接断开，3s 后重连');
            this.reconnect();
        });

        this.client.onError(() => {
            console.error('[DueClient] 连接/握手失败');
        });

        this.client.onReceive((_client, message) => this.onMessage(message));

        this.client.connect();
    }

    /** 发送异步消息（握手完成前返回 false） */
    public sendGreet(message: string): boolean {
        if (!this.client) {
            return false;
        }

        const buffer = new TextEncoder().encode(JSON.stringify({ message, sentAt: Date.now() }));
        return this.client.send({ route: 1, buffer });
    }

    /** 发送请求并等待响应（需要网关开启 seq） */
    public greet(message: string): Promise<Message> {
        if (!this.client) {
            return Promise.reject(new Error('client not ready'));
        }

        const buffer = new TextEncoder().encode(JSON.stringify({ message, sentAt: Date.now() }));
        return this.client.request(1, buffer, 3000);
    }

    private onMessage(message: Message) {
        const text = message.buffer ? new TextDecoder().decode(message.buffer) : '';
        console.log(`[DueClient] route=${message.route} seq=${message.seq} body=${text}`);
    }

    private reconnect() {
        this.retryTimer && clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.client?.connect();
        }, 3000);
    }

    onDestroy() {
        this.retryTimer && clearTimeout(this.retryTimer);
        this.client?.disconnect();
        this.client = null;
    }
}
```

挂载该组件到场景节点，填写 `url` 与 `publicKey` 即可（网关使用 RSA 时把 `Verifier.ecdsa` 换成 `Verifier.rsa`）。

### 6.协议说明

采用大端字节序（可配置），数据帧格式：

| 字段 | 字节数 | 说明 |
|------|--------|------|
| size   | 4  | 后续数据总长度 |
| header | 1  | 最高位为 1 表示心跳包，最低位为 1 表示安全握手帧 |
| route  | 1/2/4 | 消息路由 |
| seq    | 0/1/2/4 | 消息序列号（request/response 需要） |
| buffer | 变长 | 消息负载 |
| timestamp | 8 | 仅服务器心跳包携带（毫秒时间戳） |

安全握手帧不携带 route 与 seq：

| 字段 | 字节数 | 说明 |
|------|--------|------|
| size   | 4 | 1 + 握手载荷长度 |
| header | 1 | 固定为 0x01 |
| payload | 变长 | version(1) \| type(1) \| length(2) \| body |

开启会话安全后，业务帧的 `buffer` 为加密封包：

| 字段 | 字节数 | 说明 |
|------|--------|------|
| epoch | 1 | 密钥纪元，当前为 1 |
| counter | 8 | 发送计数器，大端序 |
| ciphertext | 变长 | AEAD 密文 |
| tag | 16 | AEAD 认证标签 |

握手流程：ClientHello（随机数 + X25519 公钥 + 套件列表）→ ServerHello（套件 + 随机数 + 公钥 + 签名 + 确认 MAC）→ Finished（客户端确认 MAC）。

- 会话密钥：X25519 共享密钥经 HKDF-SHA256 派生；
- AAD：`version(1) | direction(1) | epoch(1) | route(4, 大端) | seq(4, 大端)`；
- 接收端带 64 位重放窗口；
- 客户端按 `heartbeat` 间隔发送明文心跳；网关 `heartbeatTime = true` 时心跳携带 8 字节服务器毫秒时间戳。

### 7.消息编解码建议

客户端只负责二进制传输，业务层可自行选择序列化方式：

```ts
// JSON
const buffer = new TextEncoder().encode(JSON.stringify(payload));
const text = new TextDecoder().decode(message.buffer);

// 或使用 protobuf / msgpack 等库生成 Uint8Array
```

约定：

- `route` 为业务路由，需与 node 侧 `proxy.Router().AddRouteHandler(route, ...)` 一致；
- `request/response` 依赖 `seq` 回传，node 侧使用 `ctx.Response(...)` 即可；
- 单条消息负载不能超过 `bufferBytes`（开启 security 时还会额外增加 25 字节封包开销）。

### 8.断线重连

建议在 `onDisconnect` 中做退避重连，并对重复的 `onDisconnect/onError` 做去重：

```ts
let retry = 0;

client.onDisconnect(() => {
    retry++;
    const delay = Math.min(1000 * retry, 10000);

    setTimeout(() => client.connect(), delay);
});

client.onConnect(() => {
    retry = 0;
});
```

注意：握手失败会同时触发 `onError` 与 `onDisconnect`，重连逻辑需幂等；`disconnect()` 会立即清理会话状态。

### 9.运行与联调

模拟服务器复用了同一份 `Packer`，保证协议一致，无需真实网关即可对客户端做端到端测试：

```bash
cd tools
npm install

# 运行单元测试（密码学向量）与端到端测试（Packer + Client + 安全会话）
npm test

# 单独启动模拟服务器（默认 3533，可用 PORT 覆盖）
npm run server
```

启动模拟服务器后，可在浏览器/Cocos 预览中连接 `ws://127.0.0.1:3533` 进行联调。

#### 连接 TCP 网关

本客户端仅实现 WebSocket 传输。若网关使用 TCP（如 `due-benchmark/cluster/tcp`），生产环境建议改用 WS 网关；本地联调可先启动自带的字节桥接器：

```bash
cd tools

# 终端 1：启动 TCP -> WebSocket 桥接器（默认 127.0.0.1:3553 -> ws://127.0.0.1:3554）
npm run bridge

# 终端 2：使用当前客户端连接真实网关并发送 greet（route=1）
npm run test:gate
```

桥接器与测试脚本支持环境变量：`TARGET`、`PORT`、`GATE_URL`、`KEY_FILE`、`ROUTE`、`MESSAGE`、`SIZE`、`COUNT`、`SUITES`。

若网关本身使用 WebSocket（如 `due-benchmark/cluster/ws`），无需桥接器，直接指定地址与公钥即可：

```powershell
$env:GATE_URL='ws://127.0.0.1:3553'
$env:KEY_FILE='E:\workspace\dobyte\due-benchmark\cluster\ws\gate\resource\key.pub.pem'
$env:SIZE='4096'; $env:COUNT='20'
npm run test:gate
```

### 10.平台适配

#### 浏览器 / 微信小游戏

- 浏览器与微信小游戏均支持 `WebSocket`、`crypto.getRandomValues`；
- 微信小游戏需在平台配置 socket 合法域名（生产环境使用 `wss://`）。

#### 原生平台（Android / iOS）

| 事项 | 说明 |
|------|------|
| WebSocket | Cocos 原生层已提供 |
| BigInt | 需要 iOS 14+ / 现代 Android 运行时；低版本请升级或使用不开启 security 的包 |
| 随机数 | `globalThis.crypto` 可能不存在，需注入 `security.random` |
| TextEncoder/Decoder | 建议引入 polyfill 或替换为自定义 UTF-8 编解码 |

随机数注入示例：

```ts
const client = new Client({
    url: 'wss://game.example.com',
    heartbeat: 10000,
    packer: new Packer(),
    security: {
        // publicKey 为服务端公钥 PEM 内容
        verifier: Verifier.ecdsa(publicKey),
        random: (length: number) => {
            const bytes = new Uint8Array(length);
            // 调用平台原生安全随机数接口填充 bytes
            // 必须使用密码学安全随机源，禁止 Math.random
            nativeSecureRandomFill(bytes);
            return bytes;
        },
    },
});
```

业务工程 `tsconfig.json` 需要 `target: "ES2020"`（或更高）以支持 BigInt：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "experimentalDecorators": true
  }
}
```

### 11.常见问题

| 现象 | 原因与处理 |
|------|-----------|
| `security: invalid server signature` | 公钥与网关私钥不匹配；网关签名哈希与客户端 `hash` 配置不一致；ECDSA `delimiter` 与客户端不一致 |
| `security: verifier is required` | 未配置签名校验器；使用 `Verifier.ecdsa(pem)` 或 `Verifier.rsa(pem)` 创建后传入 |
| `security: handshake timeout` | 网关未开启 `WithSessionSecurity`；连接到了 TCP 而不是 WS；公钥解析失败 |
| `security: session is not established` | 握手完成前发送了业务消息（`send` 返回 `false`）；等待 `onConnect` 后再发送 |
| 握手失败后触发 `onError` + `onDisconnect` | 预期行为；重连逻辑需做幂等处理 |
| `route overflow` / `seq overflow` | `route` / `seq` 超出 Packer 的字节范围（2 字节最大 32767） |
| `message too large` | 负载超过 `bufferBytes`；开启 security 时还会额外增加 25 字节封包开销 |
| 收到乱码或解析失败 | 客户端与服务端 `[packet]` 配置不一致（`byteOrder` / `routeBytes` / `seqBytes`） |
| `TS2737` | 工程 target 低于 ES2020 |
| 原生平台握手立即失败 | 缺少 `crypto.getRandomValues`，注入 `security.random` |
| 连接成功但收不到响应 | node 未注册对应 route；或网关与 node 未注册到同一注册中心 |

### 12.安全说明与限制

- 客户端校验服务端签名与确认 MAC，防止中间人伪造网关；
- 业务消息使用 AEAD 加密，AAD 绑定 route/seq，篡改或重放会被拒绝；
- 签名哈希由 `hash` 选项配置（默认 SHA-256），需与服务端 `[crypto.*.signer] hash` 保持一致；
- 当前协议 epoch 固定为 1，暂不支持会话中密钥轮换；
- 握手帧、心跳帧为明文；握手帧本身不携带任何业务数据；
- 客户端仅验证服务端身份，不提供服务端对客户端的证书认证能力。

### 13.注意事项

* `NetworkTest.ts` 依赖 Cocos Creator 的 `cc` 模块；仓库根目录提供了 `types/cc.d.ts` 最小声明与 `tsconfig.json`，因此在仓库内独立类型检查（`tsc -p tsconfig.json`）不会报错。将 `assets/scripts` 拷贝进 Cocos 工程后会使用编辑器自带的完整 `cc` 类型，`types/` 与根目录 `tsconfig.json` 不会随拷贝进入工程。

### 14.发布

仓库内置 GitHub Actions 自动发布流程：[.github/workflows/release.yml](.github/workflows/release.yml)。

- 触发方式：
  - 推送 `v*` 标签（如 `v1.0.1`）；
  - 或在 Actions 页面手动触发 `Release` 工作流并填写标签。
- 发布流程：安装 `tools` 依赖 → TypeScript 类型检查 → 运行全部测试 → 打包 `assets/scripts` 与 README → 创建或更新 GitHub Release。
- 发布产物：`due-client-cocos-<tag>.zip`，解压后即为可拷贝到 Cocos 工程的 `scripts` 目录。

```bash
git tag v1.0.1
git push origin v1.0.1
```

> Cocos 客户端以源码目录分发，不发布到 npm；工作流使用仓库默认的 `GITHUB_TOKEN` 创建 Release，无需额外 Secrets。

## License

[MIT](https://tldrlegal.com/license/mit-license)
