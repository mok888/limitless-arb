#!/usr/bin/env node

/**
 * 策略配置验证工具
 * 验证 .env 文件中的策略配置参数
 */

import { validateConfigs, printConfigSummary, getAllStrategyConfigs } from '../src/config/strategy-config.js';

/**
 * 主函数
 */
async function main() {
    console.log('🔍 验证策略配置...\n');
    
    try {
        // 验证配置
        const errors = validateConfigs();
        
        if (errors.length > 0) {
            console.log('❌ 配置验证失败:');
            errors.forEach(error => {
                console.log(`   • ${error}`);
            });
            console.log('\n请检查您的 .env 文件并修正以上错误。');
            process.exit(1);
        }
        
        console.log('✅ 配置验证通过!\n');
        
        // 打印配置摘要
        printConfigSummary();
        
        // 显示详细配置
        if (process.argv.includes('--detailed')) {
            console.log('📋 详细配置信息:');
            console.log('================');
            const configs = getAllStrategyConfigs();
            console.log(JSON.stringify(configs, null, 2));
        }
        
        console.log('✅ 配置验证完成!');
        
    } catch (error) {
        console.error('❌ 配置验证过程中发生错误:', error.message);
        process.exit(1);
    }
}

// 运行主函数
main().catch(error => {
    console.error('❌ 程序执行失败:', error);
    process.exit(1);
});