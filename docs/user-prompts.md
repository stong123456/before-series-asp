# End-User Prompts

Replace `<PUBLIC_BASE_URL>` with the final HTTPS deployment domain. Each example uses a two-step flow: paste the invocation first, let the Agent ask for the actual content, then reply with that content. The Agent must not initiate payment while the content is missing.

## Before Ape Chinese

```text
我想使用 Before Series 提供的服务：
服务名称：冲前风险检查卡
服务类型：A2MCP
接口地址：<PUBLIC_BASE_URL>/api/before/ape
输出语言：中文
请先向我索取要检查的项目介绍、推文、群消息、活动规则或交互说明。收到实际内容前不要发起付款。
请使用 OKX Agent Payments Protocol 向该接口发送请求。
```

Agent 询问后，直接回复实际内容，不要回复占位符。

## Before Ape English

```text
I want to use a Before Series service:
Service: Pre-Ape Risk Check Card
Type: A2MCP
Endpoint: <PUBLIC_BASE_URL>/api/before/ape
Language: English
Ask me for the actual project, campaign, post, or interaction description first. Do not initiate payment until that content is provided.
Please send the request through OKX Agent Payments Protocol.
```

After the Agent asks, reply with the actual content, not placeholder text.

## Before Sign Chinese

```text
我想使用 Before Series 提供的服务：
服务名称：钱包签名风险提醒
服务类型：A2MCP
接口地址：<PUBLIC_BASE_URL>/api/before/sign
输出语言：中文
请先向我索取钱包弹窗、签名、授权或合约交互文字，并提醒我不要提供助记词、私钥或验证码。收到实际内容前不要发起付款。
请使用 OKX Agent Payments Protocol 向该接口发送请求。
```

Agent 询问后，直接回复实际内容，不要发送任何助记词、私钥或验证码。

## Before Sign English

```text
I want to use a Before Series service:
Service: Wallet Signature Risk Reminder
Type: A2MCP
Endpoint: <PUBLIC_BASE_URL>/api/before/sign
Language: English
Ask me for the actual wallet popup, signature, approval, or contract interaction text first, and remind me never to provide a seed phrase, private key, or verification code. Do not initiate payment until content is provided.
Please send the request through OKX Agent Payments Protocol.
```

After the Agent asks, reply with the actual non-secret content.

## Before Shill Chinese

```text
我想使用 Before Series 提供的服务：
服务名称：Web3 推文发布前检查
服务类型：A2MCP
接口地址：<PUBLIC_BASE_URL>/api/before/shill
输出语言：中文
请先向我索取准备发布的推文、推广文案或合作内容。收到实际文案前不要发起付款。
请使用 OKX Agent Payments Protocol 向该接口发送请求。
```

Agent 询问后，直接回复准备发布的实际文案。

## Before Shill English

```text
I want to use a Before Series service:
Service: Web3 Pre-Publish Copy Check
Type: A2MCP
Endpoint: <PUBLIC_BASE_URL>/api/before/shill
Language: English
Ask me for the actual Web3 post, promotional draft, or collaboration copy first. Do not initiate payment until that content is provided.
Please send the request through OKX Agent Payments Protocol.
```

After the Agent asks, reply with the actual draft.
