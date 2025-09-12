/**
 * 状态管理器 - 负责系统状态的持久化和恢复
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

class StateManager extends EventEmitter {
    constructor() {
        super();
        this.stateDir = '.kiro/state';
        this.stateFile = path.join(this.stateDir, 'system-state.json');
        this.accountsFile = path.join(this.stateDir, 'accounts.json');
        this.statsFile = path.join(this.stateDir, 'execution-stats.json');
        
        // 自动保存间隔（5分钟）
        this.autoSaveInterval = 5 * 60 * 1000;
        this.autoSaveTimer = null;
        
        // 状态缓存
        this.stateCache = {
            accounts: new Map(),
            executionStats: {},
            systemConfig: {},
            lastSaved: null
        };
    }

    /**
     * 初始化状态管理器
     */
    async initialize() {
        try {
            console.log('🗄️ 初始化状态管理器...');
            
            // 确保状态目录存在
            await this.ensureStateDirectory();
            
            // 加载现有状态
            await this.loadState();
            
            // 启动自动保存
            this.startAutoSave();
            
            console.log('✅ 状态管理器初始化完成');
            
        } catch (error) {
            console.error('❌ 状态管理器初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 确保状态目录存在
     */
    async ensureStateDirectory() {
        try {
            await fs.access(this.stateDir);
        } catch (error) {
            // 目录不存在，创建它
            await fs.mkdir(this.stateDir, { recursive: true });
            console.log(`📁 创建状态目录: ${this.stateDir}`);
        }
    }

    /**
     * 加载系统状态
     */
    async loadState() {
        try {
            // 加载账户数据
            const accounts = await this.loadAccounts();
            console.log(`📥 加载了 ${accounts.size} 个账户`);
            
            // 加载执行统计
            const stats = await this.loadExecutionStats();
            console.log(`📊 加载执行统计: ${stats.totalExecutions || 0} 次执行`);
            
            // 更新缓存
            this.stateCache.accounts = accounts;
            this.stateCache.executionStats = stats;
            this.stateCache.lastSaved = Date.now();
            
            this.emit('stateLoaded', {
                accountsCount: accounts.size,
                stats
            });
            
        } catch (error) {
            console.warn('⚠️ 加载状态失败，使用默认状态:', error.message);
            this.initializeDefaultState();
        }
    }

    /**
     * 加载账户原始数据
     */
    async loadRawAccounts() {
        const data = await fs.readFile(this.accountsFile, 'utf8')
        const rawAccounts = JSON.parse(data);
        return rawAccounts
    }

    /**
     * 加载账户数据
     */
    async loadAccounts() {
        const accounts = new Map();
        
        try {
            const accountsData = await this.loadRawAccounts();
            
            for (const [accountId, accountData] of Object.entries(accountsData)) {
                // 恢复账户数据，但不包含敏感信息
                const account = {
                    ...accountData,
                    // 私钥需要重新从环境变量或配置中获取
                    privateKey: null,
                    wallet: null,
                    provider: null,
                    // 标记为需要重新初始化
                    needsReinitialization: true
                };
                
                accounts.set(accountId, account);
            }
            
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // 文件不存在是正常的
        }
        
        return accounts;
    }

    /**
     * 加载执行统计
     */
    async loadExecutionStats() {
        try {
            const data = await fs.readFile(this.statsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // 返回默认统计
            return {
                totalExecutions: 0,
                successfulExecutions: 0,
                failedExecutions: 0,
                lastExecutionTime: null,
                activeExecutions: 0,
                startTime: Date.now()
            };
        }
    }

    /**
     * 初始化默认状态
     */
    initializeDefaultState() {
        this.stateCache = {
            accounts: new Map(),
            executionStats: {
                totalExecutions: 0,
                successfulExecutions: 0,
                failedExecutions: 0,
                lastExecutionTime: null,
                activeExecutions: 0,
                startTime: Date.now()
            },
            systemConfig: {},
            lastSaved: null
        };
    }

    /**
     * 保存系统状态
     */
    async saveState() {
        try {
            console.log('💾 保存系统状态...');
            
            // 保存账户数据
            await this.saveAccounts();
            
            // 保存执行统计
            await this.saveExecutionStats();
            
            // 更新最后保存时间
            this.stateCache.lastSaved = Date.now();
            
            console.log('✅ 系统状态保存完成');
            this.emit('stateSaved');
            
        } catch (error) {
            console.error('❌ 保存状态失败:', error.message);
            this.emit('saveError', error);
            throw error;
        }
    }

    /**
     * 保存账户数据
     */
    async saveAccounts() {
        const accountsData = {};
        
        for (const [accountId, account] of this.stateCache.accounts.entries()) {
            // 保存账户数据，但排除敏感信息
            accountsData[accountId] = {
                id: account.id,
                name: account.name,
                walletAddress: account.walletAddress,
                balance: account.balance,
                maxRisk: account.maxRisk,
                strategies: account.strategies,
                isActive: account.isActive,
                createdAt: account.createdAt,
                lastBalanceUpdate: account.lastBalanceUpdate,
                // 不保存私钥、钱包实例等敏感信息
            };
        }
        
        await fs.writeFile(this.accountsFile, JSON.stringify(accountsData, null, 2));
    }

    /**
     * 保存执行统计
     */
    async saveExecutionStats() {
        await fs.writeFile(this.statsFile, JSON.stringify(this.stateCache.executionStats, null, 2));
    }

    /**
     * 添加账户到状态
     */
    async addAccount(accountId, accountData) {
        this.stateCache.accounts.set(accountId, accountData);
        
        // 立即保存
        await this.saveAccounts();

        this.emit('accountAdded', { accountId, accountData });
    }

    /**
     * 更新账户状态
     */
    async updateAccount(accountId, updates) {
        const account = this.stateCache.accounts.get(accountId);
        if (!account) {
            throw new Error(`账户不存在: ${accountId}`);
        }
        
        // 更新账户数据
        Object.assign(account, updates);
        
        // 立即保存
        await this.saveAccounts();
        
        console.log(`💾 账户 ${accountId} 状态已更新`);
        this.emit('accountUpdated', { accountId, updates });
    }

    /**
     * 移除账户
     */
    async removeAccount(accountId) {
        if (!this.stateCache.accounts.has(accountId)) {
            throw new Error(`账户不存在: ${accountId}`);
        }
        
        this.stateCache.accounts.delete(accountId);
        
        // 立即保存
        await this.saveAccounts();
        
        console.log(`💾 账户 ${accountId} 已从状态中移除`);
        this.emit('accountRemoved', { accountId });
    }

    /**
     * 更新执行统计
     */
    async updateExecutionStats(stats) {
        Object.assign(this.stateCache.executionStats, stats);
        
        // 每10次执行保存一次统计
        if (stats.totalExecutions && stats.totalExecutions % 10 === 0) {
            await this.saveExecutionStats();
        }
        
        this.emit('statsUpdated', stats);
    }

    /**
     * 获取账户状态
     */
    getAccounts() {
        return new Map(this.stateCache.accounts);
    }

    /**
     * 获取单个账户
     */
    getAccount(accountId) {
        return this.stateCache.accounts.get(accountId);
    }

    /**
     * 获取执行统计
     */
    getExecutionStats() {
        return { ...this.stateCache.executionStats };
    }

    /**
     * 启动自动保存
     */
    startAutoSave() {
        if (this.autoSaveTimer) {
            return;
        }
        
        this.autoSaveTimer = setInterval(async () => {
            try {
                await this.saveState();
            } catch (error) {
                console.error('❌ 自动保存失败:', error.message);
            }
        }, this.autoSaveInterval);
        
        console.log(`⏰ 自动保存已启动 (间隔: ${this.autoSaveInterval / 1000}秒)`);
    }

    /**
     * 停止自动保存
     */
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
            console.log('⏰ 自动保存已停止');
        }
    }

    /**
     * 获取状态摘要
     */
    getStateSummary() {
        return {
            accountsCount: this.stateCache.accounts.size,
            executionStats: this.stateCache.executionStats,
            lastSaved: this.stateCache.lastSaved,
            autoSaveEnabled: !!this.autoSaveTimer,
            stateFiles: {
                accounts: this.accountsFile,
                stats: this.statsFile
            }
        };
    }

    /**
     * 清理状态文件
     */
    async clearState() {
        try {
            await fs.unlink(this.accountsFile);
            await fs.unlink(this.statsFile);
            
            this.initializeDefaultState();
            
            console.log('🗑️ 状态文件已清理');
            this.emit('stateCleared');
            
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * 关闭状态管理器
     */
    async shutdown() {
        console.log('🛑 关闭状态管理器...');
        
        // 停止自动保存
        this.stopAutoSave();
        
        // 最后保存一次
        try {
            await this.saveState();
        } catch (error) {
            console.error('❌ 最终保存失败:', error.message);
        }
        
        console.log('✅ 状态管理器已关闭');
    }
}

export default StateManager;