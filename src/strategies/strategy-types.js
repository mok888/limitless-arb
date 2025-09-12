/**
 * 策略类型定义
 * 定义所有支持的策略类型和相关配置
 */

/**
 * 策略类型枚举
 */
export const StrategyType = {
    // 套利策略
    HOURLY_ARBITRAGE: 'hourly_arbitrage',
    PRICE_ARBITRAGE: 'price_arbitrage',
    
    // 做市策略
    LP_MAKING: 'lp_making',
    SPREAD_MAKING: 'spread_making',
    
    // 趋势策略
    MOMENTUM: 'momentum',
    MEAN_REVERSION: 'mean_reversion',
    
    // 事件驱动策略
    NEW_MARKET: 'new_market',
    VOLUME_SPIKE: 'volume_spike',
    
    // 组合策略
    MULTI_STRATEGY: 'multi_strategy'
};

/**
 * 策略优先级
 */
export const StrategyPriority = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    CRITICAL: 4
};

/**
 * 策略执行模式
 */
export const ExecutionMode = {
    MANUAL: 'manual',       // 手动执行
    SCHEDULED: 'scheduled', // 定时执行
    EVENT_DRIVEN: 'event_driven', // 事件驱动
    CONTINUOUS: 'continuous' // 持续执行
};

/**
 * 风险等级
 */
export const RiskLevel = {
    VERY_LOW: 'very_low',
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    VERY_HIGH: 'very_high'
};

/**
 * 策略元数据定义
 */
export const StrategyMetadata = {
    [StrategyType.HOURLY_ARBITRAGE]: {
        name: '每小时套利策略',
        description: '监控每小时结算市场，在结算前寻找套利机会',
        riskLevel: RiskLevel.LOW,
        executionMode: ExecutionMode.CONTINUOUS,
        priority: StrategyPriority.HIGH,
        requiredCapital: 10, // USDC
        expectedReturn: 0.05, // 5%
        maxDrawdown: 0.02, // 2%
        timeframe: '1h'
    },
    
    [StrategyType.LP_MAKING]: {
        name: 'LP做市策略',
        description: '在有奖励的市场提供流动性，获取LP奖励',
        riskLevel: RiskLevel.MEDIUM,
        executionMode: ExecutionMode.CONTINUOUS,
        priority: StrategyPriority.NORMAL,
        requiredCapital: 50, // USDC
        expectedReturn: 0.15, // 15%
        maxDrawdown: 0.10, // 10%
        timeframe: '24h'
    },
    
    [StrategyType.NEW_MARKET]: {
        name: '新市场策略',
        description: '发现新市场时执行split操作',
        riskLevel: RiskLevel.MEDIUM,
        executionMode: ExecutionMode.EVENT_DRIVEN,
        priority: StrategyPriority.HIGH,
        requiredCapital: 100, // USDC
        expectedReturn: 0.08, // 8%
        maxDrawdown: 0.05, // 5%
        timeframe: 'event'
    },
    
    [StrategyType.PRICE_ARBITRAGE]: {
        name: '价格套利策略',
        description: '寻找价格偏差进行套利',
        riskLevel: RiskLevel.LOW,
        executionMode: ExecutionMode.CONTINUOUS,
        priority: StrategyPriority.HIGH,
        requiredCapital: 20, // USDC
        expectedReturn: 0.03, // 3%
        maxDrawdown: 0.01, // 1%
        timeframe: '5m'
    },
    
    [StrategyType.SPREAD_MAKING]: {
        name: '价差做市策略',
        description: '在买卖价差中提供流动性',
        riskLevel: RiskLevel.MEDIUM,
        executionMode: ExecutionMode.CONTINUOUS,
        priority: StrategyPriority.NORMAL,
        requiredCapital: 30, // USDC
        expectedReturn: 0.12, // 12%
        maxDrawdown: 0.08, // 8%
        timeframe: '1h'
    }
};

/**
 * 获取策略元数据
 */
export function getStrategyMetadata(strategyType) {
    return StrategyMetadata[strategyType] || null;
}

/**
 * 获取所有策略类型
 */
export function getAllStrategyTypes() {
    return Object.values(StrategyType);
}

/**
 * 根据风险等级筛选策略
 */
export function getStrategiesByRiskLevel(riskLevel) {
    return Object.entries(StrategyMetadata)
        .filter(([, metadata]) => metadata.riskLevel === riskLevel)
        .map(([type]) => type);
}

/**
 * 根据执行模式筛选策略
 */
export function getStrategiesByExecutionMode(executionMode) {
    return Object.entries(StrategyMetadata)
        .filter(([, metadata]) => metadata.executionMode === executionMode)
        .map(([type]) => type);
}

/**
 * 验证策略配置
 */
export function validateStrategyConfig(strategyType, config) {
    const metadata = getStrategyMetadata(strategyType);
    if (!metadata) {
        return { valid: false, errors: [`未知的策略类型: ${strategyType}`] };
    }
    
    const errors = [];
    
    // 检查必需的资金
    if (config.capital && config.capital < metadata.requiredCapital) {
        errors.push(`资金不足: 需要至少 ${metadata.requiredCapital} USDC`);
    }
    
    // 检查风险等级
    if (config.maxRiskLevel) {
        const riskLevels = Object.values(RiskLevel);
        const currentRiskIndex = riskLevels.indexOf(metadata.riskLevel);
        const maxRiskIndex = riskLevels.indexOf(config.maxRiskLevel);
        
        if (currentRiskIndex > maxRiskIndex) {
            errors.push(`策略风险等级 (${metadata.riskLevel}) 超过最大允许风险 (${config.maxRiskLevel})`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

export default {
    StrategyType,
    StrategyPriority,
    ExecutionMode,
    RiskLevel,
    StrategyMetadata,
    getStrategyMetadata,
    getAllStrategyTypes,
    getStrategiesByRiskLevel,
    getStrategiesByExecutionMode,
    validateStrategyConfig
};