#!/usr/bin/env node

/**
 * 账户管理命令行工具
 * 支持添加、删除、修改账户和策略分配
 */

import { program } from 'commander';
import StateManager from '../src/managers/state-manager.js';
import AccountManager from '../src/managers/account-manager.js';
import { StrategyType } from '../src/strategies/strategy-types.js';
import fs from 'fs/promises';
import path from 'path';

class AccountManagerCLI {
    constructor() {
        this.accountManager = null;
    }

    /**
     * 初始化系统
     */
    async initializeSystem() {
        if (!this.accountManager) {
            const stateManager = new StateManager();
            this.accountManager = new AccountManager(stateManager);
            await this.accountManager.loadAccountsFromState();
        }
        return this.accountManager;
    }

    /**
     * 添加账户
     */
    async addAccount(accountId, options) {
        try {
            await this.initializeSystem();

            // 验证必需参数
            if (!options.privateKey) {
                throw new Error('私钥是必需的参数 (--private-key)');
            }

            // 构建账户配置
            const accountConfig = {
                name: options.name || accountId,
                privateKey: options.privateKey,
                balance: parseFloat(options.balance) || 0,
                maxRisk: parseFloat(options.maxRisk) || 1000,
                strategies: options.strategies ? options.strategies.split(',').map(s => s.trim()) : [],
                isActive: options.active !== false // 默认激活
            };

            // 添加账户
            const account = await this.accountManager.addAccount(accountId, accountConfig);

            console.log('✅ 账户添加成功:');
            console.log(`   ID: ${accountId}`);
            console.log(`   名称: ${account.name}`);
            console.log(`   余额: ${account.balance} USDC`);
            console.log(`   最大风险: ${account.maxRisk} USDC`);
            console.log(`   策略: ${account.strategies.join(', ') || '无'}`);
            console.log(`   状态: ${account.isActive ? '激活' : '停用'}`);

            // 保存账户状态
            await this.saveAccountsState();

        } catch (error) {
            console.error('❌ 添加账户失败:', error.message);
            process.exit(1);
        } finally {
            process.exit(0);
        }
    }

    /**
     * 删除账户
     */
    async removeAccount(accountId, options) {
        try {
            await this.initializeSystem();

            // 检查账户是否存在
            const account = this.accountManager.getAccount(accountId);
            if (!account) {
                throw new Error(`账户不存在: ${accountId}`);
            }

            // 确认删除（除非使用 --force）
            if (!options.force) {
                console.log(`⚠️ 即将删除账户: ${accountId} (${account.name})`);
                console.log('   这将删除账户的所有数据和私钥');
                console.log('   使用 --force 参数跳过此确认');
                process.exit(1);
            }

            // 删除账户
            await this.accountManager.removeAccount(accountId);

            console.log('✅ 账户删除成功:');
            console.log(`   ID: ${accountId}`);
            console.log(`   名称: ${account.name}`);

            // 保存账户状态
            await this.saveAccountsState();

        } catch (error) {
            console.error('❌ 删除账户失败:', error.message);
            process.exit(1);
        } finally {
            process.exit(0);
        }
    }

    /**
     * 修改账户策略
     */
    async updateAccountStrategies(accountId, strategies, options) {
        try {
            await this.initializeSystem();

            // 检查账户是否存在
            const account = this.accountManager.getAccount(accountId);
            if (!account) {
                throw new Error(`账户不存在: ${accountId}`);
            }

            // 解析策略列表
            const strategyList = strategies.split(',').map(s => s.trim());

            // 验证策略类型
            const validStrategies = Object.values(StrategyType);
            for (const strategy of strategyList) {
                if (!validStrategies.includes(strategy)) {
                    throw new Error(`无效的策略类型: ${strategy}. 可用策略: ${validStrategies.join(', ')}`);
                }
            }

            // 更新策略分配 - 注意：assignStrategies 方法可能不存在，我们直接更新账户配置

            // 如果指定了替换模式，更新账户配置
            if (options.replace) {
                account.strategies = strategyList;
            } else {
                // 合并策略（去重）
                const mergedStrategies = [...new Set([...account.strategies, ...strategyList])];
                account.strategies = mergedStrategies;
            }

            console.log('✅ 账户策略更新成功:');
            console.log(`   账户: ${accountId} (${account.name})`);
            console.log(`   策略: ${account.strategies.join(', ')}`);

            // 保存账户状态
            await this.saveAccountsState();

        } catch (error) {
            console.error('❌ 更新账户策略失败:', error.message);
            await this.cleanup();
            process.exit(1);
        } finally {
            await this.cleanup();
            process.exit(0);
        }
    }

    /**
     * 激活账户
     */
    async activateAccount(accountId) {
        try {
            await this.initializeSystem();

            await this.accountManager.activateAccount(accountId);
            console.log(`✅ 账户 ${accountId} 已激活`);

            // 保存账户状态
            await this.saveAccountsState();

        } catch (error) {
            console.error('❌ 激活账户失败:', error.message);
            await this.cleanup();
            process.exit(1);
        } finally {
            await this.cleanup();
            process.exit(0);
        }
    }

    /**
     * 停用账户
     */
    async deactivateAccount(accountId) {
        try {
            await this.initializeSystem();

            await this.accountManager.deactivateAccount(accountId);
            console.log(`✅ 账户 ${accountId} 已停用`);

            // 保存账户状态
            await this.saveAccountsState();

        } catch (error) {
            console.error('❌ 停用账户失败:', error.message);
            await this.cleanup();
            process.exit(1);
        } finally {
            await this.cleanup();
            process.exit(0);
        }
    }

    /**
     * 列出所有账户
     */
    async listAccounts(options) {
        try {
            await this.initializeSystem();

            const accounts = this.accountManager.getAllAccounts();

            if (accounts.length === 0) {
                console.log('📝 暂无账户');
                return;
            }

            console.log(`📋 账户列表 (共 ${accounts.length} 个):`);
            console.log('='.repeat(80));

            for (let i = 0; i < accounts.length; i++) {
                const account = accounts[i];
                const statusEmoji = account.isActive ? '🟢' : '🔴';
                const statusText = account.isActive ? '激活' : '停用';

                console.log(`${i + 1}. ${account.name} (${account.id})`);
                console.log(`   状态: ${statusEmoji} ${statusText}`);

                // 获取钱包地址
                try {
                    const walletAddress = await this.accountManager.getAccountWalletAddress(account.id);
                    console.log(`   地址: ${walletAddress}`);
                } catch (error) {
                    console.log(`   地址: 获取失败 (${error.message})`);
                }

                console.log(`   余额: ${account.balance} USDC`);
                console.log(`   最大风险: ${account.maxRisk} USDC`);
                console.log(`   策略: ${account.strategies.join(', ') || '无'}`);

                // 显示详细信息
                if (options.detailed) {
                    const strategies = this.accountManager.getAccountStrategies(account.id);
                    console.log(`   运行策略数: ${strategies.length}`);
                    console.log(`   创建时间: ${new Date(account.createdAt).toLocaleString()}`);
                }

                if (i < accounts.length - 1) {
                    console.log('');
                }
            }

            console.log('='.repeat(80));

        } catch (error) {
            console.error('❌ 列出账户失败:', error.message);
            await this.cleanup();
            process.exit(1);
        } finally {
            await this.cleanup();
            process.exit(0);
        }
    }

    /**
     * 显示账户详情
     */
    async showAccount(accountId) {
        try {
            await this.initializeSystem();

            const account = this.accountManager.getAccount(accountId);
            if (!account) {
                throw new Error(`账户不存在: ${accountId}`);
            }

            console.log(`📋 账户详情: ${accountId}`);
            console.log('='.repeat(50));
            console.log(`名称: ${account.name}`);
            console.log(`ID: ${account.id}`);

            // 获取钱包地址
            try {
                const walletAddress = await this.accountManager.getAccountWalletAddress(account.id);
                console.log(`钱包地址: ${walletAddress}`);
            } catch (error) {
                console.log(`钱包地址: 获取失败 (${error.message})`);
            }

            console.log(`状态: ${account.isActive ? '🟢 激活' : '🔴 停用'}`);
            console.log(`余额: ${account.balance} USDC`);
            console.log(`最大风险: ${account.maxRisk} USDC`);
            console.log(`分配策略: ${account.strategies.join(', ') || '无'}`);

            // 运行中的策略
            const runningStrategies = this.accountManager.getAccountStrategies(account.id);
            console.log(`运行策略数: ${runningStrategies.length}`);

            if (runningStrategies.length > 0) {
                console.log('运行中的策略:');
                runningStrategies.forEach((strategy, index) => {
                    console.log(`  ${index + 1}. ${strategy.constructor.name}`);
                });
            }

            console.log(`创建时间: ${new Date(account.createdAt).toLocaleString()}`);

            if (account.lastBalanceUpdate) {
                console.log(`余额更新: ${new Date(account.lastBalanceUpdate).toLocaleString()}`);
            }

            console.log('='.repeat(50));

        } catch (error) {
            console.error('❌ 显示账户详情失败:', error.message);
            await this.cleanup();
            process.exit(1);
        } finally {
            await this.cleanup();
            process.exit(0);
        }
    }

    /**
     * 更新账户余额
     */
    async updateBalance(accountId, balance) {
        try {
            await this.initializeSystem();

            const newBalance = parseFloat(balance);
            if (isNaN(newBalance)) {
                throw new Error('余额必须是有效数字');
            }

            // 更新账户余额 - 直接修改账户对象
            const account = this.accountManager.getAccount(accountId);
            if (!account) {
                throw new Error(`账户不存在: ${accountId}`);
            }
            account.balance = newBalance;
            account.lastBalanceUpdate = new Date().toISOString();
            console.log(`✅ 账户 ${accountId} 余额已更新为 ${newBalance} USDC`);

            // 保存账户状态
            await this.saveAccountsState();

        } catch (error) {
            console.error('❌ 更新余额失败:', error.message);
            await this.cleanup();
            process.exit(1);
        } finally {
            await this.cleanup();
            process.exit(0);
        }
    }

    /**
     * 保存账户状态到文件
     */
    async saveAccountsState() {
        try {
            // 确保目录存在
            const stateDir = '.kiro/state';
            await fs.mkdir(stateDir, { recursive: true });

            // 获取所有账户（不包含敏感信息）
            const accounts = this.accountManager.getAllAccounts();
            const accountsForSave = {};

            for (const account of accounts) {
                accountsForSave[account.id] = {
                    id: account.id,
                    name: account.name,
                    balance: account.balance,
                    maxRisk: account.maxRisk,
                    strategies: account.strategies,
                    isActive: account.isActive,
                    createdAt: account.createdAt,
                    lastBalanceUpdate: account.lastBalanceUpdate
                };
            }

            // 保存到文件
            const accountsPath = path.join(stateDir, 'accounts.json');
            await fs.writeFile(accountsPath, JSON.stringify(accountsForSave, null, 2));

        } catch (error) {
            console.error('⚠️ 保存账户状态失败:', error.message);
        }
    }

    /**     
     * 清理资源并退出 
     */     
    async cleanup() {
        try {   
            // 关闭系统连接和监听器
            if (this.accountManager) {
                this.accountManager.removeAllListeners();
            }
        } catch (error) {
            console.error('⚠️ 清理资源时出错:', error.message);
        }   
    }       

    /**
     * 显示可用策略类型
     */
    async showAvailableStrategies() {
        try {
            console.log('📋 可用策略类型:');
            console.log('='.repeat(40));

            const strategies = Object.values(StrategyType);
            strategies.forEach((strategy, index) => {
                console.log(`${index + 1}. ${strategy}`);
            });

            console.log('='.repeat(40));
            console.log('使用这些策略名称来分配给账户');
        } finally {
            process.exit(0);
        }
    }
}

// 创建CLI实例
const cli = new AccountManagerCLI();

// 配置命令行程序
program
    .name('account-manager')
    .description('多策略交易系统账户管理工具')
    .version('1.0.0');

// 添加账户命令
program
    .command('add <accountId>')
    .description('添加新的交易账户')
    .requiredOption('-k, --private-key <key>', '账户私钥')
    .option('-n, --name <name>', '账户名称')
    .option('-b, --balance <amount>', '初始余额 (USDC)', '0')
    .option('-r, --max-risk <amount>', '最大风险金额 (USDC)', '1000')
    .option('-s, --strategies <strategies>', '分配的策略列表 (逗号分隔)')
    .option('--no-active', '创建时不激活账户')
    .action(async (accountId, options) => {
        await cli.addAccount(accountId, options);
    });

// 删除账户命令
program
    .command('remove <accountId>')
    .description('删除交易账户')
    .option('-f, --force', '强制删除，跳过确认')
    .action(async (accountId, options) => {
        await cli.removeAccount(accountId, options);
    });

// 更新账户策略命令
program
    .command('strategies <accountId> <strategies>')
    .description('更新账户的策略分配')
    .option('-r, --replace', '替换现有策略（默认为合并）')
    .action(async (accountId, strategies, options) => {
        await cli.updateAccountStrategies(accountId, strategies, options);
    });

// 激活账户命令
program
    .command('activate <accountId>')
    .description('激活账户')
    .action(async (accountId) => {
        await cli.activateAccount(accountId);
    });

// 停用账户命令
program
    .command('deactivate <accountId>')
    .description('停用账户')
    .action(async (accountId) => {
        await cli.deactivateAccount(accountId);
    });

// 列出账户命令
program
    .command('list')
    .description('列出所有账户')
    .option('-d, --detailed', '显示详细信息')
    .action(async (options) => {
        await cli.listAccounts(options);
    });

// 显示账户详情命令
program
    .command('show <accountId>')
    .description('显示账户详细信息')
    .action(async (accountId) => {
        await cli.showAccount(accountId);
    });

// 更新余额命令
program
    .command('balance <accountId> <amount>')
    .description('更新账户余额')
    .action(async (accountId, amount) => {
        await cli.updateBalance(accountId, amount);
    });

// 显示可用策略命令
program
    .command('strategies-list')
    .description('显示所有可用的策略类型')
    .action(async () => {
        await cli.showAvailableStrategies();
    });

// 解析命令行参数
program.parse();
