/**
 * 基础策略抽象类
 * 定义所有策略的通用接口和生命周期
 */

import { EventEmitter } from 'events';
import { generalStrategyConfig } from '../config/strategy-config.js';

/**
 * 策略状态枚举
 */
export const StrategyState = {
    IDLE: 'idle',           // 空闲状态
    INITIALIZING: 'initializing', // 初始化中
    RUNNING: 'running',     // 运行中
    PAUSED: 'paused',       // 暂停
    STOPPING: 'stopping',   // 停止中
    STOPPED: 'stopped',     // 已停止
    ERROR: 'error'          // 错误状态
};

/**
 * 基础策略类
 * 所有具体策略都应继承此类
 */
export class BaseStrategy extends EventEmitter {
    constructor(name, config = {}) {
        super();

        // 基础属性
        this.name = name;
        this.config = { ...this.getDefaultConfig(), ...generalStrategyConfig, ...config };
        
        // 状态管理
        this.state = StrategyState.IDLE;
        this.startTime = null;
        this.stopTime = null;
        
        // 统计信息
        this.stats = {
            executionCount: 0,
            successCount: 0,
            errorCount: 0,
            lastExecutionTime: null,
            lastErrorTime: null,
            lastError: null
        };
        
        // 定时器管理
        this.timers = new Map();
    }
    
    /**
     * 获取默认配置 - 子类应重写此方法
     */
    getDefaultConfig() {
        return {
            enabled: true,
            maxRetries: 3,
            retryDelay: 1000
        };
    }
    
    /**
     * 初始化策略 - 子类应重写此方法
     */
    async initialize() {
        this.setState(StrategyState.INITIALIZING);
        
        try {
            await this.onInitialize();
            this.setState(StrategyState.IDLE);
            this.emit('initialized');
        } catch (error) {
            this.setState(StrategyState.ERROR);
            this.handleError('初始化失败', error);
            throw error;
        }
    }
    
    /**
     * 启动策略
     */
    async start() {
        if (this.state === StrategyState.RUNNING) {
            console.log(`⚠️ 策略 ${this.name} 已在运行中`);
            return;
        }
        
        if (!this.config.enabled) {
            console.log(`⚠️ 策略 ${this.name} 已禁用`);
            return;
        }
        
        console.log(`🚀 启动策略: ${this.name}`);
        this.setState(StrategyState.RUNNING);
        this.startTime = Date.now();
        
        try {
            await this.onStart();
            this.emit('started');
        } catch (error) {
            this.setState(StrategyState.ERROR);
            this.handleError('启动失败', error);
            throw error;
        }
    }
    
    /**
     * 停止策略
     */
    async stop() {
        if (this.state === StrategyState.STOPPED) {
            return;
        }
        
        console.log(`🛑 停止策略: ${this.name}`);
        this.setState(StrategyState.STOPPING);
        
        try {
            // 清理所有定时器
            this.clearAllTimers();
            
            await this.onStop();
            
            this.setState(StrategyState.STOPPED);
            this.stopTime = Date.now();
            this.emit('stopped');
        } catch (error) {
            this.setState(StrategyState.ERROR);
            this.handleError('停止失败', error);
            throw error;
        }
    }
    
    /**
     * 暂停策略
     */
    async pause() {
        if (this.state !== StrategyState.RUNNING) {
            return;
        }
        
        console.log(`⏸️ 暂停策略: ${this.name}`);
        this.setState(StrategyState.PAUSED);
        
        try {
            await this.onPause();
            this.emit('paused');
        } catch (error) {
            this.handleError('暂停失败', error);
        }
    }
    
    /**
     * 恢复策略
     */
    async resume() {
        if (this.state !== StrategyState.PAUSED) {
            return;
        }
        
        console.log(`▶️ 恢复策略: ${this.name}`);
        this.setState(StrategyState.RUNNING);
        
        try {
            await this.onResume();
            this.emit('resumed');
        } catch (error) {
            this.handleError('恢复失败', error);
        }
    }
    
    /**
     * 执行策略逻辑 - 子类应重写此方法
     */
    async execute() {
        if (this.state !== StrategyState.RUNNING) {
            return;
        }
        
        this.stats.executionCount++;
        this.stats.lastExecutionTime = Date.now();
        
        try {
            const result = await this.onExecute();
            this.stats.successCount++;
            this.emit('executed', result);
            return result;
        } catch (error) {
            this.stats.errorCount++;
            this.handleError('执行失败', error);
            throw error;
        }
    }
    
    /**
     * 设置状态
     */
    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        this.emit('stateChanged', { oldState, newState });
    }
    
    /**
     * 处理错误
     */
    handleError(message, error) {
        this.stats.lastErrorTime = Date.now();
        this.stats.lastError = error.message;
        
        console.error(`❌ [${this.name}] ${message}:`, error.message);
        this.emit('error', { message, error });
    }
    
    /**
     * 设置定时器
     */
    setTimer(name, callback, interval) {
        this.clearTimer(name);
        const timer = setInterval(callback, interval);
        this.timers.set(name, timer);
        return timer;
    }
    
    /**
     * 清除定时器
     */
    clearTimer(name) {
        const timer = this.timers.get(name);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(name);
        }
    }
    
    /**
     * 清除所有定时器
     */
    clearAllTimers() {
        for (const [name, timer] of this.timers) {
            clearInterval(timer);
        }
        this.timers.clear();
    }
    
    /**
     * 获取策略状态
     */
    getStatus() {
        const uptime = this.startTime ? Date.now() - this.startTime : 0;
        
        return {
            name: this.name,
            state: this.state,
            config: this.config,
            uptime,
            stats: { ...this.stats },
            timers: Array.from(this.timers.keys())
        };
    }

    /**
     * 获取当前分钟
     */
    getMinutes() {
        const now = new Date();
        const nowMinutes = now.getMinutes();
        return nowMinutes;
    }
    
    /**
     * 更新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.emit('configUpdated', this.config);
    }
    
    // 子类需要实现的抽象方法
    
    /**
     * 初始化回调 - 子类实现
     */
    async onInitialize() {
        // 子类实现具体的初始化逻辑
    }
    
    /**
     * 启动回调 - 子类实现
     */
    async onStart() {
        // 子类实现具体的启动逻辑
    }
    
    /**
     * 停止回调 - 子类实现
     */
    async onStop() {
        // 子类实现具体的停止逻辑
    }
    
    /**
     * 暂停回调 - 子类实现
     */
    async onPause() {
        // 子类实现具体的暂停逻辑
    }
    
    /**
     * 恢复回调 - 子类实现
     */
    async onResume() {
        // 子类实现具体的恢复逻辑
    }
    
    /**
     * 执行回调 - 子类必须实现
     */
    async onExecute() {
        throw new Error('子类必须实现 onExecute 方法');
    }
}

export default BaseStrategy;