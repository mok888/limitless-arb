# 状态管理和动态账户管理指南

## 概述

多策略交易系统现在支持状态持久化和动态账户管理，解决了以下问题：

1. **程序重启后状态丢失** - 现在所有账户信息和执行统计都会自动保存
2. **无法动态添加账户** - 现在可以在程序运行时添加、修改、删除账户

## 核心功能

### 1. 状态持久化

#### 自动保存
- 系统每5分钟自动保存状态
- 账户变更时立即保存
- 程序关闭时最终保存

#### 保存内容
- 账户配置信息（不包含私钥）
- 账户余额和状态
- 执行统计数据
- 策略配置

#### 存储位置
```
.kiro/state/
├── accounts.json      # 账户数据
├── execution-stats.json # 执行统计
└── system-state.json  # 系统状态
```

### 2. 动态账户管理

#### CLI命令
```bash
# 查看所有账户
accounts

# 添加新账户
add-account

# 进入账户管理界面
manage-accounts

# 激活/停用账户
activate-account <id>
deactivate-account <id>

# 移除账户
remove-account <id>

# 查看状态管理信息
state
```

#### 账户管理界面
进入 `manage-accounts` 后可以：
- 查看账户详细信息
- 添加新账户（包括私钥配置）
- 修改账户配置
- 导出账户配置
- 安全删除账户

## 使用方法

### 启动系统

```bash
# 启动多策略系统
npm run start

# 或直接运行
node src/multi-strategy-main.js
```

### 基本操作流程

1. **首次启动**
   ```
   🤖 MultiStrategy> start
   🤖 MultiStrategy> accounts
   ```

2. **添加新账户**
   ```
   🤖 MultiStrategy> manage-accounts
   # 选择 "2. 添加新账户"
   # 按提示输入账户信息
   ```

3. **查看状态**
   ```
   🤖 MultiStrategy> status
   🤖 MultiStrategy> state
   ```

4. **安全退出**
   ```
   🤖 MultiStrategy> exit
   ```

### 账户配置示例

#### 通过CLI添加账户
```
账户ID: trading-bot-1
账户名称: 主交易机器人
私钥: 0x1234... (安全输入，不显示)
最大风险金额: 1000
策略选择: 1,2 (NewMarketSplit + LPMaking)
```

#### 通过配置文件
```javascript
{
  "accounts": [
    {
      "id": "account1",
      "name": "主账户",
      "privateKey": "从环境变量获取",
      "maxRisk": 1000,
      "strategies": ["NewMarketSplit", "LPMaking"],
      "strategyConfigs": [...]
    }
  ]
}
```

## 状态恢复机制

### 程序重启时
1. 自动加载已保存的账户
2. 恢复执行统计
3. 重新初始化策略实例
4. 继续之前的执行状态

### 私钥处理
- 私钥不会保存到状态文件中
- 重启后需要重新配置私钥
- 支持从环境变量自动获取

### 数据完整性
- 状态文件损坏时使用默认状态
- 账户数据验证和错误恢复
- 自动备份重要状态

## 安全考虑

### 私钥安全
```bash
# 推荐使用环境变量
export AUTH_PRIVATE_KEY="0x..."
export AUTH_PRIVATE_KEY_2="0x..."

# 或使用 .env 文件（不会被读取到状态中）
AUTH_PRIVATE_KEY=0x...
AUTH_PRIVATE_KEY_2=0x...
```

### 状态文件安全
- 状态文件不包含私钥
- 建议定期备份状态目录
- 可以安全地版本控制状态文件

### 访问控制
- 状态目录权限控制
- 敏感操作需要确认
- 账户删除需要双重确认

## 高级功能

### 状态管理API

```javascript
import StateManager from './src/core/state-manager.js';

const stateManager = new StateManager();
await stateManager.initialize();

// 添加账户
await stateManager.addAccount('new-account', accountData);

// 更新账户
await stateManager.updateAccount('account-id', { balance: 2000 });

// 获取账户
const account = stateManager.getAccount('account-id');

// 保存状态
await stateManager.saveState();
```

### 批量操作

```javascript
// 批量添加账户
const accounts = [...];
for (const account of accounts) {
    await executionEngine.addAccount(account);
}

// 批量激活账户
const accountIds = ['account1', 'account2'];
for (const id of accountIds) {
    await accountManager.activateAccount(id);
}
```

### 状态监控

```javascript
// 监听状态事件
stateManager.on('stateSaved', () => {
    console.log('状态已保存');
});

stateManager.on('accountAdded', (data) => {
    console.log(`账户已添加: ${data.accountId}`);
});
```

## 故障排除

### 常见问题

1. **状态文件损坏**
   ```bash
   # 清理状态文件
   rm -rf .kiro/state/
   # 重新启动系统
   ```

2. **账户无法恢复**
   ```bash
   # 检查状态文件
   cat .kiro/state/accounts.json
   # 重新配置私钥
   ```

3. **自动保存失败**
   ```bash
   # 检查目录权限
   ls -la .kiro/state/
   # 手动保存
   🤖 MultiStrategy> state
   ```

### 调试模式

```bash
# 运行状态持久化测试
node tools/test-state-persistence.js

# 演示状态持久化
node tools/test-state-persistence.js demo
```

### 日志分析

```bash
# 查看状态管理日志
grep "状态管理" logs/system.log

# 查看账户操作日志
grep "账户" logs/system.log
```

## 最佳实践

### 1. 账户管理
- 使用描述性的账户ID和名称
- 合理设置风险限制
- 定期检查账户状态

### 2. 状态维护
- 定期备份状态目录
- 监控状态文件大小
- 清理过期数据

### 3. 安全操作
- 私钥使用环境变量
- 重要操作前备份
- 测试环境验证配置

### 4. 性能优化
- 避免频繁的状态更新
- 批量操作减少I/O
- 监控内存使用

## 示例场景

### 场景1: 添加新的交易账户
```bash
1. 启动系统: npm run start
2. 进入CLI: start
3. 添加账户: manage-accounts -> 2
4. 配置策略和风险限制
5. 激活账户开始交易
6. 系统自动保存状态
```

### 场景2: 系统维护重启
```bash
1. 停止系统: stop
2. 退出CLI: exit
3. 系统维护...
4. 重新启动: npm run start
5. 自动恢复所有账户和状态
6. 继续交易执行
```

### 场景3: 紧急停用账户
```bash
1. 查看账户: accounts
2. 停用账户: deactivate-account risky-account
3. 状态立即保存
4. 该账户停止所有交易活动
```

这个状态管理系统确保了你的多策略交易系统具有企业级的可靠性和可维护性！