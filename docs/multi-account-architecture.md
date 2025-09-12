# 多账户架构设计

## 概述

本系统采用多账户架构，支持同时管理多个独立的交易账户。每个账户都有自己的私钥、钱包地址和API客户端实例，实现完全独立的交易操作。

## 核心设计原则

### 1. 私钥为核心
- **每个账户必须有独立的私钥**
- **钱包地址从私钥自动派生**，不需要单独配置
- 私钥是账户的唯一身份标识

### 2. 完全隔离
- 每个账户有独立的API客户端实例
- 独立的认证状态和会话管理
- 独立的风险管理和余额跟踪

### 3. 安全优先
- 私钥在状态报告中自动隐藏
- 不在日志中暴露敏感信息
- 支持独立的风险限制设置

## 架构组件

### 1. AccountManager (账户管理器)
负责管理所有交易账户的生命周期和配置。

**主要功能:**
- 添加/删除账户
- 账户状态管理（激活/停用）
- 从私钥派生钱包地址
- 风险限制检查
- 策略分配管理

**关键方法:**
```javascript
// 添加账户
await accountManager.addAccount(accountId, {
    privateKey: 'your_private_key_here',
    name: '账户名称',
    maxRisk: 1000
});

// 获取钱包地址（从私钥派生）
const address = await accountManager.getAccountWalletAddress(accountId);

// 获取私钥（用于签名）
const privateKey = accountManager.getAccountPrivateKey(accountId);
```

### 2. MultiAccountClientFactory (多账户客户端工厂)
为每个账户创建和管理独立的API客户端实例。

**主要功能:**
- 创建账户专用的API客户端
- 批量钱包初始化
- 批量账户登录
- 客户端状态管理

**关键方法:**
```javascript
// 创建客户端
const client = clientFactory.createClient(accountId, accountConfig);

// 批量初始化钱包
const results = await clientFactory.initializeAllWallets();

// 批量登录
const loginResults = await clientFactory.loginAllAccounts();
```

### 3. LimitlessApiClient (API客户端)
每个账户的独立API客户端实例，支持账户特定的配置。

**主要改进:**
- 构造函数接受账户配置
- 使用账户专用的私钥进行签名
- 独立的认证状态管理

## 配置结构

### 账户配置示例
```javascript
const accountConfig = {
    id: 'account_1',                    // 账户唯一标识
    name: '主交易账户',                  // 账户名称
    privateKey: 'your_private_key_here', // 私钥（必需）
    initialBalance: 1000,               // 初始余额
    maxRisk: 500,                       // 最大风险金额
    strategies: ['arbitrage']           // 分配的策略
};
```

### 环境变量变更
```bash
# 旧版本（单账户）
AUTH_PRIVATE_KEY=your_private_key_here

# 新版本（多账户）
# 不再使用单一私钥环境变量
# 每个账户的私钥通过账户配置单独管理
```

## 使用流程

### 1. 基本设置
```javascript
import AccountManager from './src/managers/account-manager.js';
import MultiAccountClientFactory from './src/core/multi-account-client-factory.js';

// 创建管理器实例
const accountManager = new AccountManager();
const clientFactory = new MultiAccountClientFactory();
```

### 2. 添加账户
```javascript
// 添加多个账户
const accounts = [
    {
        id: 'account_1',
        privateKey: 'private_key_1',
        name: '主账户',
        maxRisk: 1000
    },
    {
        id: 'account_2', 
        privateKey: 'private_key_2',
        name: '套利账户',
        maxRisk: 500
    }
];

for (const config of accounts) {
    await accountManager.addAccount(config.id, config);
    clientFactory.createClient(config.id, config);
}
```

### 3. 初始化和登录
```javascript
// 批量初始化钱包
await clientFactory.initializeAllWallets();

// 批量登录
await clientFactory.loginAllAccounts();
```

### 4. 使用特定账户
```javascript
// 获取特定账户的客户端
const client = clientFactory.getClient('account_1');

// 使用该客户端进行交易
await client.placeOrder({
    // 订单参数
    confirmRealOrder: true
});
```

## 安全特性

### 1. 私钥保护
- 私钥只在内存中存储
- 状态报告中自动隐藏私钥
- 不在日志中输出私钥信息

### 2. 风险管理
- 每个账户独立的风险限制
- 交易前自动风险检查
- 支持账户级别的风险监控

### 3. 访问控制
- 每个账户独立的认证状态
- 会话隔离，防止交叉访问
- 支持账户级别的权限管理

## 迁移指南

### 从单账户迁移到多账户

1. **更新环境变量**
   ```bash
   # 移除
   AUTH_PRIVATE_KEY=your_private_key_here
   
   # 保留其他配置
   API_BASE_URL=https://api.limitless.exchange
   RPC_URL=https://mainnet.base.org
   ```

2. **更新代码**
   ```javascript
   // 旧版本
   const client = new LimitlessApiClient();
   
   // 新版本
   const accountManager = new AccountManager();
   const clientFactory = new MultiAccountClientFactory();
   
   await accountManager.addAccount('main', {
       privateKey: 'your_private_key_here'
   });
   
   const client = clientFactory.createClient('main', {
       privateKey: 'your_private_key_here'
   });
   ```

3. **更新策略代码**
   - 策略现在接收特定账户的客户端实例
   - 支持为不同账户分配不同策略
   - 策略可以访问账户特定的配置

## 最佳实践

### 1. 账户命名
- 使用描述性的账户ID：`main_trading`, `arbitrage_bot`, `market_maker`
- 为每个账户设置清晰的名称和用途

### 2. 风险管理
- 为每个账户设置合理的风险限制
- 定期监控账户余额和风险暴露
- 使用不同账户分散风险

### 3. 策略分配
- 根据账户特点分配合适的策略
- 避免在同一账户上运行冲突的策略
- 定期评估策略效果和账户表现

### 4. 监控和日志
- 定期检查账户状态和客户端连接
- 监控每个账户的交易活动
- 保持详细的操作日志

## 故障排除

### 常见问题

1. **钱包地址不匹配**
   - 检查私钥是否正确
   - 确认私钥格式（应以0x开头）

2. **认证失败**
   - 检查每个账户的私钥配置
   - 确认网络连接正常

3. **风险检查失败**
   - 检查账户的maxRisk设置
   - 确认交易金额在限制范围内

### 调试工具

```javascript
// 获取账户摘要
const summary = await accountManager.getAccountsSummary();
console.log(summary);

// 获取工厂状态
const status = await clientFactory.getFactoryStatus();
console.log(status);

// 获取详细状态报告
const detailed = await accountManager.getDetailedStatus();
console.log(detailed);
```

## 总结

多账户架构提供了更好的灵活性、安全性和可扩展性。通过将私钥作为核心身份标识，系统能够自动管理钱包地址派生和独立的交易操作，同时保持强大的安全性和风险管理能力。