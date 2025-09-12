#!/usr/bin/env node

/**
 * 策略配置生成器
 * 交互式生成 .env 配置文件
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';

// 创建命令行接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * 询问用户输入
 */
function askQuestion(question, defaultValue = '') {
    return new Promise((resolve) => {
        const prompt = defaultValue ? `${question} (默认: ${defaultValue}): ` : `${question}: `;
        rl.question(prompt, (answer) => {
            resolve(answer.trim() || defaultValue);
        });
    });
}

/**
 * 验证数字输入
 */
function validateNumber(value, min = null, max = null) {
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    if (min !== null && num < min) return false;
    if (max !== null && num > max) return false;
    return true;
}

/**
 * 主配置生成流程
 */
async function generateConfig() {
    console.log('🔧 策略配置生成器');
    console.log('==================\n');
    console.log('这个工具将帮助您生成策略配置文件。');
    console.log('按 Enter 键使用默认值，或输入自定义值。\n');
    
    const config = {};
    
    // 基础API配置
    console.log('📡 基础API配置:');
    config.API_BASE_URL = await askQuestion('API基础URL', 'https://api.limitless.exchange');
    config.RPC_URL = await askQuestion('RPC URL', 'https://mainnet.base.org');
    config.MIN_TIME_TO_EXPIRY_HOURS = await askQuestion('最小到期时间(小时)', '2');
    
    // 市场发现配置
    console.log('\n🔍 市场发现配置:');
    config.MARKET_SCAN_INTERVAL = await askQuestion('市场扫描间隔(秒)', '30');
    config.MARKET_DISCOVERY_INTERVAL = await askQuestion('市场发现间隔(秒)', '300');
    config.MIN_MARKET_SCORE = await askQuestion('最小市场评分', '60');
    config.MAX_TRACKED_MARKETS = await askQuestion('最大跟踪市场数', '50');
    config.NEW_MARKET_SCORE_THRESHOLD = await askQuestion('新市场评分阈值', '70');
    
    // 通用策略配置
    console.log('\n⚙️ 通用策略配置:');
    config.STRATEGIES_ENABLED = await askQuestion('启用策略 (true/false)', 'true');
    
    let maxInvestment;
    do {
        maxInvestment = await askQuestion('最大总投资额(USDC)', '1000');
    } while (!validateNumber(maxInvestment, 1));
    config.MAX_TOTAL_INVESTMENT = maxInvestment;
    
    let maxDailyLoss;
    do {
        maxDailyLoss = await askQuestion('最大日损失(USDC)', '100');
    } while (!validateNumber(maxDailyLoss, 1));
    config.MAX_DAILY_LOSS = maxDailyLoss;
    
    let emergencyStopLoss;
    do {
        emergencyStopLoss = await askQuestion('紧急止损率(0-1)', '0.20');
    } while (!validateNumber(emergencyStopLoss, 0, 1));
    config.EMERGENCY_STOP_LOSS = emergencyStopLoss;
    
    // LP做市策略配置
    console.log('\n💰 LP做市策略配置:');
    config.LP_MAKING_ENABLED = await askQuestion('启用LP做市策略 (true/false)', 'true');
    
    let initialPurchase;
    do {
        initialPurchase = await askQuestion('初始购买金额(USDC)', '50');
    } while (!validateNumber(initialPurchase, 1));
    config.LP_MAKING_INITIAL_PURCHASE = initialPurchase;
    
    let targetProfitRate;
    do {
        targetProfitRate = await askQuestion('目标止盈率(0-1)', '0.15');
    } while (!validateNumber(targetProfitRate, 0, 1));
    config.LP_MAKING_TARGET_PROFIT_RATE = targetProfitRate;
    
    config.LP_MAKING_MIN_MARKET_SCORE = await askQuestion('最小市场评分', '60');
    config.LP_MAKING_MAX_CONCURRENT_MARKETS = await askQuestion('最大并发市场数', '5');
    config.LP_MAKING_REWARD_THRESHOLD = await askQuestion('奖励倍数阈值', '0.7');
    
    // 每小时套利策略配置
    console.log('\n⚡ 每小时套利策略配置:');
    config.HOURLY_ARBITRAGE_ENABLED = await askQuestion('启用每小时套利策略 (true/false)', 'true');
    
    let arbitrageAmount;
    do {
        arbitrageAmount = await askQuestion('套利金额(USDC)', '10');
    } while (!validateNumber(arbitrageAmount, 1));
    config.HOURLY_ARBITRAGE_AMOUNT = arbitrageAmount;
    
    let minPriceThreshold;
    do {
        minPriceThreshold = await askQuestion('最低价格阈值(0-1)', '0.90');
    } while (!validateNumber(minPriceThreshold, 0, 1));
    config.HOURLY_ARBITRAGE_MIN_PRICE_THRESHOLD = minPriceThreshold;
    
    let maxPriceThreshold;
    do {
        maxPriceThreshold = await askQuestion('最高价格阈值(0-1)', '0.985');
    } while (!validateNumber(maxPriceThreshold, 0, 1));
    config.HOURLY_ARBITRAGE_MAX_PRICE_THRESHOLD = maxPriceThreshold;
    
    config.HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS = await askQuestion('最大并发仓位数', '5');
    
    // 生成配置文件内容
    const envContent = generateEnvContent(config);
    
    // 询问是否保存
    console.log('\n📝 生成的配置预览:');
    console.log('==================');
    console.log(envContent);
    console.log('==================\n');
    
    const shouldSave = await askQuestion('是否保存到 .env 文件? (y/n)', 'y');
    
    if (shouldSave.toLowerCase() === 'y' || shouldSave.toLowerCase() === 'yes') {
        const envPath = path.join(process.cwd(), '.env');
        
        // 检查文件是否存在
        if (fs.existsSync(envPath)) {
            const overwrite = await askQuestion('.env 文件已存在，是否覆盖? (y/n)', 'n');
            if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
                console.log('❌ 取消保存');
                rl.close();
                return;
            }
        }
        
        // 保存文件
        fs.writeFileSync(envPath, envContent);
        console.log('✅ 配置已保存到 .env 文件');
        console.log('\n💡 提示: 运行 "node tools/config-validator.js" 验证配置');
    } else {
        console.log('❌ 配置未保存');
    }
    
    rl.close();
}

/**
 * 生成 .env 文件内容
 */
function generateEnvContent(config) {
    return `# Limitless Exchange 交易策略配置
# 由配置生成器自动生成于 ${new Date().toISOString()}

# 基础API配置
API_BASE_URL=${config.API_BASE_URL}
RPC_URL=${config.RPC_URL}
MIN_TIME_TO_EXPIRY_HOURS=${config.MIN_TIME_TO_EXPIRY_HOURS}

# 市场发现配置
MARKET_SCAN_INTERVAL=${config.MARKET_SCAN_INTERVAL}
MARKET_DISCOVERY_INTERVAL=${config.MARKET_DISCOVERY_INTERVAL}
MIN_MARKET_SCORE=${config.MIN_MARKET_SCORE}
MAX_TRACKED_MARKETS=${config.MAX_TRACKED_MARKETS}
NEW_MARKET_SCORE_THRESHOLD=${config.NEW_MARKET_SCORE_THRESHOLD}

# ==========================================
# 交易策略配置
# ==========================================

# 通用策略配置
STRATEGIES_ENABLED=${config.STRATEGIES_ENABLED}
MAX_TOTAL_INVESTMENT=${config.MAX_TOTAL_INVESTMENT}
MAX_DAILY_LOSS=${config.MAX_DAILY_LOSS}
EMERGENCY_STOP_LOSS=${config.EMERGENCY_STOP_LOSS}
MIN_MARKET_LIQUIDITY=1000
MAX_MARKET_AGE_DAYS=30
STRATEGY_COOLDOWN_PERIOD=5000
MAX_EXECUTIONS_PER_HOUR=60

# ==========================================
# LP做市策略配置
# ==========================================

# 基础配置
LP_MAKING_ENABLED=${config.LP_MAKING_ENABLED}
LP_MAKING_MAX_RETRIES=3
LP_MAKING_RETRY_DELAY=1000

# 交易参数
LP_MAKING_INITIAL_PURCHASE=${config.LP_MAKING_INITIAL_PURCHASE}
LP_MAKING_TARGET_PROFIT_RATE=${config.LP_MAKING_TARGET_PROFIT_RATE}
LP_MAKING_MIN_MARKET_SCORE=${config.LP_MAKING_MIN_MARKET_SCORE}
LP_MAKING_MAX_CONCURRENT_MARKETS=${config.LP_MAKING_MAX_CONCURRENT_MARKETS}
LP_MAKING_REWARD_THRESHOLD=${config.LP_MAKING_REWARD_THRESHOLD}

# 时间间隔配置 (毫秒)
LP_MAKING_PRICE_ADJUSTMENT_INTERVAL=300000
LP_MAKING_MAX_ORDER_AGE=3600000
LP_MAKING_EXECUTION_INTERVAL=60000
LP_MAKING_POSITION_CHECK_INTERVAL=30000

# ==========================================
# 每小时套利策略配置
# ==========================================

# 基础配置
HOURLY_ARBITRAGE_ENABLED=${config.HOURLY_ARBITRAGE_ENABLED}
HOURLY_ARBITRAGE_MAX_RETRIES=3
HOURLY_ARBITRAGE_RETRY_DELAY=1000

# 交易参数
HOURLY_ARBITRAGE_AMOUNT=${config.HOURLY_ARBITRAGE_AMOUNT}
HOURLY_ARBITRAGE_MIN_PRICE_THRESHOLD=${config.HOURLY_ARBITRAGE_MIN_PRICE_THRESHOLD}
HOURLY_ARBITRAGE_MAX_PRICE_THRESHOLD=${config.HOURLY_ARBITRAGE_MAX_PRICE_THRESHOLD}
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=${config.HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS}

# 时间配置 (毫秒)
HOURLY_ARBITRAGE_SETTLEMENT_BUFFER=600000
HOURLY_ARBITRAGE_SCAN_INTERVAL=60000
HOURLY_ARBITRAGE_MIN_TIME_TO_SETTLEMENT=300000
HOURLY_ARBITRAGE_POSITION_CHECK_INTERVAL=30000
`;
}

// 运行配置生成器
generateConfig().catch(error => {
    console.error('❌ 配置生成失败:', error);
    rl.close();
    process.exit(1);
});