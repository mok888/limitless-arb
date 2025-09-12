/**
 * 策略配置管理器
 * 从环境变量加载策略配置参数
 */

import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 解析环境变量为数字，提供默认值
 */
function parseNumber(envValue, defaultValue) {
    const parsed = parseFloat(envValue);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 解析环境变量为布尔值，提供默认值
 */
function parseBoolean(envValue, defaultValue) {
    if (envValue === undefined || envValue === null) {
        return defaultValue;
    }
    return envValue.toLowerCase() === 'true';
}

/**
 * LP做市策略配置
 */
export const lpMakingConfig = {
    // 基础配置
    enabled: parseBoolean(process.env.LP_MAKING_ENABLED, true),
    maxRetries: parseNumber(process.env.LP_MAKING_MAX_RETRIES, 3),
    retryDelay: parseNumber(process.env.LP_MAKING_RETRY_DELAY, 1000),
    
    // 交易参数
    initialPurchase: parseNumber(process.env.LP_MAKING_INITIAL_PURCHASE, 50),
    targetProfitRate: parseNumber(process.env.LP_MAKING_TARGET_PROFIT_RATE, 0.15),
    minMarketScore: parseNumber(process.env.LP_MAKING_MIN_MARKET_SCORE, 60),
    maxConcurrentMarkets: parseNumber(process.env.LP_MAKING_MAX_CONCURRENT_MARKETS, 5),
    rewardThreshold: parseNumber(process.env.LP_MAKING_REWARD_THRESHOLD, 0.7),
    
    // 时间间隔配置 (毫秒)
    priceAdjustmentInterval: parseNumber(process.env.LP_MAKING_PRICE_ADJUSTMENT_INTERVAL, 300000), // 5分钟
    maxOrderAge: parseNumber(process.env.LP_MAKING_MAX_ORDER_AGE, 3600000), // 1小时
    executionInterval: parseNumber(process.env.LP_MAKING_EXECUTION_INTERVAL, 60000), // 1分钟
    positionCheckInterval: parseNumber(process.env.LP_MAKING_POSITION_CHECK_INTERVAL, 30000), // 30秒
};

/**
 * 每小时套利策略配置
 */
export const hourlyArbitrageConfig = {
    // 基础配置
    enabled: parseBoolean(process.env.HOURLY_ARBITRAGE_ENABLED, true),
    maxRetries: parseNumber(process.env.HOURLY_ARBITRAGE_MAX_RETRIES, 3),
    retryDelay: parseNumber(process.env.HOURLY_ARBITRAGE_RETRY_DELAY, 1000),
    
    // 交易参数
    arbitrageAmount: parseNumber(process.env.HOURLY_ARBITRAGE_AMOUNT, 10),
    minPriceThreshold: parseNumber(process.env.HOURLY_ARBITRAGE_MIN_PRICE_THRESHOLD, 0.90),
    maxPriceThreshold: parseNumber(process.env.HOURLY_ARBITRAGE_MAX_PRICE_THRESHOLD, 0.985),
    
    // 策略级仓位控制 - 新增配置
    maxConcurrentPositions: parseNumber(process.env.HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS, 1), // 策略级可同时执行仓位数量上限
    
    // 账户级仓位控制 - 保持向后兼容
    maxAccountPositions: parseNumber(process.env.HOURLY_ARBITRAGE_MAX_ACCOUNT_POSITIONS, 5), // 单个账户最大仓位数
    
    // 时间配置 (毫秒)
    settlementBuffer: parseNumber(process.env.HOURLY_ARBITRAGE_SETTLEMENT_BUFFER, 600000), // 10分钟
    scanInterval: parseNumber(process.env.HOURLY_ARBITRAGE_SCAN_INTERVAL, 60000), // 1分钟
    maxTimeToSettlement: parseNumber(process.env.HOURLY_ARBITRAGE_MAX_TIME_TO_SETTLEMENT, 300000), // 5分钟
    positionCheckInterval: parseNumber(process.env.HOURLY_ARBITRAGE_POSITION_CHECK_INTERVAL, 30000), // 30秒
};

/**
 * 价格套利策略配置
 */
export const priceArbitrageConfig = {
    // 基础配置
    enabled: parseBoolean(process.env.PRICE_ARBITRAGE_ENABLED, true),

    // 交易参数
    arbitrageAmount: parseNumber(process.env.PRICE_ARBITRAGE_AMOUNT, 5), // 单次下单金额
    slippage: parseNumber(process.env.PRICE_ARBITRAGE_SLIPPAGE, 0.2), // 滑点
    profit: parseNumber(process.env.PRICE_ARBITRAGE_PROFIT, 0.2), // 利润率

    // 时间配置
    scanInterval: parseNumber(process.env.PRICE_ARBITRAGE_SCAN_INTERVAL, 60000), // 1分钟
    sellToArbitrageInterval: parseNumber(process.env.PRICE_ARBITRAGE_SELL_INTERVAL, 1000), // 1秒
    minMinutes: parseNumber(process.env.PRICE_ARBITRAGE_MIN_MINUTES, 1), // 距离市场开启 minMinute 后才能下单
    maxMinutes: parseNumber(process.env.PRICE_ARBITRAGE_MAX_MINUTES, 10), // 距离市场开启 maxMinute 后不能下单

    // 策略级仓位控制 - 新增配置
    maxConcurrentPositions: parseNumber(process.env.PRICE_ARBITRAGE_MAX_CONCURRENT_POSITIONS, 1), // 策略级可同时执行仓位数量上限
    
    // 账户级仓位控制 - 保持向后兼容
    maxAccountPositions: parseNumber(process.env.PRICE_ARBITRAGE_MAX_ACCOUNT_POSITIONS, 1), // 单个账户最大仓位数
    
}

/**
 * 通用策略配置
 */
export const generalStrategyConfig = {
    // 市场扫描时间间隔
    marketScanInterval: parseNumber(process.env.MARKET_SCAN_INTERVAL, 30_000),
    
    // 全局开关
    strategiesEnabled: parseBoolean(process.env.STRATEGIES_ENABLED, true),
    
    // 风险管理
    maxTotalInvestment: parseNumber(process.env.MAX_TOTAL_INVESTMENT, 1000), // 最大总投资额 (USDC)
    maxDailyLoss: parseNumber(process.env.MAX_DAILY_LOSS, 100), // 最大日损失 (USDC)
    emergencyStopLoss: parseNumber(process.env.EMERGENCY_STOP_LOSS, 0.20), // 紧急止损率 (20%)
    
    // 市场筛选
    minLiquidity: parseNumber(process.env.MIN_MARKET_LIQUIDITY, 1000), // 最小流动性 (USDC)
    maxMarketAge: parseNumber(process.env.MAX_MARKET_AGE_DAYS, 30), // 最大市场年龄 (天)
    
    // 执行控制
    cooldownPeriod: parseNumber(process.env.STRATEGY_COOLDOWN_PERIOD, 5000), // 策略冷却期 (毫秒)
    maxExecutionsPerHour: parseNumber(process.env.MAX_EXECUTIONS_PER_HOUR, 60), // 每小时最大执行次数
};

/**
 * 获取所有策略配置
 */
export function getAllStrategyConfigs() {
    return {
        general: generalStrategyConfig,
        lpMaking: lpMakingConfig,
        hourlyArbitrage: hourlyArbitrageConfig
    };
}

/**
 * 验证配置的有效性
 */
export function validateConfigs() {
    const errors = [];
    
    // 验证LP做市策略配置
    if (lpMakingConfig.initialPurchase <= 0) {
        errors.push('LP_MAKING_INITIAL_PURCHASE 必须大于 0');
    }
    
    if (lpMakingConfig.targetProfitRate <= 0 || lpMakingConfig.targetProfitRate > 1) {
        errors.push('LP_MAKING_TARGET_PROFIT_RATE 必须在 0 到 1 之间');
    }
    
    if (lpMakingConfig.minMarketScore < 0 || lpMakingConfig.minMarketScore > 100) {
        errors.push('LP_MAKING_MIN_MARKET_SCORE 必须在 0 到 100 之间');
    }
    
    // 验证每小时套利策略配置
    if (hourlyArbitrageConfig.arbitrageAmount <= 0) {
        errors.push('HOURLY_ARBITRAGE_AMOUNT 必须大于 0');
    }
    
    if (hourlyArbitrageConfig.minPriceThreshold >= hourlyArbitrageConfig.maxPriceThreshold) {
        errors.push('HOURLY_ARBITRAGE_MIN_PRICE_THRESHOLD 必须小于 HOURLY_ARBITRAGE_MAX_PRICE_THRESHOLD');
    }
    
    // 验证通用配置
    if (generalStrategyConfig.maxTotalInvestment <= 0) {
        errors.push('MAX_TOTAL_INVESTMENT 必须大于 0');
    }
    
    if (generalStrategyConfig.emergencyStopLoss <= 0 || generalStrategyConfig.emergencyStopLoss > 1) {
        errors.push('EMERGENCY_STOP_LOSS 必须在 0 到 1 之间');
    }
    
    return errors;
}

/**
 * 打印当前配置摘要
 */
export function printConfigSummary() {
    console.log('\n📋 策略配置摘要:');
    console.log('================');
    
    console.log('\n🔧 通用配置:');
    console.log(`  策略启用: ${generalStrategyConfig.strategiesEnabled ? '✅' : '❌'}`);
    console.log(`  最大总投资: ${generalStrategyConfig.maxTotalInvestment} USDC`);
    console.log(`  最大日损失: ${generalStrategyConfig.maxDailyLoss} USDC`);
    console.log(`  紧急止损率: ${(generalStrategyConfig.emergencyStopLoss * 100).toFixed(1)}%`);
    
    console.log('\n💰 LP做市策略:');
    console.log(`  启用状态: ${lpMakingConfig.enabled ? '✅' : '❌'}`);
    console.log(`  初始购买: ${lpMakingConfig.initialPurchase} USDC`);
    console.log(`  目标止盈率: ${(lpMakingConfig.targetProfitRate * 100).toFixed(1)}%`);
    console.log(`  最小市场评分: ${lpMakingConfig.minMarketScore}`);
    console.log(`  最大并发市场: ${lpMakingConfig.maxConcurrentMarkets}`);
    
    console.log('\n⚡ 每小时套利策略:');
    console.log(`  启用状态: ${hourlyArbitrageConfig.enabled ? '✅' : '❌'}`);
    console.log(`  套利金额: ${hourlyArbitrageConfig.arbitrageAmount} USDC`);
    console.log(`  价格区间: ${(hourlyArbitrageConfig.minPriceThreshold * 100).toFixed(1)}% - ${(hourlyArbitrageConfig.maxPriceThreshold * 100).toFixed(1)}%`);
    console.log(`  策略级最大仓位: ${hourlyArbitrageConfig.maxConcurrentPositions} (策略级上限)`);
    console.log(`  账户级最大仓位: ${hourlyArbitrageConfig.maxAccountPositions} (单账户上限)`);
    
    console.log('================\n');
}

export default {
    lpMaking: lpMakingConfig,
    hourlyArbitrage: hourlyArbitrageConfig,
    general: generalStrategyConfig,
    getAllConfigs: getAllStrategyConfigs,
    validate: validateConfigs,
    printSummary: printConfigSummary
};