# 安全账户系统

## 概述

多策略交易系统现在使用分离的安全存储架构，将敏感的私钥信息与账户状态信息分开存储，提高系统的安全性。

## 架构设计

### 文件结构

```
.kiro/
├── secure/
│   └── keys.enc          # 加密的私钥文件
└── state/
    └── accounts.json     # 账户状态文件（不含私钥）
```

### 安全特性

1. **私钥加密存储**: 使用 AES-256-CBC 加密算法保护私钥
2. **状态分离**: 账户状态与私钥分开存储
3. **主密钥保护**: 使用 PBKDF2 从主密钥源派生加密密钥
4. **内存安全**: 私钥仅在需要时从加密存储中读取

## 组件说明

### KeyManager (密钥管理器)

负责私钥的加密存储和安全访问：

- **加密**: 使用 AES-256-CBC 算法加密私钥数据
- **解密**: 安全地解密并返回私钥
- **验证**: 验证私钥格式的有效性
- **管理**: 添加、删除、更新私钥

### AccountManager (账户管理器)

管理账户状态和私钥的协调：

- **分离存储**: 账户状态存储到 JSON 文件，私钥存储到加密文件
- **安全加载**: 从两个文件中重建完整的账户信息
- **运行时管理**: 在内存中维护钱包实例，但不持久化敏感信息

## 使用方法

### 初始化安全账户系统

```bash
# 运行设置工具来创建安全的账户存储
node tools/setup-secure-accounts.js
```

### 添加新账户

```javascript
import MultiStrategyMain from './src/multi-strategy-main.js';

const system = new MultiStrategyMain();
await system.initialize();

// 添加新账户
await system.addAccount('new_account', {
    name: '新账户',
    privateKey: '0x...',  // 64位十六进制私钥
    maxRisk: 1000,
    strategies: ['LPMaking']
});
```

### 账户操作

```javascript
// 获取账户信息
const account = system.getAccount('account1');

// 激活/停用账户
await system.activateAccount('account1');
await system.deactivateAccount('account1');

// 获取所有账户
const accounts = system.getAllAccounts();
```

## 安全最佳实践

### 主密钥管理

1. **环境变量**: 在生产环境中使用环境变量设置主密钥
   ```bash
   export MASTER_KEY="your_secure_master_key_here"
   ```

2. **密钥轮换**: 定期更换主密钥并重新加密私钥文件

3. **访问控制**: 限制对 `.kiro/secure/` 目录的访问权限
   ```bash
   chmod 700 .kiro/secure/
   chmod 600 .kiro/secure/keys.enc
   ```

### 文件权限

```bash
# 设置安全的文件权限
chmod 700 .kiro/secure/           # 仅所有者可访问
chmod 600 .kiro/secure/keys.enc   # 仅所有者可读写
chmod 644 .kiro/state/accounts.json  # 所有者读写，其他只读
```

### 备份策略

1. **分离备份**: 私钥文件和状态文件分别备份
2. **加密备份**: 备份文件也应该加密存储
3. **多地备份**: 在不同位置存储备份副本

## 故障排除

### 常见问题

1. **私钥文件损坏**
   - 从备份恢复 `keys.enc` 文件
   - 重新运行 `setup-secure-accounts.js`

2. **主密钥丢失**
   - 如果有备份的未加密私钥，重新运行设置工具
   - 否则需要重新生成账户

3. **权限问题**
   - 检查文件和目录权限
   - 确保运行用户有适当的访问权限

### 调试模式

```javascript
// 启用调试日志
process.env.DEBUG = 'key-manager,account-manager';
```

## 迁移指南

### 从旧系统迁移

如果你有包含私钥的旧 `accounts.json` 文件：

1. 备份原文件
2. 运行迁移工具：
   ```bash
   node tools/setup-secure-accounts.js
   ```
3. 验证新系统正常工作
4. 安全删除包含私钥的旧文件

### 验证迁移

```bash
# 测试账户加载
node examples/test-account-loading.js

# 运行完整系统测试
timeout 10s node src/multi-strategy-main.js
```

## API 参考

### KeyManager

```javascript
const keyManager = new KeyManager();
await keyManager.initialize();

// 保存私钥
await keyManager.addAccountKey('account1', '0x...');

// 获取私钥
const privateKey = await keyManager.getAccountKey('account1');

// 删除私钥
await keyManager.removeAccountKey('account1');
```

### AccountManager

```javascript
const accountManager = new AccountManager();
await accountManager.initialize();

// 从状态文件加载账户
await accountManager.loadAccountsFromState(accountsData);

// 删除账户（包括私钥）
await accountManager.removeAccount('account1');
```

## 安全注意事项

⚠️ **重要提醒**:

1. **永远不要**将私钥提交到版本控制系统
2. **永远不要**在日志中输出私钥
3. **定期备份**加密的私钥文件
4. **使用强密码**作为主密钥
5. **限制文件访问权限**
6. **在生产环境中使用环境变量**设置主密钥

## 更新日志

- **v1.0.0**: 初始版本，支持 AES-256-CBC 加密
- **v1.1.0**: 添加私钥格式验证
- **v1.2.0**: 支持账户批量加载和管理