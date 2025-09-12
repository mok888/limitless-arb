#!/usr/bin/env node

/**
 * 启动全局协调系统脚本
 * 替代原有的多策略系统，使用全局协调架构避免重复运行
 */

import GlobalCoordinationMain from '../src/global-coordination-main.js';

async function startGlobalCoordination() {
    console.log('🚀 启动全局协调系统...');
    console.log('=====================================');
    console.log('💡 使用全局协调架构，避免重复运行问题！');
    console.log('✅ 全局任务只运行一个实例');
    console.log('✅ 共享发现结果，提高效率');
    console.log('✅ 每个账户可以有不同配置');
    console.log('=====================================\n');
    
    try {
        const system = new GlobalCoordinationMain();
        
        // 初始化系统
        await system.initialize();
        
        // 启动系统
        await system.start();
        
        // 设置优雅关闭处理
        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 收到 ${signal} 信号，正在安全关闭系统...`);
            
            try {
                await system.shutdown();
                console.log('✅ 系统已安全关闭');
                process.exit(0);
            } catch (error) {
                console.error('❌ 关闭系统时出错:', error.message);
                process.exit(1);
            }
        };
        
        // 监听关闭信号
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        
        // 设置定期状态报告
        setInterval(async () => {
            try {
                console.log('\n📊 定期状态报告:');
                await system.printSystemStatus();
            } catch (error) {
                console.error('❌ 状态报告失败:', error.message);
            }
        }, 10 * 60 * 1000); // 每10分钟报告一次
        
        // 保持运行
        console.log('💡 系统正在运行，按 Ctrl+C 停止');
        console.log('📊 每10分钟会显示一次状态报告');
        
        // 防止进程退出
        process.stdin.resume();
        
    } catch (error) {
        console.error('❌ 系统启动失败:', error.message);
        console.error('错误详情:', error.stack);
        process.exit(1);
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的Promise拒绝:', reason);
    console.error('Promise:', promise);
    process.exit(1);
});

// 启动系统
startGlobalCoordination();