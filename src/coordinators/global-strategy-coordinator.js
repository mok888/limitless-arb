/**
 * 全局策略协调器
 * 负责全局性任务的单例执行和结果分发
 */

import EventEmitter from 'events';
import { StrategyType } from '../strategies/strategy-types.js';
import StrategyLevelCoordinator from './strategy-level-coordinator.js';

export class GlobalStrategyCoordinator extends EventEmitter {
    constructor() {
        super();

        // 服务组件
        this.marketDiscovery = null;
        this.strategyDispatcher = null;

        // 策略级协调器 - 管理策略级仓位上限和账户轮换
        this.strategyLevelCoordinator = new StrategyLevelCoordinator();

        // 策略订阅者管理 strategyType -> Set<subscriber>
        this.strategySubscribers = new Map();

        // 正在运行的全局策略
        this.runningStrategies = new Set();

        // 定时器管理
        this.strategyTimers = new Map();

        // 统一发现定时器
        this.unifiedDiscoveryTimer = null;
        this.unifiedDiscoveryInterval = 60000; // 1分钟

        // 统计信息
        this.stats = {
            totalOpportunitiesFound: 0,
            totalOpportunitiesDispatched: 0,
            activeSubscribers: 0,
            runningStrategiesCount: 0
        };

        this.isRunning = false;
    }

    /**
     * 设置服务组件
     */
    setServices(marketDiscovery, strategyDispatcher) {
        this.marketDiscovery = marketDiscovery;
        this.strategyDispatcher = strategyDispatcher;
        
        // 设置策略级协调器的事件监听
        this.setupStrategyLevelCoordinatorEvents();
    }
    
    /**
     * 设置策略级协调器事件监听
     */
    setupStrategyLevelCoordinatorEvents() {
        this.strategyLevelCoordinator.on('strategyPositionOpened', (event) => {
            console.log(`📊 [策略级] ${event.strategyType} 新增仓位，当前总数: ${event.currentPositions}`);
        });
        
        this.strategyLevelCoordinator.on('strategyPositionClosed', (event) => {
            console.log(`📊 [策略级] ${event.strategyType} 结算仓位，当前总数: ${event.currentPositions}`);
        });
        
        this.strategyLevelCoordinator.on('executorRegistered', (event) => {
            console.log(`📝 [策略级] 注册账户执行器: ${event.accountId}`);
        });
    }

    /**
     * 启动协调器
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️ 全局策略协调器已在运行');
            return;
        }

        console.log('🚀 启动全局策略协调器...');

        // 验证必需的服务组件
        if (!this.marketDiscovery || !this.strategyDispatcher) {
            throw new Error('缺少必需的服务组件');
        }

        this.isRunning = true;

        // 启动已注册的策略
        for (const strategyType of this.strategySubscribers.keys()) {
            if (this.strategySubscribers.get(strategyType).size > 0) {
                await this.startGlobalStrategy(strategyType);
            }
        }

        // 启动统一发现定时器
        this.startUnifiedDiscoveryTimer();

        console.log('✅ 全局策略协调器启动完成');
        this.emit('started');
    }

    /**
     * 停止协调器
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('🛑 停止全局策略协调器...');

        // 停止统一发现定时器
        if (this.unifiedDiscoveryTimer) {
            clearInterval(this.unifiedDiscoveryTimer);
            this.unifiedDiscoveryTimer = null;
            console.log('⏹️ 停止统一发现定时器');
        }

        // 停止所有定时器
        for (const [strategyType, timer] of this.strategyTimers.entries()) {
            clearInterval(timer);
            console.log(`⏹️ 停止策略定时器: ${strategyType}`);
        }

        this.strategyTimers.clear();
        this.runningStrategies.clear();
        this.isRunning = false;

        console.log('✅ 全局策略协调器已停止');
        this.emit('stopped');
    }

    /**
     * 注册策略订阅者
     */
    async registerStrategySubscriber(strategyType, strategyExecutor, config) {
        const accountId = strategyExecutor.accountId;
        console.log(`📝 注册策略订阅者: ${strategyType} -> ${accountId}`);

        if (!this.strategySubscribers.has(strategyType)) {
            this.strategySubscribers.set(strategyType, new Set());
        }

        // 创建订阅者对象，包含策略执行器实例
        const subscriber = {
            accountId,
            config,
            strategyExecutor, // 保存策略执行器实例
            registeredAt: Date.now(),
            lastActive: Date.now(),
            // 为了向后兼容，添加 processMarketsForStrategy 方法
            processMarketsForStrategy: async (strategyType, allMarkets) => {
                return await strategyExecutor.processMarketsForStrategy(strategyType, allMarkets);
            }
        };

        this.strategySubscribers.get(strategyType).add(subscriber);
        this.updateStats();

        // 注册到策略级协调器
        this.strategyLevelCoordinator.registerAccountExecutor(accountId, strategyExecutor);
        
        // 设置策略级配置（如果有策略级配置的话）
        if (config.maxConcurrentPositions !== undefined) {
            this.strategyLevelCoordinator.setStrategyConfig(strategyType, {
                maxConcurrentPositions: config.maxConcurrentPositions,
                ...config
            });
        }

        // 如果是第一个订阅者且协调器正在运行，启动全局策略
        if (this.strategySubscribers.get(strategyType).size === 1 && this.isRunning) {
            await this.startGlobalStrategy(strategyType);
        }

        this.emit('subscriberRegistered', { strategyType, accountId, config });
    }

    /**
     * 取消注册策略订阅者
     */
    async unregisterStrategySubscriber(strategyType, accountId) {
        console.log(`📝 取消注册策略订阅者: ${strategyType} -> ${accountId}`);

        const subscribers = this.strategySubscribers.get(strategyType);
        if (!subscribers) {
            return;
        }

        // 查找并移除订阅者
        for (const subscriber of subscribers) {
            if (subscriber.accountId === accountId) {
                subscribers.delete(subscriber);
                break;
            }
        }

        // 从策略级协调器取消注册
        this.strategyLevelCoordinator.unregisterAccountExecutor(accountId);

        // 如果没有订阅者了，停止全局策略
        if (subscribers.size === 0) {
            await this.stopGlobalStrategy(strategyType);
        }

        this.updateStats();
        this.emit('subscriberUnregistered', { strategyType, accountId });
    }

    /**
     * 启动全局策略
     */
    async startGlobalStrategy(strategyType) {
        if (this.runningStrategies.has(strategyType)) {
            console.log(`⚠️ 全局策略已在运行: ${strategyType}`);
            return;
        }

        console.log(`🚀 启动全局策略: ${strategyType}`);
        this.runningStrategies.add(strategyType);

        try {
            switch (strategyType) {
                case StrategyType.HOURLY_ARBITRAGE:
                    await this.startHourlyArbitrageDiscovery();
                    break;

                case StrategyType.NEW_MARKET:
                    await this.startNewMarketDiscovery();
                    break;

                case StrategyType.LP_MAKING:
                    await this.startLPMakingDiscovery();
                    break;

                default:
                    console.warn(`⚠️ 未知的策略类型: ${strategyType}`);
                    this.runningStrategies.delete(strategyType);
                    return;
            }

            this.updateStats();
            this.emit('strategyStarted', { strategyType });

        } catch (error) {
            console.error(`❌ 启动全局策略失败 ${strategyType}:`, error);
            this.runningStrategies.delete(strategyType);
            throw error;
        }
    }

    /**
     * 停止全局策略
     */
    async stopGlobalStrategy(strategyType) {
        if (!this.runningStrategies.has(strategyType)) {
            return;
        }

        console.log(`🛑 停止全局策略: ${strategyType}`);

        // 从活跃策略中移除
        this.runningStrategies.delete(strategyType);

        // 停止独立定时器（如果存在）
        const timer = this.strategyTimers.get(strategyType);
        if (timer) {
            clearInterval(timer);
            this.strategyTimers.delete(strategyType);
        }

        // 如果没有活跃策略了，停止统一发现定时器
        if (this.runningStrategies.size === 0) {
            this.stopUnifiedDiscoveryTimer();
        }

        this.updateStats();

        this.emit('strategyStopped', { strategyType });
    }

    /**
     * 一次性获取市场数据，然后分发给各个策略执行器
     */
    async marketDiscovery() {
        console.log('🔍 执行统一策略发现...');

        try {
            // 获取所有活跃的策略类型
            const activeStrategies = Array.from(this.runningStrategies);

            if (activeStrategies.length === 0) {
                console.log('📊 没有活跃的策略需要执行');
                return;
            }

            console.log(`📊 执行 ${activeStrategies.length} 个活跃策略: ${activeStrategies.join(', ')}`);

            // 1. 一次性获取所有市场数据
            const allMarkets = await this.marketDiscovery.getMarkets();

            if (!allMarkets || allMarkets.length === 0) {
                console.log('⚠️ 未获取到任何市场数据');
                return;
            }

            console.log(`📊 获取到 ${allMarkets.length} 个市场`);

        } catch (error) {
            console.error('❌ 统一策略发现失败:', error.message);
            this.emit('discoveryError', {
                strategyType: 'UNIFIED',
                error: error
            });
        }
    }

    /**
     * 启动统一发现定时器
     * 使用单一定时器执行所有活跃策略的发现，避免重复API调用
     */
    startUnifiedDiscoveryTimer() {
        if (this.unifiedDiscoveryTimer) {
            console.log('⚠️ 统一发现定时器已在运行');
            return;
        }

        console.log(`🔄 启动统一发现定时器 (间隔: ${this.unifiedDiscoveryInterval}ms)`);

        // 立即执行一次
        this.executeUnifiedDiscovery().catch(error => {
            console.error('❌ 统一发现初始执行失败:', error.message);
        });

        // 设置定期执行
        this.unifiedDiscoveryTimer = setInterval(async () => {
            try {
                await this.executeUnifiedDiscovery();
            } catch (error) {
                console.error('❌ 统一发现定时执行失败:', error.message);
                this.emit('discoveryError', {
                    strategyType: 'UNIFIED',
                    error: error
                });
            }
        }, this.unifiedDiscoveryInterval);

        console.log('✅ 统一发现定时器启动完成');
    }

    /**
     * 停止统一发现定时器
     */
    stopUnifiedDiscoveryTimer() {
        if (this.unifiedDiscoveryTimer) {
            clearInterval(this.unifiedDiscoveryTimer);
            this.unifiedDiscoveryTimer = null;
            console.log('⏹️ 统一发现定时器已停止');
        }
    }
}

export default GlobalStrategyCoordinator;