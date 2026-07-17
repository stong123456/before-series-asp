# Example Cards

These are representative `cardText` outputs. Runtime metadata such as `requestId` and `requestHash` is omitted.

## Before Ape

```text
【Before Ape 冲前检查卡】

风险等级：中高

一句话结论：
当前最值得注意的是：参与过程涉及连接钱包、签名、授权或合约交互，存在资产权限风险。

主要红旗：
1. 参与过程涉及连接钱包、签名、授权或合约交互，存在资产权限风险。
2. 空投或未来权益被强调，但获取条件或发放规则不够清楚。
3. 使用限时表达，容易压缩正常核验时间。

信息缺口：
1. 未提供可核对的官方链接或域名。
2. 未提供可核对的合约地址、链和代币信息。
3. 团队身份、历史项目和责任主体不明确。

冲之前最该查的三件事：
1. 从项目官方账号找到官网，不使用群聊私链或搜索广告入口。
2. 确认链、官方合约地址、代理状态和管理员权限。
3. 在签名前核对调用方法、授权对象、额度、金额和撤销路径。

更稳妥的动作：使用与主要资产隔离的小额测试钱包，签名前检查授权范围，交互后复查并撤销不再需要的授权。
```

## Before Sign

```text
[Before Sign Pre-Sign Check Card]

Interaction type: Approval
Risk level: High

What this may do:
The closest visible interaction type is Approval. This may be an unlimited token allowance, allowing the spender to keep using the approved token later.

What to watch:
1. This may be an unlimited token allowance.
2. Permit2 may create token allowance through a signature.
3. The spender, token, allowance, and expiry require verification.

Primary-wallet reminder: Do not use a primary wallet yet. Cancel, complete verification, and use a low-value isolated wallet if interaction remains necessary.

What cannot be determined:
1. The supplied text cannot verify site authenticity.
2. Contract verification, proxy status, and administrator privileges are unknown.
3. No transaction simulation is available to confirm final asset changes or failure paths.
```

## Before Shill

```text
【Before Shill 发布前检查卡】

整体评分：4/10

最大问题：存在确定收益、保本或无风险暗示，容易被理解为收益承诺。

发布风险：高。原文同时包含收益承诺、FOMO 和较强营销话术。

修改方向：
1. 删除收益承诺和行动指令，改成事实、使用场景与待核验风险。
2. 减少抽象营销词，用具体功能、步骤或亲身体验替代通稿口吻。
3. 如属合作内容，增加清晰披露和风险边界。

优化后版本：
这是一个需要自行核验的项目，实际结果存在不确定性，参与前请核验信息和风险。项目今天开放体验。
```
