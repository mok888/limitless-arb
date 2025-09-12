#!/usr/bin/env node

/**
 * 每小时套利策略管理工具
 * 提供命令行界面来管理和监控每小时套利策略
 */

import readline from 'readline';
import LimitlessApiClient from '../src/core/api-client.js';
import { HourlyArbitrageStrategy, HourlyArbitrageMonitor } from '../src/strategies/hourly-arbitrage-strategy.js';

class HourlyArbitrageToolCLI {
    constructor() {
        this.rl = null;
        this.apiClient = null;
        this.strategy = null;
        this.monitor = null;
        this.isRunning = false;
        
        // 命令映射
        this.commands = {
            'help': this.showHelp.bind(this),
            'h': this.showHelp.bind(this),
            'init': this.initializeStrategy.bind(this),
            'start': this.startStrategy.bind(this),
            'stop': this.stopStrategy.bind(this),
            'status': this.showStatus.bind(this),
            'scan': this.triggerScan.bind(this),
            'config': this.showConfig.bind(this),
            'stats': this.showStats.bind(this),
            'positions': this.showPositions.bind(this),
            'markets': this.showHourlyMarkets.bind(this),
            'test': this.runTests.bind(this),
            'clear': this.clearScreen.bind(this),
            'exit': this.exit.bind(this),
            'quit': this.exit.bind(this)
        };
    }
    
    /**
     * 启动CLI工具
     */
    async start() {
        console.log('🕐 每小时套利策略管理工具');
        console.log('=' .repeat(50));
        
        // 创建readline接口
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '⏰ HourlyArb> '
        });
        
        // 设置事件监听
        this.setupEventListeners();
        
        this.showWelcome();
        this.rl.prompt();
    }
    
    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        this.rl.on('line', async (input) => {
            await this.handleCommand(input.trim());
            this.rl.prompt();
        });
        
        this.rl.on('close', () => {
            this.exit();
        });
        
        process.on('SIGINT', () => {
            console.log('\n收到中断信号，正在安全退出...');
            this.exit();
        });
    }
    
    /**
     * 显示欢迎信息
     */
    showWelcome() {
        console.log('\n📋 可用命令:');
        console.log('  init    - 初始化策略');
        console.log('  start   - 启动策略');
        console.log('  stop    - 停止策略');
        console.log('  status  - 显示状态');
        console.log('  scan    - 手动扫描');
        console.log('  help    - 显示帮助');
        console.log('  exit    - 退出工具');
        console.log('\n输入命令开始使用...\n');
    }
    
    /**
     * 处理命令
     */
    async handleCommand(input) {
        if (!input) {
            return;
        }
        
        const parts = input.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        if (this.commands[command]) {
            try {
                await this.commands[command](args);
            } catch (error) {
                console.log(`❌ 命令执行失败: ${error.message}`);
            }
        } else {
            console.log(`❓ 未知命令: ${command}. 输入 "help" 查看可用命令`);
        }
    }
    
    /**
     * 显示帮助信息
     */
    showHelp() {
        console.log('\n📚 每小时套利策略管理工具帮助');
        console.log('─'.repeat(50));
        console.log('🚀 策略控制:');
        console.log('  init                     - 初始化API客户端和策略');
        console.log('  start                    - 启动套利策略');
        console.log('  stop                     - 停止套利策略');
        console.log('  scan                     - 手动触发市场扫描');
        console.log('');
        console.log('📊 信息查看:');
        console.log('  status                   - 显示策略运行状态');
        console.log('  config                   - 显示策略配置');
        console.log('  stats                    - 显示执行统计');
        console.log('  positions                - 显示活跃仓位');
        console.log('  markets                  - 显示每小时市场');
        console.log('');
        console.log('🧪 测试功能:');
        console.log('  test                     - 运行策略测试');
        console.log('');
        console.log('🛠️ 其他:');
        console.log('  clear                    - 清屏');
        console.log('  help, h                  - 显示此帮助');
        console.log('  exit, quit               - 退出工具');
        console.log('─'.repeat(50));
    }
    
    /**
     * 初始化策略
     */
    async initializeStrategy() {
        if (this.apiClient && this.strategy) {
            console.log('⚠️ 策略已初始化');
            return;
        }
        
        try {
            console.log('🔧 初始化API客户端...');
            this.apiClient = new LimitlessApiClient();
            
            console.log('⚙️ 配置策略参数...');
            const config = {
                arbitrageAmount: 10,
                minPriceThreshold: 0.90,
                maxPriceThreshold: 0.985,
                settlementBuffer: 10 * 60 * 1000,
                scanInterval: 60000,
                maxConcurrentPositions: 5
            };
            
            console.log('🎯 创建策略实例...');
            this.strategy = new HourlyArbitrageStrategy(this.apiClient, config);
            this.monitor = HourlyArbitrageMonitor.getInstance(this.apiClient, config);
            
            // 设置事件监听
            this.setupStrategyListeners();
            
            console.log('✅ 策略初始化完成');
            console.log(`   套利金额: ${config.arbitrageAmount} USDC`);
            console.log(`   价格区间: ${config.minPriceThreshold * 100}% - ${config.maxPriceThreshold * 100}%`);
            console.log(`   结算缓冲: ${config.settlementBuffer / 60000} 分钟`);
            
        } catch (error) {
            console.log(`❌ 初始化失败: ${error.message}`);
        }
    }
    
    /**
     * 设置策略事件监听
     */
    setupStrategyListeners() {
        this.strategy.on('arbitrageTradeExecuted', (data) => {
            console.log(`\n🎯 套利交易执行:`);
            console.log(`   市场: ${data.market.title.substring(0, 50)}...`);
            console.log(`   方向: ${data.opportunity.side.toUpperCase()}`);
            console.log(`   价格: ${(data.opportunity.price * 100).toFixed(1)}%`);
            console.log(`   金额: ${data.opportunity.arbitrageAmount} USDC`);
            console.log(`   预期收益: ${data.opportunity.expectedReturn.toFixed(2)} USDC`);
            this.rl.prompt();
        });
        
        this.strategy.on('positionSettled', (data) => {
            console.log(`\n📊 仓位结算:`);
            console.log(`   结果: ${data.settlementResult.isWin ? '✅ 获胜' : '❌ 失败'}`);
            console.log(`   实际收益: ${data.settlementResult.actualReturn.toFixed(2)} USDC`);
            this.rl.prompt();
        });
        
        this.strategy.on('arbitrageTradeFailed', (data) => {
            console.log(`\n❌ 套利交易失败: ${data.error.message}`);
            this.rl.prompt();
        });
    }
    
    /**
     * 启动策略
     */
    async startStrategy() {
        if (!this.strategy) {
            console.log('⚠️ 请先初始化策略 (使用 "init" 命令)');
            return;
        }
        
        if (this.isRunning) {
            console.log('⚠️ 策略已在运行中');
            return;
        }
        
        try {
            console.log('🚀 启动每小时套利策略...');
            await this.strategy.initialize();
            this.isRunning = true;
            console.log('✅ 策略启动成功');
        } catch (error) {
            console.log(`❌ 启动失败: ${error.message}`);
        }
    }
    
    /**
     * 停止策略
     */
    async stopStrategy() {
        if (!this.isRunning) {
            console.log('⚠️ 策略未运行');
            return;
        }
        
        try {
            console.log('🛑 停止每小时套利策略...');
            await this.strategy.stop();
            this.isRunning = false;
            console.log('✅ 策略已停止');
        } catch (error) {
            console.log(`❌ 停止失败: ${error.message}`);
        }
    }
    
    /**
     * 显示状态
     */
    showStatus() {
        if (!this.strategy) {
            console.log('⚠️ 策略未初始化');
            return;
        }
        
        const status = this.strategy.getStatus();
        
        console.log('\n📊 策略状态:');
        console.log('─'.repeat(40));
        console.log(`策略名称: ${status.strategyName}`);
        console.log(`运行状态: ${status.isRunning ? '🟢 运行中' : '🔴 已停止'}`);
        console.log(`使用全局监控器: ${status.isUsingGlobalMonitor ? '是' : '否'}`);
        console.log(`活跃仓位: ${status.activePositions}`);
        console.log(`已处理市场: ${status.processedMarkets}`);
        
        if (status.stats.lastScanTime) {
            const lastScan = new Date(status.stats.lastScanTime);
            console.log(`上次扫描: ${lastScan.toLocaleString()}`);
        }
        console.log('─'.repeat(40));
    }
    
    /**
     * 手动触发扫描
     */
    async triggerScan() {
        if (!this.strategy) {
            console.log('⚠️ 策略未初始化');
            return;
        }
        
        if (!this.isRunning) {
            console.log('⚠️ 策略未运行');
            return;
        }
        
        try {
            console.log('🔍 手动触发市场扫描...');
            await this.strategy.triggerScan();
            console.log('✅ 扫描完成');
        } catch (error) {
            console.log(`❌ 扫描失败: ${error.message}`);
        }
    }
    
    /**
     * 显示配置
     */
    showConfig() {
        if (!this.strategy) {
            console.log('⚠️ 策略未初始化');
            return;
        }
        
        const status = this.strategy.getStatus();
        const config = status.config;
        
        console.log('\n⚙️ 策略配置:');
        console.log('─'.repeat(40));
        console.log(`套利金额: ${config.arbitrageAmount} USDC`);
        console.log(`最低价格阈值: ${(config.minPriceThreshold * 100).toFixed(1)}%`);
        console.log(`最高价格阈值: ${(config.maxPriceThreshold * 100).toFixed(1)}%`);
        console.log(`结算缓冲时间: ${config.settlementBuffer / 60000} 分钟`);
        console.log(`扫描间隔: ${config.scanInterval / 1000} 秒`);
        console.log(`最大并发仓位: ${config.maxConcurrentPositions}`);
        console.log('─'.repeat(40));
    }
    
    /**
     * 显示统计信息
     */
    showStats() {
        if (!this.strategy) {
            console.log('⚠️ 策略未初始化');
            return;
        }
        
        const status = this.strategy.getStatus();
        const stats = status.stats;
        
        console.log('\n📈 执行统计:');
        console.log('─'.repeat(40));
        console.log(`总扫描次数: ${stats.totalScans}`);
        console.log(`发现市场数: ${stats.marketsFound}`);
        console.log(`检测机会数: ${stats.opportunitiesDetected}`);
        console.log(`开仓数量: ${stats.positionsOpened}`);
        console.log(`结算数量: ${stats.positionsSettled}`);
        console.log(`总收益: ${stats.totalProfit.toFixed(2)} USDC`);
        
        if (stats.positionsOpened > 0) {
            const winRate = (stats.positionsSettled / stats.positionsOpened * 100).toFixed(1);
            console.log(`胜率: ${winRate}%`);
        }
        
        if (stats.lastScanTime) {
            const lastScan = new Date(stats.lastScanTime);
            console.log(`上次扫描: ${lastScan.toLocaleString()}`);
        }
        console.log('─'.repeat(40));
    }
    
    /**
     * 显示活跃仓位
     */
    showPositions() {
        if (!this.strategy) {
            console.log('⚠️ 策略未初始化');
            return;
        }
        
        const status = this.strategy.getStatus();
        
        console.log('\n💼 活跃仓位:');
        console.log('─'.repeat(80));
        
        if (status.positionDetails.length === 0) {
            console.log('暂无活跃仓位');
            return;
        }
        
        status.positionDetails.forEach((pos, index) => {
            console.log(`${index + 1}. ${pos.marketTitle}`);
            console.log(`   方向: ${pos.side.toUpperCase()}`);
            console.log(`   价格: ${pos.price}`);
            console.log(`   投资: ${pos.investment} USDC`);
            console.log(`   预期收益: ${pos.expectedReturn} USDC`);
            console.log(`   距离结算: ${pos.timeToSettlement} 分钟`);
            console.log(`   状态: ${pos.status}`);
            console.log('');
        });
        console.log('─'.repeat(80));
    }
    
    /**
     * 显示每小时市场
     */
    async showHourlyMarkets() {
        if (!this.apiClient) {
            console.log('⚠️ API客户端未初始化');
            return;
        }
        
        try {
            console.log('🔍 搜索每小时结算市场...');
            
            const markets = await this.apiClient.getMarkets();
            const hourlyMarkets = markets.filter(market => 
                market.tags && 
                market.tags.some(tag => tag.toLowerCase().includes('hourly'))
            );
            
            console.log('\n🕐 每小时结算市场:');
            console.log('─'.repeat(80));
            
            if (hourlyMarkets.length === 0) {
                console.log('未发现每小时结算市场');
                return;
            }
            
            hourlyMarkets.forEach((market, index) => {
                console.log(`${index + 1}. ${market.title}`);
                console.log(`   ID: ${market.id}`);
                console.log(`   标签: ${market.tags.join(', ')}`);
                console.log(`   状态: ${market.expired ? '已过期' : '有效'}`);
                console.log(`   过期: ${market.expired ? '是' : '否'}`);
                if (market.endDate) {
                    console.log(`   结束时间: ${new Date(market.endDate).toLocaleString()}`);
                }
                console.log('');
            });
            
            console.log(`总计: ${hourlyMarkets.length} 个每小时结算市场`);
            console.log('─'.repeat(80));
            
        } catch (error) {
            console.log(`❌ 获取市场失败: ${error.message}`);
        }
    }
    
    /**
     * 运行测试
     */
    async runTests() {
        console.log('🧪 运行每小时套利策略测试...');
        
        try {
            // 动态导入测试模块
            const { runAllTests } = await import('../tests/test-hourly-arbitrage.js');
            const success = await runAllTests();
            
            if (success) {
                console.log('✅ 所有测试通过');
            } else {
                console.log('❌ 部分测试失败');
            }
        } catch (error) {
            console.log(`❌ 测试运行失败: ${error.message}`);
        }
    }
    
    /**
     * 清屏
     */
    clearScreen() {
        console.clear();
        this.showWelcome();
    }
    
    /**
     * 退出工具
     */
    async exit() {
        console.log('\n👋 正在退出工具...');
        
        try {
            if (this.isRunning && this.strategy) {
                await this.stopStrategy();
            }
            
            if (this.monitor) {
                await this.monitor.stop();
            }
            
            if (this.rl) {
                this.rl.close();
            }
            
            console.log('✅ 工具已安全退出');
            process.exit(0);
            
        } catch (error) {
            console.log(`❌ 退出时出错: ${error.message}`);
            process.exit(1);
        }
    }
}

// 主函数
async function main() {
    const tool = new HourlyArbitrageToolCLI();
    await tool.start();
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('❌ 工具启动失败:', error.message);
        process.exit(1);
    });
}

export default HourlyArbitrageToolCLI;