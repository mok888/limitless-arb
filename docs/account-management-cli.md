# 账户管理命令行工具

这个工具提供了完整的账户管理功能，支持添加、删除、修改账户和策略分配，使用命令+参数的方式，无需交互式操作。

## 安装和使用

### 快速开始

```bash
# 使用 npm script (推荐)
npm run account <command> [options]

# 或直接运行
node tools/account-manager-cli.js <command> [options]
```

## 可用命令

### 1. 添加账户

```bash
# 基本用法
npm run account add <accountId> --private-key <privateKey>

# 完整配置
npm run account add account1 \
  --private-key "0x1234567890abcdef..." \
  --name "主交易账户" \
  --balance 1000 \
  --max-risk 500 \
  --strategies "HOURLY_ARBITRAGE,LP_MAKING"
```

**参数说明：**
- `<accountId>`: 账户唯一标识符（必需）
- `--private-key, -k`: 账户私钥（必需）
- `--name, -n`: 账户名称（可选，默认为 accountId）
- `--balance, -b`: 初始余额 USDC（可选，默认 0）
- `--max-risk, -r`: 最大风险金额 USDC（可选，默认 1000）
- `--strategies, -s`: 分配的策略列表，逗号分隔（可选）
- `--no-active`: 创建时不激活账户（可选）

### 2. 删除账户

```bash
# 删除账户（需要确认）
npm run account remove <accountId>

# 强制删除（跳过确认）
npm run account remove <accountId> --force
```

**参数说明：**
- `<accountId>`: 要删除的账户ID（必需）
- `--force, -f`: 强制删除，跳过确认（可选）

### 3. 更新账户策略

```bash
# 添加策略到现有策略列表
npm run account strategies <accountId> "NEW_MARKET,LP_MAKING"

# 替换所有策略
npm run account strategies <accountId> "HOURLY_ARBITRAGE" --replace
```

**参数说明：**
- `<accountId>`: 账户ID（必需）
- `<strategies>`: 策略列表，逗号分隔（必需）
- `--replace, -r`: 替换现有策略而不是合并（可选）

### 4. 激活/停用账户

```bash
# 激活账户
npm run account activate <accountId>

# 停用账户
npm run account deactivate <accountId>
```

### 5. 列出账户

```bash
# 列出所有账户
npm run account list

# 显示详细信息
npm run account list --detailed
```

### 6. 显示账户详情

```bash
# 显示特定账户的详细信息
npm run account show <accountId>
```

### 7. 更新账户余额

```bash
# 更新账户余额
npm run account balance <accountId> <amount>

# 示例
npm run account balance account1 1500.50
```

### 8. 查看可用策略

```bash
# 显示所有可用的策略类型
npm run account strategies-list
```

## 可用策略类型

当前支持的策略类型：

- `HOURLY_ARBITRAGE`: 小时套利策略
- `LP_MAKING`: LP做市策略  
- `NEW_MARKET`: 新市场策略

## 使用示例

### 完整的账户管理流程

```bash
# 1. 查看可用策略
npm run account strategies-list

# 2. 添加新账户
npm run account add trader1 \
  --private-key "0x1234567890abcdef..." \
  --name "主交易账户" \
  --balance 2000 \
  --max-risk 800 \
  --strategies "HOURLY_ARBITRAGE,LP_MAKING"

# 3. 查看账户列表
npm run account list --detailed

# 4. 查看特定账户详情
npm run account show trader1

# 5. 更新账户策略（添加新策略）
npm run account strategies trader1 "NEW_MARKET"

# 6. 更新账户余额
npm run account balance trader1 2500

# 7. 临时停用账户
npm run account deactivate trader1

# 8. 重新激活账户
npm run account activate trader1

# 9. 删除账户（需要确认）
npm run account remove trader1 --force
```

### 批量操作示例

```bash
# 添加多个账户
npm run account add account1 --private-key "0x111..." --strategies "HOURLY_ARBITRAGE"
npm run account add account2 --private-key "0x222..." --strategies "LP_MAKING"  
npm run account add account3 --private-key "0x333..." --strategies "NEW_MARKET"

# 查看所有账户
npm run account list

# 为所有账户添加相同策略
npm run account strategies account1 "LP_MAKING"
npm run account strategies account2 "HOURLY_ARBITRAGE"
npm run account strategies account3 "HOURLY_ARBITRAGE,LP_MAKING"
```

## 安全注意事项

1. **私钥保护**: 私钥会被加密存储在 `.kiro/keys/` 目录中
2. **账户状态**: 账户配置（不含私钥）存储在 `.kiro/state/accounts.json` 中
3. **备份重要**: 定期备份 `.kiro/` 目录以防数据丢失
4. **权限控制**: 确保只有授权用户能访问这些文件

## 错误处理

工具会提供清晰的错误信息：

```bash
# 私钥格式错误
❌ 添加账户失败: 账户 account1 私钥格式无效

# 账户不存在
❌ 删除账户失败: 账户不存在: nonexistent

# 策略类型无效
❌ 更新账户策略失败: 无效的策略类型: INVALID_STRATEGY. 可用策略: HOURLY_ARBITRAGE, LP_MAKING, NEW_MARKET

# 余额格式错误
❌ 更新余额失败: 余额必须是有效数字
```

## 文件结构

账户管理工具会创建以下文件结构：

```
.kiro/
├── keys/                    # 加密的私钥存储
│   ├── account1.key
│   └── account2.key
└── state/
    └── accounts.json        # 账户状态（不含私钥）
```

## 集成到主系统

账户管理工具与主交易系统完全集成：

1. 添加的账户会自动在系统启动时加载
2. 策略分配会影响账户的交易行为
3. 账户状态变更会实时反映在运行中的系统

## 故障排除

### 常见问题

1. **系统未初始化**: 确保先运行过主系统或账户管理命令
2. **私钥丢失**: 检查 `.kiro/keys/` 目录中的密钥文件
3. **权限问题**: 确保有读写 `.kiro/` 目录的权限
4. **策略冲突**: 检查策略类型是否正确拼写

### 调试模式

如需调试，可以直接运行工具文件：

```bash
node tools/account-manager-cli.js --help
```

这个工具提供了完整的账户管理功能，支持所有必要的操作，并且设计为非交互式，适合脚本化和自动化使用。