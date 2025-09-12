#!/usr/bin/env node

/**
 * 检查账户策略配置工具
 * 快速验证账户配置和策略设置
 */

import fs from 'fs/promises';
import path from 'path';

async function checkAccountStrategies() {
    console.log('🔍 检查账户策略配置');
    console.log('='.repeat(50));
    
    try {
        // 检查账户配置文件
        const accountsPath = '.kiro/state/accounts.json';
        
        try {
            const accountsData = await fs.readFile(accountsPath, 'utf8');
            const accounts = JSON.parse(accountsData);
            
            console.log(`📂 找到账户配置文件: ${accountsPath}`);
            console.log(`📊 账户总数: ${Object.keys(accounts).length}`);
            
            // 分析每个账户
            let activeAccounts = 0;
            let totalStrategies = 0;
            let accountsWithStrategies = 0;
            
            console.log('\n👤 账户详情:');
            console.log('-'.repeat(50));
            
            for (const [accountId, account] of Object.entries(accounts)) {
                const statusIcon = account.isActive ? '🟢' : '🔴';
                const statusText = account.isActive ? '活跃' : '停用';
                
                console.log(`\n${statusIcon} ${account.name} (${accountId})`);
                console.log(`   状态: ${statusText}`);
                console.log(`   余额: ${account.balance} USDC`);
                console.log(`   最大风险: ${account.maxRisk} USDC`);
                console.log(`   创建时间: ${new Date(account.createdAt).toLocaleString()}`);
                
                if (account.strategies && account.strategies.length > 0) {
                    console.log(`   配置策略: ${account.strategies.join(', ')}`);
                    totalStrategies += account.strategies.length;
                    accountsWithStrategies++;
                } else {
                    console.log(`   配置策略: 无`);
                }
                
                if (account.isActive) {
                    activeAccounts++;
                }
                
                // 检查私钥文件
                const keyPath = `.kiro/keys/${accountId}.key`;
                try {
                    await fs.access(keyPath);
                    console.log(`   私钥文件: ✅ 存在`);
                } catch {
                    console.log(`   私钥文件: ❌ 缺失`);
                }
            }
            
            // 统计摘要
            console.log('\n📊 统计摘要:');
            console.log('-'.repeat(50));
            console.log(`总账户数: ${Object.keys(accounts).length}`);
            console.log(`活跃账户数: ${activeAccounts}`);
            console.log(`停用账户数: ${Object.keys(accounts).length - activeAccounts}`);
            console.log(`配置了策略的账户数: ${accountsWithStrategies}`);
            console.log(`总策略配置数: ${totalStrategies}`);
            
            // 策略类型统计
            const strategyCount = {};
            for (const account of Object.values(accounts)) {
                if (account.strategies) {
                    for (const strategy of account.strategies) {
                        strategyCount[strategy] = (strategyCount[strategy] || 0) + 1;
                    }
                }
            }
            
            if (Object.keys(strategyCount).length > 0) {
                console.log('\n🎯 策略类型分布:');
                console.log('-'.repeat(50));
                for (const [strategy, count] of Object.entries(strategyCount)) {
                    console.log(`${strategy}: ${count} 个账户`);
                }
            }
            
            // 问题检查
            console.log('\n🔍 问题检查:');
            console.log('-'.repeat(50));
            
            let hasIssues = false;
            
            // 检查活跃账户但无策略
            const activeAccountsWithoutStrategies = Object.values(accounts).filter(
                account => account.isActive && (!account.strategies || account.strategies.length === 0)
            );
            
            if (activeAccountsWithoutStrategies.length > 0) {
                hasIssues = true;
                console.log(`⚠️ ${activeAccountsWithoutStrategies.length} 个活跃账户未配置策略:`);
                activeAccountsWithoutStrategies.forEach(account => {
                    console.log(`   - ${account.name} (${account.id})`);
                });
            }
            
            // 检查配置了策略但账户停用
            const inactiveAccountsWithStrategies = Object.values(accounts).filter(
                account => !account.isActive && account.strategies && account.strategies.length > 0
            );
            
            if (inactiveAccountsWithStrategies.length > 0) {
                hasIssues = true;
                console.log(`⚠️ ${inactiveAccountsWithStrategies.length} 个停用账户配置了策略:`);
                inactiveAccountsWithStrategies.forEach(account => {
                    console.log(`   - ${account.name} (${account.id}): ${account.strategies.join(', ')}`);
                });
            }
            
            // 检查私钥文件缺失
            const accountsWithMissingKeys = [];
            for (const [accountId, account] of Object.entries(accounts)) {
                const keyPath = `.kiro/keys/${accountId}.key`;
                try {
                    await fs.access(keyPath);
                } catch {
                    accountsWithMissingKeys.push(account);
                }
            }
            
            if (accountsWithMissingKeys.length > 0) {
                hasIssues = true;
                console.log(`❌ ${accountsWithMissingKeys.length} 个账户缺失私钥文件:`);
                accountsWithMissingKeys.forEach(account => {
                    console.log(`   - ${account.name} (${account.id})`);
                });
            }
            
            if (!hasIssues) {
                console.log('✅ 未发现配置问题');
            }
            
            // 建议
            console.log('\n💡 建议:');
            console.log('-'.repeat(50));
            
            if (activeAccounts === 0) {
                console.log('📝 没有活跃账户，请激活至少一个账户:');
                console.log('   npm run account activate <accountId>');
            } else if (accountsWithStrategies === 0) {
                console.log('📝 没有账户配置策略，请为账户配置策略:');
                console.log('   npm run account strategies <accountId> "NewMarketSplit,LPMaking"');
            } else {
                console.log('🚀 配置看起来正常，可以启动系统:');
                console.log('   npm run start');
                console.log('   npm run demo:account-fix  # 查看修复演示');
            }
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('❌ 未找到账户配置文件');
                console.log('📝 请先添加账户:');
                console.log('   npm run account add <accountId> --private-key <key> --strategies "NewMarketSplit,LPMaking"');
            } else {
                console.error('❌ 读取账户配置文件失败:', error.message);
            }
        }
        
        // 检查密钥目录
        console.log('\n🔐 密钥文件检查:');
        console.log('-'.repeat(50));
        
        try {
            const keysDir = '.kiro/keys';
            const keyFiles = await fs.readdir(keysDir);
            console.log(`密钥目录: ${keysDir}`);
            console.log(`密钥文件数: ${keyFiles.length}`);
            
            if (keyFiles.length > 0) {
                console.log('密钥文件列表:');
                keyFiles.forEach(file => {
                    console.log(`   - ${file}`);
                });
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('❌ 密钥目录不存在');
            } else {
                console.error('❌ 检查密钥目录失败:', error.message);
            }
        }
        
    } catch (error) {
        console.error('❌ 检查过程中出错:', error.message);
        process.exit(1);
    }
}

// 运行检查
if (import.meta.url === `file://${process.argv[1]}`) {
    checkAccountStrategies();
}

export default checkAccountStrategies;