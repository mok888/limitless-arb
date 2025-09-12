/**
 * 账户管理器 - 管理多个交易账户和策略分配
 */

import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { config } from '../core/config.js';
import KeyManager from './key-manager.js';
import LimitlessApiClient from '../core/api-client.js';

class AccountManager extends EventEmitter {
    constructor(stateManager) {
        super();
        this.accounts = new Map(); // 账户ID -> 账户配置
        this.accountStrategies = new Map(); // 账户ID -> 策略实例列表
        this.accountClients = new Map(); // 账户ID -> API客户端
        this.stateManager = stateManager;
        this.keyManager = new KeyManager(); // 密钥管理器
        this.initialized = false;
    }

    /**
     * 初始化账户管理器
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            console.log('🔧 初始化账户管理器...');
            
            // 初始化密钥管理器
            await this.keyManager.initialize();
            
            this.initialized = true;
            console.log('✅ 账户管理器初始化完成');
        } catch (error) {
            console.error('❌ 账户管理器初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 添加交易账户
     * @param {string} accountId - 账户标识符
     * @param {Object} accountConfig - 账户配置
     */
    async addAccount(accountId, accountConfig) {
        try {
            console.log(`👤 添加交易账户: ${accountId}`);
            
            // 确保账户管理器已初始化
            if (!this.initialized) {
                await this.initialize();
            }

            // 验证私钥
            if (!accountConfig.privateKey) {
                throw new Error(`账户 ${accountId} 缺少私钥`);
            }

            if (!this.keyManager.validatePrivateKey(accountConfig.privateKey)) {
                throw new Error(`账户 ${accountId} 私钥格式无效`);
            }

            // 创建钱包实例并从私钥派生地址
            const provider = new ethers.JsonRpcProvider(config.RPC_URL);
            const wallet = new ethers.Wallet(accountConfig.privateKey, provider);
            const walletAddress = await wallet.getAddress();

            // 存储账户配置（不包含私钥）
            const account = {
                id: accountId,
                name: accountConfig.name || accountId,
                balance: accountConfig.balance || accountConfig.initialBalance || 0,
                maxRisk: accountConfig.maxRisk || 1000, // 最大风险金额
                strategies: accountConfig.strategies || [], // 分配的策略列表
                isActive: accountConfig.isActive !== undefined ? accountConfig.isActive : true,
                createdAt: accountConfig.createdAt || Date.now(),
                wallet: wallet,
                provider: provider
            };

            this.accounts.set(accountId, account);
            this.accountStrategies.set(accountId, accountConfig.strategies);

            // 分别保存私钥和账户状态
            await this.keyManager.addAccountKey(accountId, accountConfig.privateKey);

            // 保存账户状态到状态管理器（不包含敏感信息）
            if (this.stateManager) {
                const accountForState = {
                    ...account,
                    wallet: undefined,     // 不保存钱包实例
                    provider: undefined    // 不保存provider实例
                };
                await this.stateManager.addAccount(accountId, accountForState);
            }

            console.log(`✅ 账户添加成功:`);
            console.log(`   ID: ${accountId}`);
            console.log(`   钱包地址: ${walletAddress}`);
            console.log(`   策略: ${account.strategies.join(', ')}`);
            console.log(`   最大风险: ${account.maxRisk} USDC`);

            this.emit('accountAdded', { accountId, account });
            return account;

        } catch (error) {
            console.error(`❌ 添加账户失败 (${accountId}): ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取账户信息
     * @param {string} accountId - 账户ID
     */
    getAccount(accountId) {
        return this.accounts.get(accountId);
    }

    /**
     * 获取所有账户
     */
    getAllAccounts() {
        return Array.from(this.accounts.values());
    }

    /**
     * 获取账户的策略实例
     * @param {string} accountId - 账户ID
     */
    getAccountStrategies(accountId) {
        return this.accountStrategies.get(accountId) || [];
    }

    /**
     * 激活账户
     * @param {string} accountId - 账户ID
     */
    async activateAccount(accountId) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`账户不存在: ${accountId}`);
        }

        account.isActive = true;
        
        // 更新状态管理器
        if (this.stateManager) {
            await this.stateManager.updateAccount(accountId, { isActive: true });
        }
        
        console.log(`✅ 账户 ${accountId} 已激活`);
        this.emit('accountActivated', { accountId });
    }

    /**
     * 停用账户
     * @param {string} accountId - 账户ID
     */
    async deactivateAccount(accountId) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`账户不存在: ${accountId}`);
        }

        account.isActive = false;
        
        // 更新状态管理器
        if (this.stateManager) {
            await this.stateManager.updateAccount(accountId, { isActive: false });
        }
        
        console.log(`⏸️ 账户 ${accountId} 已停用`);
        this.emit('accountDeactivated', { accountId });
    }

    /**
     * 获取活跃账户列表
     */
    getActiveAccounts() {
        return Array.from(this.accounts.values()).filter(account => account.isActive);
    }

    /**
     * 获取账户状态摘要
     */
    async getAccountsSummary() {
        const accounts = Array.from(this.accounts.values());
        
        // 异步获取所有账户的钱包地址
        const accountsWithAddresses = await Promise.all(
            accounts.map(async (account) => {
                const address = await this.getAccountWalletAddress(account.id);
                return {
                    id: account.id,
                    name: account.name,
                    address: address,
                    isActive: account.isActive,
                    strategies: account.strategies,
                    strategiesCount: this.accountStrategies.get(account.id)?.length || 0
                };
            })
        );
        
        return {
            totalAccounts: accounts.length,
            activeAccounts: accounts.filter(a => a.isActive).length,
            inactiveAccounts: accounts.filter(a => !a.isActive).length,
            totalStrategies: Array.from(this.accountStrategies.values())
                .reduce((sum, strategies) => sum + strategies.length, 0),
            accounts: accountsWithAddresses
        };
    }

    /**
     * 更新账户余额
     * @param {string} accountId - 账户ID
     * @param {number} balance - 新余额
     */
    async updateAccountBalance(accountId, balance) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`账户不存在: ${accountId}`);
        }

        const oldBalance = account.balance;
        account.balance = balance;
        account.lastBalanceUpdate = Date.now();

        // 更新状态管理器
        if (this.stateManager) {
            await this.stateManager.updateAccount(accountId, { 
                balance: balance,
                lastBalanceUpdate: account.lastBalanceUpdate
            });
        }

        this.emit('balanceUpdated', {
            accountId,
            oldBalance,
            newBalance: balance,
            change: balance - oldBalance
        });
    }

    /**
     * 检查账户风险限制
     * @param {string} accountId - 账户ID
     * @param {number} riskAmount - 风险金额
     */
    checkRiskLimit(accountId, riskAmount) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`账户不存在: ${accountId}`);
        }

        if (riskAmount > account.maxRisk) {
            throw new Error(`超出账户风险限制: ${riskAmount} > ${account.maxRisk}`);
        }

        return true;
    }

    /**
     * 获取账户的钱包地址（从私钥派生）
     * @param {string} accountId - 账户ID
     */
    async getAccountWalletAddress(accountId) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`账户不存在: ${accountId}`);
        }

        return await account.wallet.getAddress();
    }

    /**
     * 获取账户的钱包实例
     * @param {string} accountId - 账户ID
     */
    getAccountWallet(accountId) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`账户不存在: ${accountId}`);
        }

        return account.wallet;
    }

    /**
     * 获取账户的私钥
     * @param {string} accountId - 账户ID
     */
    async getAccountPrivateKey(accountId) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`账户不存在: ${accountId}`);
        }

        // 从加密存储中获取私钥
        return await this.keyManager.getAccountKey(accountId);
    }

    /**
     * 从状态文件加载账户（不包含私钥）
     */
    async loadAccountsFromState() {
        try {
            // 确保账户管理器已初始化
            if (!this.initialized) {
                await this.initialize();
            }

            let loadedCount = 0;
            const accountsData = await this.stateManager.loadRawAccounts()
            for (const [accountId, accountData] of Object.entries(accountsData)) {
                try {
                    // 从密钥管理器获取私钥
                    const privateKey = await this.keyManager.getAccountKey(accountId);
                    
                    if (!privateKey) {
                        console.warn(`⚠️ 账户 ${accountId} 的私钥未找到，跳过加载`);
                        continue;
                    }

                    // 创建钱包实例
                    const provider = new ethers.JsonRpcProvider(config.RPC_URL);
                    const wallet = new ethers.Wallet(privateKey, provider);

                    // 存储账户配置
                    const account = {
                        ...accountData,
                        wallet: wallet,
                        provider: provider,
                    };

                    if (!this.accounts.get(accountId) || this.accounts.get(accountId).wallet.privateKey != account.wallet.privateKey) {
                        account.apiClient = new LimitlessApiClient({ id: accountId, privateKey });
                        await account.apiClient.performLogin();
                    } else {
                        account.apiClient = this.accounts.get(accountId).apiClient;
                    }

                    this.accounts.set(accountId, account);
                    this.accountStrategies.set(accountId, []);

                    // 同步到状态管理器
                    if (this.stateManager) {
                        const accountForState = {
                            ...account,
                            wallet: undefined,      // 不保存钱包实例
                            provider: undefined,    // 不保存provider实例
                            apiClient: undefined,   // 不保存apiClient实例
                        };
                        await this.stateManager.addAccount(accountId, accountForState);
                    }

                    loadedCount++;

                } catch (error) {
                    console.error(`❌ 加载账户 ${accountId} 失败: ${error.message}`);
                }
            }

            return loadedCount;

        } catch (error) {
            console.error('❌ 从状态文件加载账户失败:', error.message);
            throw error;
        }
    }

    /**
     * 删除账户（同时删除私钥和状态）
     */
    async removeAccount(accountId) {
        try {
            const account = this.accounts.get(accountId);
            if (!account) {
                throw new Error(`账户不存在: ${accountId}`);
            }

            // 停止账户的所有策略
            const strategies = this.accountStrategies.get(accountId) || [];
            for (const strategy of strategies) {
                try {
                    if (typeof strategy.stop === 'function') {
                        await strategy.stop();
                    }
                } catch (error) {
                    console.error(`❌ 停止策略失败: ${error.message}`);
                }
            }

            // 从内存中移除
            this.accounts.delete(accountId);
            this.accountStrategies.delete(accountId);

            // 从密钥管理器中删除私钥
            await this.keyManager.removeAccountKey(accountId);

            // 从状态管理器中删除
            if (this.stateManager) {
                await this.stateManager.removeAccount(accountId);
            }

            console.log(`✅ 账户 ${accountId} 已完全删除`);
            this.emit('accountRemoved', { accountId });

        } catch (error) {
            console.error(`❌ 删除账户 ${accountId} 失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取详细状态报告
     */
    async getDetailedStatus() {
        const summary = await this.getAccountsSummary();
        const detailedAccounts = [];

        for (const account of this.accounts.values()) {
            const strategies = this.accountStrategies.get(account.id) || [];
            const strategyStatuses = strategies.map(strategy => {
                try {
                    return {
                        name: strategy.constructor.name,
                        status: strategy.getStatus ? strategy.getStatus() : 'unknown'
                    };
                } catch (error) {
                    return {
                        name: strategy.constructor.name,
                        status: 'error',
                        error: error.message
                    };
                }
            });

            // 获取钱包地址
            const walletAddress = await this.getAccountWalletAddress(account.id);

            detailedAccounts.push({
                ...account,
                walletAddress: walletAddress, // 动态获取的钱包地址
                privateKey: '***', // 隐藏私钥
                wallet: undefined, // 移除钱包对象
                provider: undefined, // 移除provider对象
                strategyStatuses
            });
        }

        return {
            summary,
            accounts: detailedAccounts,
            timestamp: Date.now()
        };
    }
}

export default AccountManager;