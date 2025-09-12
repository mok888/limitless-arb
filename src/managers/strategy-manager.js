/**
 * 策略管理器
 * 统一管理所有交易策略的生命周期和配置
 */

import { EventEmitter } from 'events';
import { validateConfigs, printConfigSummary, generalStrategyConfig } from '../config/strategy-config.js';
import LPMakingStrategy from '../strategies/lp-making.js';
import HourlyArbitrageStrategy from '../strategies/hourly-arbitrage.js';
import PriceArbitrageStrategy from '../strategies/price-arbitrage.js';

export class StrategyManager extends EventEmitter {
    constructor() {
        super();

        this.strategies = new Map();
        this.isRunning = false;
        this.startTime = null;
        
        // 统计信息
        this.stats = {
            totalExecutions: 0,
            totalErrors: 0,
            totalProfit: 0,
            activeStrategies: 0
        };
        
        // 风险管理
        this.riskManager = {
            dailyLoss: 0,
            dailyLossResetTime: Date.now(),
            executionCount: 0,
            executionResetTime: Date.now()
        };
    }
    
    /**
     * 初始化策略管理器
     */
    async initialize() {
        console.log('🔧 初始化策略管理器...');
        
        // 验证配置
        const configErrors = validateConfigs();
        if (configErrors.length > 0) {
            throw new Error(`配置验证失败: ${configErrors.join(', ')}`);
        }
        
        // 打印配置摘要
        printConfigSummary();
        
        // 检查策略是否启用
        if (!generalStrategyConfig.strategiesEnabled) {
            console.log('⚠️ 策略功能已禁用');
            return;
        }
        
        // 初始化策略实例
        await this.initializeStrategies();
        
        console.log('✅ 策略管理器初始化完成');
    }
    
    /**
     * 初始化所有策略
     */
    async initializeStrategies() {
        console.log('📋 初始化策略实例...');
        
        // 初始化LP做市策略
        try {
            const lpStrategy = new LPMakingStrategy();
            await lpStrategy.initialize();
            this.strategies.set('lpMaking', lpStrategy);
            
            // 监听策略事件
            this.setupStrategyEventListeners(lpStrategy, 'LP做市');
            
            console.log('✅ LP做市策略初始化完成');
        } catch (error) {
            console.error('❌ LP做市策略初始化失败:', error.message);
        }
        
        // 初始化每小时套利策略
        try {
            const hourlyArbitrageStrategy = new HourlyArbitrageStrategy();
            await hourlyArbitrageStrategy.initialize();
            this.strategies.set('hourlyArbitrage', hourlyArbitrageStrategy);
            
            // 监听策略事件
            this.setupStrategyEventListeners(hourlyArbitrageStrategy, '每小时套利');
            
            console.log('✅ 每小时套利策略初始化完成');
        } catch (error) {
            console.error('❌ 每小时套利策略初始化失败:', error.message);
        }

        // 初始化价格套利策略
        try {
            const priceArbitrageStrategy = new PriceArbitrageStrategy();
            await priceArbitrageStrategy.initialize();
            this.strategies.set('priceArbitrage', priceArbitrageStrategy);

            // 监听策略事件
            this.setupStrategyEventListeners(priceArbitrageStrategy, '价格套利');
        } catch (error) {
            console.error('❌ 价格套利策略初始化失败:', error.message);
        }
        
        console.log(`📊 共初始化 ${this.strategies.size} 个策略`);
    }
    
    /**
     * 设置策略事件监听器
     */
    setupStrategyEventListeners(strategy, strategyName) {
        strategy.on('executed', (result) => {
            this.stats.totalExecutions++;
            console.log(`📈 [${strategyName}] 执行完成:`, result.action);
            this.emit('strategyExecuted', { strategy: strategyName, result });
        });
        
        strategy.on('error', ({ message, error }) => {
            this.stats.totalErrors++;
            console.error(`❌ [${strategyName}] ${message}:`, error.message);
            this.emit('strategyError', { strategy: strategyName, message, error });
        });
        
        strategy.on('stateChanged', ({ oldState, newState }) => {
            console.log(`🔄 [${strategyName}] 状态变更: ${oldState} → ${newState}`);
            this.updateActiveStrategiesCount();
            this.emit('strategyStateChanged', { strategy: strategyName, oldState, newState });
        });
    }
    
    /**
     * 启动所有策略
     */
    async startAll() {
        if (this.isRunning) {
            console.log('⚠️ 策略管理器已在运行中');
            return;
        }
        
        if (!generalStrategyConfig.strategiesEnabled) {
            console.log('⚠️ 策略功能已禁用，无法启动');
            return;
        }
        
        console.log('🚀 启动所有策略...');
        this.isRunning = true;
        this.startTime = Date.now();
        
        // 重置风险管理计数器
        this.resetRiskCounters();
        
        const startPromises = [];
        
        for (const [name, strategy] of this.strategies) {
            if (strategy.config.enabled) {
                startPromises.push(
                    strategy.start().catch(error => {
                        console.error(`❌ 启动策略 ${name} 失败:`, error.message);
                    })
                );
            } else {
                console.log(`⚠️ 策略 ${name} 已禁用，跳过启动`);
            }
        }
        
        await Promise.all(startPromises);
        
        this.updateActiveStrategiesCount();
        console.log(`✅ 策略管理器启动完成，活跃策略: ${this.stats.activeStrategies}`);
        
        // 设置风险管理定时器
        this.setupRiskManagement();
        
        this.emit('started');
    }
    
    /**
     * 停止所有策略
     */
    async stopAll() {
        if (!this.isRunning) {
            console.log('⚠️ 策略管理器未运行');
            return;
        }
        
        console.log('🛑 停止所有策略...');
        
        const stopPromises = [];
        
        for (const [name, strategy] of this.strategies) {
            stopPromises.push(
                strategy.stop().catch(error => {
                    console.error(`❌ 停止策略 ${name} 失败:`, error.message);
                })
            );
        }
        
        await Promise.all(stopPromises);
        
        this.isRunning = false;
        this.updateActiveStrategiesCount();
        
        console.log('✅ 所有策略已停止');
        this.emit('stopped');
    }
    
    /**
     * 暂停所有策略
     */
    async pauseAll() {
        console.log('⏸️ 暂停所有策略...');
        
        for (const [name, strategy] of this.strategies) {
            try {
                await strategy.pause();
            } catch (error) {
                console.error(`❌ 暂停策略 ${name} 失败:`, error.message);
            }
        }
        
        this.updateActiveStrategiesCount();
        console.log('✅ 所有策略已暂停');
        this.emit('paused');
    }
    
    /**
     * 恢复所有策略
     */
    async resumeAll() {
        console.log('▶️ 恢复所有策略...');
        
        for (const [name, strategy] of this.strategies) {
            try {
                await strategy.resume();
            } catch (error) {
                console.error(`❌ 恢复策略 ${name} 失败:`, error.message);
            }
        }
        
        this.updateActiveStrategiesCount();
        console.log('✅ 所有策略已恢复');
        this.emit('resumed');
    }
    
    /**
     * 获取特定策略
     */
    getStrategy(name) {
        return this.strategies.get(name);
    }
    
    /**
     * 获取所有策略状态
     */
    getAllStrategyStatus() {
        const status = {};
        
        for (const [name, strategy] of this.strategies) {
            status[name] = strategy.getStatus();
        }
        
        return status;
    }
    
    /**
     * 获取管理器状态
     */
    getManagerStatus() {
        const uptime = this.startTime ? Date.now() - this.startTime : 0;
        
        return {
            isRunning: this.isRunning,
            uptime,
            stats: { ...this.stats },
            riskManager: { ...this.riskManager },
            strategies: this.getAllStrategyStatus()
        };
    }
    
    /**
     * 更新活跃策略计数
     */
    updateActiveStrategiesCount() {
        this.stats.activeStrategies = Array.from(this.strategies.values())
            .filter(strategy => strategy.state === 'running').length;
    }
    
    /**
     * 设置风险管理
     */
    setupRiskManagement() {
        // 每分钟检查风险指标
        setInterval(() => {
            this.checkRiskLimits();
        }, 60000);
        
        // 每天重置计数器
        setInterval(() => {
            this.resetDailyCounters();
        }, 24 * 60 * 60 * 1000);
        
        // 每小时重置执行计数器
        setInterval(() => {
            this.resetHourlyCounters();
        }, 60 * 60 * 1000);
    }
    
    /**
     * 检查风险限制
     */
    checkRiskLimits() {
        // 检查日损失限制
        if (this.riskManager.dailyLoss >= generalStrategyConfig.maxDailyLoss) {
            console.log('🚨 达到日损失限制，暂停所有策略');
            this.pauseAll();
            this.emit('riskLimitReached', { type: 'dailyLoss', value: this.riskManager.dailyLoss });
        }
        
        // 检查执行频率限制
        if (this.riskManager.executionCount >= generalStrategyConfig.maxExecutionsPerHour) {
            console.log('🚨 达到执行频率限制，暂停所有策略');
            this.pauseAll();
            this.emit('riskLimitReached', { type: 'executionRate', value: this.riskManager.executionCount });
        }
    }
    
    /**
     * 重置风险计数器
     */
    resetRiskCounters() {
        this.riskManager.dailyLoss = 0;
        this.riskManager.dailyLossResetTime = Date.now();
        this.riskManager.executionCount = 0;
        this.riskManager.executionResetTime = Date.now();
    }
    
    /**
     * 重置日计数器
     */
    resetDailyCounters() {
        this.riskManager.dailyLoss = 0;
        this.riskManager.dailyLossResetTime = Date.now();
        console.log('🔄 日损失计数器已重置');
    }
    
    /**
     * 重置小时计数器
     */
    resetHourlyCounters() {
        this.riskManager.executionCount = 0;
        this.riskManager.executionResetTime = Date.now();
        console.log('🔄 执行频率计数器已重置');
    }
    
    /**
     * 记录损失
     */
    recordLoss(amount) {
        this.riskManager.dailyLoss += amount;
        this.emit('lossRecorded', { amount, totalDailyLoss: this.riskManager.dailyLoss });
    }
    
    /**
     * 记录执行
     */
    recordExecution() {
        this.riskManager.executionCount++;
        this.emit('executionRecorded', { count: this.riskManager.executionCount });
    }
}

export default StrategyManager;