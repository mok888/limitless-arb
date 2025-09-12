/**
 * 执行引擎 - 协调多账户多策略的执行
 */

import { EventEmitter } from 'events';
import AccountManager from '../managers/account-manager.js';
import StateManager from './state-manager.js';
import { NewMarketSplitStrategy, LPMakingStrategy, HourlyArbitrageStrategy } from '../strategies/multi-strategy-system.js';

class ExecutionEngine extends EventEmitter {
    constructor(apiClient) {
        super();
        this.apiClient = apiClient;
        this.stateManager = new StateManager();
        this.accountManager = new AccountManager(this.stateManager);
        this.isRunning = false;
        this.executionTimer = null;
        
        // 策略工厂
        this.strategyFactories = {
            'NewMarketSplit': (apiClient, config) => new NewMarketSplitStrategy(apiClient, config),
            'LPMaking': (apiClient, config) => new LPMakingStrategy(apiClient, config),
            'HourlyArbitrage': (apiClient, config) => new HourlyArbitrageStrategy(apiClient, config)
        };

        // 执行配置
        this.config = {
            executionInterval: 60000, // 1分钟执行间隔
            maxConcurrentExecutions: 10, // 最大并发执行数
            riskCheckInterval: 300000, // 5分钟风险检查间隔
        };

        // 执行状态
        this.executionStats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            lastExecutionTime: null,
            activeExecutions: 0
        };

        // 设置账户管理器事件监听
        this.setupAccountManagerListeners();
    }

    /**
     * 从状态恢复账户
     */
    async restoreAccountsFromState() {
        const savedAccounts = this.stateManager.getAccounts();
        
        if (savedAccounts.size === 0) {
            console.log('📭 没有找到已保存的账户');
            return;
        }

        console.log(`🔄 恢复 ${savedAccounts.size} 个已保存的账户...`);
        
        for (const [accountId, accountData] of savedAccounts.entries()) {
            try {
                // 恢复账户但需要重新初始化钱包
                if (accountData.needsReinitialization) {
                    console.log(`⚠️ 账户 ${accountId} 需要重新配置私钥`);
                    // 这里可以提示用户重新输入私钥，或从环境变量获取
                    continue;
                }
                
                // 直接添加到账户管理器（不保存到状态，因为已经存在）
                this.accountManager.accounts.set(accountId, accountData);
                this.accountManager.accountStrategies.set(accountId, []);
                
                console.log(`✅ 恢复账户: ${accountId} (${accountData.name})`);
                
            } catch (error) {
                console.error(`❌ 恢复账户失败 (${accountId}): ${error.message}`);
            }
        }
    }

    /**
     * 设置状态管理器事件监听
     */
    setupStateManagerListeners() {
        this.stateManager.on('stateLoaded', (data) => {
            console.log(`📥 状态已加载: ${data.accountsCount} 个账户`);
        });

        this.stateManager.on('stateSaved', () => {
            console.log('💾 系统状态已保存');
        });

        this.stateManager.on('saveError', (error) => {
            console.error('❌ 状态保存失败:', error.message);
        });
    }

    /**
     * 设置账户管理器事件监听
     */
    setupAccountManagerListeners() {
        this.accountManager.on('accountStrategyEvent', (event) => {
            console.log(`📢 账户策略事件 [${event.accountName}/${event.strategyName}]: ${event.eventType}`);
            
            // 根据事件类型进行不同处理
            switch (event.eventType) {
                case 'splitCompleted':
                    console.log(`   ✅ Split完成: 市场 ${event.data.market.title.substring(0, 40)}...`);
                    break;
                case 'purchaseCompleted':
                    console.log(`   💰 购买完成: ${event.data.opportunity.side.toUpperCase()} ${event.data.opportunity.amount} @ ${event.data.opportunity.price.toFixed(4)}`);
                    break;
                case 'lpMakingStarted':
                    console.log(`   📊 LP做市启动: 订单ID ${event.data.limitOrderId}`);
                    break;
                case 'orderAdjustedForProfit':
                    console.log(`   🎯 订单调整止盈: 新价格 ${event.data.newPrice.toFixed(4)}`);
                    break;
                case 'error':
                    console.log(`   ❌ 策略错误: ${event.data.error?.message || '未知错误'}`);
                    break;
            }
            
            // 转发事件
            this.emit('strategyEvent', event);
        });
    }

    /**
     * 初始化执行引擎
     * @param {Object} configuration - 系统配置
     */
    async initialize(configuration) {
        try {
            console.log('🚀 初始化执行引擎...');
            
            // 初始化状态管理器
            await this.stateManager.initialize();
            
            // 恢复已保存的账户
            await this.restoreAccountsFromState();
            
            // 添加新账户（如果配置中有新账户）
            for (const accountConfig of configuration.accounts) {
                if (!this.accountManager.getAccount(accountConfig.id)) {
                    await this.accountManager.addAccount(accountConfig.id, accountConfig);
                }
            }

            // 为每个账户创建和分配策略
            for (const accountConfig of configuration.accounts) {
                await this.setupAccountStrategies(accountConfig);
            }

            // 设置状态管理器事件监听
            this.setupStateManagerListeners();

            console.log('✅ 执行引擎初始化完成');
            
            // 显示配置摘要
            this.printConfigurationSummary();

        } catch (error) {
            console.error('❌ 执行引擎初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 为账户设置策略
     */
    async setupAccountStrategies(accountConfig) {
        const { id: accountId, strategies: strategyConfigs } = accountConfig;
        
        console.log(`🎯 为账户 ${accountId} 设置策略...`);
        
        for (const strategyConfig of strategyConfigs) {
            const { type, config = {} } = strategyConfig;
            
            if (!this.strategyFactories[type]) {
                console.warn(`⚠️ 未知策略类型: ${type}`);
                continue;
            }

            try {
                // 创建策略实例
                const strategyInstance = this.strategyFactories[type](this.apiClient, config);
                
                // 为策略设置账户特定的配置
                await this.configureStrategyForAccount(strategyInstance, accountId);
                
                // 添加到账户管理器
                this.accountManager.addStrategyInstance(accountId, strategyInstance);
                
                console.log(`   ✅ 策略 ${type} 已添加到账户 ${accountId}`);
                
            } catch (error) {
                console.error(`   ❌ 创建策略失败 (${type}): ${error.message}`);
            }
        }
    }

    /**
     * 为账户配置策略
     */
    async configureStrategyForAccount(strategy, accountId) {
        const account = this.accountManager.getAccount(accountId);
        if (!account) {
            throw new Error(`账户不存在: ${accountId}`);
        }

        // 为策略设置账户特定的钱包和配置
        if (strategy.positionManager) {
            // 为PositionManager设置账户的私钥
            strategy.positionManager.wallet = account.wallet;
            strategy.positionManager.provider = account.provider;
        }

        // 设置策略的风险限制
        if (strategy.config) {
            strategy.config.maxRisk = account.maxRisk;
            strategy.config.accountId = accountId;
        }
    }

    /**
     * 启动执行引擎
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️ 执行引擎已在运行中');
            return;
        }

        console.log('🚀 启动执行引擎...');
        this.isRunning = true;

        // 初始化所有策略
        await this.initializeAllStrategies();

        // 启动定期执行
        this.executionTimer = setInterval(() => {
            this.executeStrategies().catch(error => {
                console.error('❌ 策略执行失败:', error.message);
                this.executionStats.failedExecutions++;
            });
        }, this.config.executionInterval);

        // 立即执行一次
        await this.executeStrategies();

        console.log('✅ 执行引擎已启动');
        this.emit('engineStarted');
    }

    /**
     * 初始化所有策略
     */
    async initializeAllStrategies() {
        console.log('🔧 初始化所有策略...');
        
        for (const [accountId, strategies] of this.accountManager.accountStrategies.entries()) {
            console.log(`   初始化账户 ${accountId} 的 ${strategies.length} 个策略`);
            
            for (const strategy of strategies) {
                try {
                    if (typeof strategy.initialize === 'function') {
                        await strategy.initialize();
                    }
                } catch (error) {
                    console.error(`❌ 策略初始化失败 (账户: ${accountId}): ${error.message}`);
                }
            }
        }
        
        console.log('✅ 所有策略初始化完成');
    }

    /**
     * 执行所有策略
     */
    async executeStrategies() {
        if (this.executionStats.activeExecutions >= this.config.maxConcurrentExecutions) {
            console.log('⏳ 达到最大并发执行限制，跳过本次执行');
            return;
        }

        this.executionStats.activeExecutions++;
        this.executionStats.totalExecutions++;
        this.executionStats.lastExecutionTime = Date.now();

        try {
            console.log(`🔄 开始执行策略 (第 ${this.executionStats.totalExecutions} 次)`);
            
            const activeAccounts = this.accountManager.getActiveAccounts();
            const executionPromises = [];

            // 为每个活跃账户执行策略
            for (const account of activeAccounts) {
                const strategies = this.accountManager.getAccountStrategies(account.id);
                
                for (const strategy of strategies) {
                    // 检查账户风险限制
                    try {
                        this.accountManager.checkRiskLimit(account.id, 100); // 假设每次执行风险100
                        
                        // 执行策略
                        const executionPromise = this.executeStrategy(account.id, strategy);
                        executionPromises.push(executionPromise);
                        
                    } catch (error) {
                        console.warn(`⚠️ 账户 ${account.id} 风险检查失败: ${error.message}`);
                    }
                }
            }

            // 等待所有策略执行完成
            const results = await Promise.allSettled(executionPromises);
            
            // 统计执行结果
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            this.executionStats.successfulExecutions += successful;
            this.executionStats.failedExecutions += failed;
            
            // 更新状态管理器中的执行统计
            await this.stateManager.updateExecutionStats(this.executionStats);
            
            console.log(`✅ 策略执行完成: 成功 ${successful}, 失败 ${failed}`);

        } catch (error) {
            console.error('❌ 策略执行过程出错:', error.message);
            this.executionStats.failedExecutions++;
            await this.stateManager.updateExecutionStats(this.executionStats);
        } finally {
            this.executionStats.activeExecutions--;
        }
    }

    /**
     * 执行单个策略
     */
    async executeStrategy(accountId, strategy) {
        try {
            // 根据策略类型执行不同的逻辑
            if (strategy instanceof LPMakingStrategy) {
                await strategy.executeStrategy();
            } else if (strategy instanceof NewMarketSplitStrategy) {
                // NewMarketSplitStrategy 是事件驱动的，不需要主动执行
                // 它会通过市场发现服务自动触发
            }
            
        } catch (error) {
            console.error(`❌ 策略执行失败 (账户: ${accountId}, 策略: ${strategy.constructor.name}): ${error.message}`);
            throw error;
        }
    }

    /**
     * 停止执行引擎
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('🛑 停止执行引擎...');
        this.isRunning = false;

        // 停止定时器
        if (this.executionTimer) {
            clearInterval(this.executionTimer);
            this.executionTimer = null;
        }

        // 停止所有策略
        await this.accountManager.stopAllAccountStrategies();

        // 关闭状态管理器
        await this.stateManager.shutdown();

        console.log('✅ 执行引擎已停止');
        this.emit('engineStopped');
    }

    /**
     * 获取执行状态
     */
    getStatus() {
        const accountsSummary = this.accountManager.getAccountsSummary();
        
        return {
            isRunning: this.isRunning,
            config: this.config,
            executionStats: this.executionStats,
            accounts: accountsSummary,
            timestamp: Date.now()
        };
    }

    /**
     * 获取详细状态报告
     */
    getDetailedStatus() {
        return {
            engine: this.getStatus(),
            accounts: this.accountManager.getDetailedStatus(),
            timestamp: Date.now()
        };
    }

    /**
     * 打印配置摘要
     */
    printConfigurationSummary() {
        console.log('\n📋 执行引擎配置摘要:');
        console.log('=' .repeat(50));
        
        const summary = this.accountManager.getAccountsSummary();
        console.log(`总账户数: ${summary.totalAccounts}`);
        console.log(`活跃账户: ${summary.activeAccounts}`);
        console.log(`总策略数: ${summary.totalStrategies}`);
        
        console.log('\n账户详情:');
        for (const account of summary.accounts) {
            console.log(`  ${account.id} (${account.name})`);
            console.log(`    地址: ${account.address}`);
            console.log(`    状态: ${account.isActive ? '✅ 活跃' : '⏸️ 停用'}`);
            console.log(`    策略: ${account.strategies.join(', ')}`);
            console.log(`    策略实例: ${account.strategiesCount} 个`);
        }
        
        console.log('=' .repeat(50));
    }

    /**
     * 添加新账户（运行时）
     */
    async addAccount(accountConfig) {
        const account = await this.accountManager.addAccount(accountConfig.id, accountConfig);
        
        // 如果引擎正在运行，立即设置策略
        if (this.isRunning) {
            await this.setupAccountStrategies(accountConfig);
            
            // 初始化新策略
            const strategies = this.accountManager.getAccountStrategies(accountConfig.id);
            for (const strategy of strategies) {
                try {
                    if (typeof strategy.initialize === 'function') {
                        await strategy.initialize();
                    }
                } catch (error) {
                    console.error(`❌ 新策略初始化失败: ${error.message}`);
                }
            }
        }
        
        return account;
    }

    /**
     * 移除账户（运行时）
     */
    async removeAccount(accountId) {
        // 停止账户的所有策略
        const strategies = this.accountManager.getAccountStrategies(accountId);
        for (const strategy of strategies) {
            try {
                if (typeof strategy.stop === 'function') {
                    await strategy.stop();
                }
            } catch (error) {
                console.error(`❌ 停止策略失败: ${error.message}`);
            }
        }
        
        // 从账户管理器中移除
        this.accountManager.accounts.delete(accountId);
        this.accountManager.accountStrategies.delete(accountId);
        
        console.log(`✅ 账户 ${accountId} 已移除`);
        this.emit('accountRemoved', { accountId });
    }
}

export default ExecutionEngine;