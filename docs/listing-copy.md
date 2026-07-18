# OKX.AI Listing Copy

## Agent

**Agent name:** Before Series

**Chinese description:**

Before Series 是面向 Web3 普通用户和创作者的轻量前置风险筛查工具。用户只需粘贴一段项目介绍、钱包签名内容或待发布文案，即可获得一张简洁的双语检查卡和临时网页报告链接。报告会区分评估对象、可见证据、判断置信度、建议动作与尚未核验范围。Before Ape 用于参与项目前识别红旗与信息缺口；Before Sign 用于签名和授权前解释可见权限风险；Before Shill 用于发布前检查广告味、AI 味、夸大表达与一般发布风险。一次输入，不追问，约三十秒看完。结果仅用于信息整理、风险教育和内容优化，不构成投资建议、安全认证或法律意见。

**English description:**

Before Series is a lightweight bilingual preliminary-risk service for Web3 users and creators. Paste one block of project information, wallet-signature text, or draft copy and receive one concise card plus a temporary web-report link. The report separates the risk subject, visible evidence, assessment confidence, recommended decision, and unverified scope. Before Ape reviews pre-participation red flags, Before Sign explains visible signing and approval risks, and Before Shill checks advertising tone, AI-like wording, unsupported claims, and general publishing risk. One input, no follow-up questions, and a result designed to read in about 30 seconds. The service provides information organization, risk education, and copy editing only. It is not investment advice, a security certification, or legal advice.

**Type:** A2MCP

**Category recommendation:** Software service

## Service 1

**Name:** Before Ape

**Service name:** 冲前风险检查卡 / Pre-Ape Risk Check Card

**Price:** 0.01 USD₮0 per call

**Chinese description:**

粘贴项目介绍、推文、群消息、活动规则、官网文案、合约地址或 KOL 推荐内容，直接获得一张冲前风险检查卡。卡片会列出风险等级、原文红旗、信息缺口、最该核验的三件事和更稳妥的下一步。服务不会访问链接或审计合约，结果仅用于风险教育和信息整理。

**English description:**

Paste a project description, post, group message, campaign rule, website copy, contract address, or KOL recommendation and receive one pre-ape risk card. It lists the risk level, evidence-backed red flags, information gaps, the top three checks, and a safer next step. The service does not visit links or audit contracts and is for risk education and information organization only.

**Endpoint:** `https://<your-domain>/api/before/ape`

## Service 2

**Name:** Before Sign

**Service name:** 钱包签名风险提醒 / Wallet Signature Risk Reminder

**Price:** 0.01 USD₮0 per call

**Chinese description:**

粘贴钱包弹窗、签名请求、approve、claim、mint、stake、bridge 或合约交互说明，直接获得一张签名前提醒卡。卡片会解释可见的交互类型、授权与资产风险、主钱包提醒，以及当前文字无法确认的字段。服务不会连接钱包、执行交易或索取敏感信息，也不替代交易模拟和合约审计。

**English description:**

Paste a wallet popup, signature request, approve, claim, mint, stake, bridge, or contract-interaction description and receive one pre-sign reminder card. It explains the visible interaction type, approval and asset risks, primary-wallet guidance, and fields that cannot be confirmed from the supplied text. It never connects a wallet, executes a transaction, or requests secrets, and it does not replace transaction simulation or contract auditing.

**Endpoint:** `https://<your-domain>/api/before/sign`

## Service 3

**Name:** Before Shill

**Service name:** Web3 推文发布前检查 / Web3 Pre-Publish Copy Check

**Price:** 0.01 USD₮0 per call

**Chinese description:**

粘贴准备发布的 Web3 推文、推广文案、活动介绍或合作内容，直接获得一张发布前检查卡。卡片会检查广告味、AI 味、收益承诺、FOMO、绝对化表达和合作披露边界，并返回一版不增加原文事实的自然修改稿。结果用于文案优化和一般风险提示，不构成法律意见或项目背书。

**English description:**

Paste a Web3 post, promotional draft, campaign introduction, or collaboration copy and receive one pre-publish check card. It reviews advertising tone, AI-like phrasing, performance promises, FOMO, superlatives, and sponsorship-disclosure boundaries, then returns a more natural revision without adding new facts. The result is for copy editing and general risk awareness, not legal advice or project endorsement.

**Endpoint:** `https://<your-domain>/api/before/shill`

## Unified Tagline

**Chinese:** Before 系列：帮你在链上少犯一次低级错误。一次输入，一张卡片，三十秒看完。

**English:** Before Series: avoid one preventable Web3 mistake. One input, one card, readable in 30 seconds.

## Unified Disclaimer

**Chinese:** 仅用于信息整理、风险教育和内容优化，不构成投资建议、安全认证或法律意见，也不代表项目或交互真实安全或不安全。

**English:** For information organization, risk education, and copy editing only. It is not investment advice, a security certification, or legal advice and does not establish that a project or interaction is safe or unsafe.

## Reviewer Notes

- Each listed endpoint is a public HTTPS `POST` endpoint.
- An unpaid request returns HTTP `402` with a standard `PAYMENT-REQUIRED` x402 v2 header.
- Payment uses the official OKX Payment SDK on X Layer.
- Each service costs exactly 0.01 USD₮0 per call.
- Paid replay returns one structured JSON card and a required temporary bilingual HTML `reportUrl` without follow-up interaction.
- Chinese and English are supported with `lang: zh`, `lang: en`, or automatic detection.
