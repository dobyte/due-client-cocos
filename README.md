# due-client-cocos

### 1.介绍

due-client-cocos 是面向 Cocos Creator 3.8（最新稳定版）的客户端库，实现了 [due](https://github.com/dobyte/due) 游戏服务器框架的 WS 二进制通信协议，方便在 Cocos Creator 项目中快速接入 due 网关服务器。

### 2.优势

* 💡 简单性：核心仅 `packer`、`client` 两个文件，无任何第三方依赖，源码简洁易理解。
* 🚀 高性能：采用原生 `ArrayBuffer` + `DataView` 直接读写二进制，无多余拷贝与序列化开销。
* 🧊 标准化：遵循 due 框架标准打包协议，服务端无需改动。
* ✈️ 跨平台：兼容浏览器、微信小游戏、原生（Android/iOS）等 Cocos Creator 支持的全部平台。
* 🔑 平滑性：内置心跳保活、断线重连，连接状态管理完善。
* 🧰 易调试：附带 due 协议模拟服务器与端到端测试脚本，无需真实网关即可联调。

### 3.功能

* 连接：基于 WebSocket 的客户端连接，支持自定义连接地址与打包器。
* 打包：支持大小端字节序、可变长度的 route/seq 编码，以及心跳帧编解码。
* 消息：支持异步消息 `send` 与同步请求响应 `request`（需服务器开启 seq 支持）。
* 心跳：可配置心跳间隔，接收服务器心跳携带的时间戳。
* 回调：提供连接、断开、接收、错误、心跳五类钩子函数。
* 重连：断开后可一键重连，演示组件内置自动重连逻辑。

### 4.安装

将本仓库的 `assets/scripts` 目录拷贝到你的 Cocos Creator 3.8 项目的 `assets` 下即可，无需额外安装依赖：

```bash
cp -r assets/scripts /path/to/your-cocos-project/assets/scripts
```

目录结构：

```
assets/scripts/
├── network/
│   ├── packer.ts    # 二进制打包器（size/header/route/seq/buffer）
│   ├── client.ts    # WebSocket 客户端（连接/心跳/请求响应）
│   └── index.ts     # 模块导出
└── NetworkTest.ts   # 演示组件（挂载到节点即可使用）
```

### 5.使用

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

### 6.模拟测试

模拟服务器复用了同一份 `Packer`，保证协议一致，无需真实网关即可对客户端做端到端测试：

```bash
cd tools
npm install

# 运行模拟测试（Packer 编解码 + Client 端到端通信）
npm test

# 单独启动模拟服务器（默认 3533，可用 PORT 覆盖）
npm run server
```

启动模拟服务器后，可在浏览器/Cocos 预览中连接 `ws://127.0.0.1:3533` 进行联调。

### 7.协议说明

采用大端字节序（可配置），数据帧格式：

| 字段 | 字节数 | 说明 |
|------|--------|------|
| size   | 4  | 后续数据总长度 |
| header | 1  | 最高位为 1 表示心跳包 |
| route  | 1/2/4 | 消息路由 |
| seq    | 0/1/2/4 | 消息序列号（request/response 需要） |
| buffer | 变长 | 消息负载 |
| timestamp | 8 | 仅服务器心跳包携带（毫秒时间戳） |

### 8.注意事项

* `NetworkTest.ts` 中的 `cc` 模块导入及 `schedule/unschedule` 依赖 Cocos Creator 编辑器提供的类型，在编辑器外会提示类型错误，属正常现象，在 Cocos Creator 3.8 中打开后即会消除。
* `TextEncoder`/`TextDecoder` 在浏览器及 Node 中可直接使用；如需发布到原生平台，建议替换为自定义 UTF-8 编解码工具或引入 polyfill。

## License

[MIT](https://tldrlegal.com/license/mit-license)
