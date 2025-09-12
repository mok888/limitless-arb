#!/usr/bin/env node

/**
 * 状态持久化测试工具
 * 测试账户状态的保存和恢复功能
 */

import StateManager from '../src/core/state-manager.js';
import { ethers } from 'ethers';

class StatePersistenceTest {
    constructor() {
        this.stateManager = new StateManager();
    }

    async runTests() {
        console.log('🧪 开始状态持久化测试...\n');

        try {
            // 测试1: 初始化状态管理器
            await this.testInitialization();

            // 测试2: 添加账户
            await this.testAddAccounts();

            // 测试3: 更新账户状态
            await this.testUpdateAccounts();

            // 测试4: 保存状态
            await this.testSaveState();

            // 测试5: 清理并重新加载
            await this.testReloadState();

            // 测试6: 执行统计
            await this.testExecutionStats();

            console.log('\n✅ 所有测试通过！');

        } catch (error) {
            console.error('\n❌ 测试失败:', error.message);
            console.error(error.stack);
        } finally {
            await this.cleanup();
        }
    }

    async testInitialization() {
        console.log('📋 测试1: 初始化状态管理器');
        
        await this.stateManager.initialize();
        
        const summary = this.stateManager.getStateSummary();
        console.log(`   ✅ 状态管理器初始化成功`);
        console.log(`   📊 账户数: ${summary.accountsCount}`);
        console.log(`   ⏰ 自动保存: ${summary.autoSaveEnabled ? '启用' : '禁用'}`);
    }

    async testAddAccounts() {
        console.log('\n📋 测试2: 添加测试账户');

        // 创建测试账户
        const testAccounts = [
            {
                id: 'test-account-1',
                name: '测试账户1',
                walletAddress: ethers.Wallet.createRandom().address,
                balance: 1000,
                maxRisk: 500,
                strategies: ['NewMarketSplit'],
                isActive: true,
                createdAt: Date.now()
            },
            {
                id: 'test-account-2',
                name: '测试账户2',
                walletAddress: ethers.Wallet.createRandom().address,
                balance: 2000,
                maxRisk: 800,
                strategies: ['LPMaking'],
                isActive: false,
                createdAt: Date.now()
            }
        ];

        for (const account of testAccounts) {
            await this.stateManager.addAccount(account.id, account);
            console.log(`   ✅ 添加账户: ${account.id} (${account.name})`);
        }

        const summary = this.stateManager.getStateSummary();
        console.log(`   📊 当前账户数: ${summary.accountsCount}`);
    }

    async testUpdateAccounts() {
        console.log('\n📋 测试3: 更新账户状态');

        // 更新账户1的余额
        await this.stateManager.updateAccount('test-account-1', {
            balance: 1500,
            lastBalanceUpdate: Date.now()
        });
        console.log('   ✅ 更新账户1余额');

        // 激活账户2
        await this.stateManager.updateAccount('test-account-2', {
            isActive: true
        });
        console.log('   ✅ 激活账户2');

        // 验证更新
        const account1 = this.stateManager.getAccount('test-account-1');
        const account2 = this.stateManager.getAccount('test-account-2');
        
        console.log(`   📊 账户1余额: ${account1.balance}`);
        console.log(`   📊 账户2状态: ${account2.isActive ? '活跃' : '停用'}`);
    }

    async testSaveState() {
        console.log('\n📋 测试4: 保存状态');

        await this.stateManager.saveState();
        console.log('   ✅ 状态保存成功');

        const summary = this.stateManager.getStateSummary();
        if (summary.lastSaved) {
            const lastSaved = new Date(summary.lastSaved);
            console.log(`   📅 保存时间: ${lastSaved.toLocaleString()}`);
        }
    }

    async testReloadState() {
        console.log('\n📋 测试5: 重新加载状态');

        // 创建新的状态管理器实例
        const newStateManager = new StateManager();
        await newStateManager.initialize();

        const accounts = newStateManager.getAccounts();
        console.log(`   ✅ 重新加载了 ${accounts.size} 个账户`);

        // 验证账户数据
        for (const [accountId, account] of accounts.entries()) {
            console.log(`   📋 账户: ${accountId}`);
            console.log(`      名称: ${account.name}`);
            console.log(`      地址: ${account.walletAddress}`);
            console.log(`      余额: ${account.balance}`);
            console.log(`      状态: ${account.isActive ? '活跃' : '停用'}`);
        }

        await newStateManager.shutdown();
    }

    async testExecutionStats() {
        console.log('\n📋 测试6: 执行统计');

        // 模拟执行统计更新
        const stats = {
            totalExecutions: 10,
            successfulExecutions: 8,
            failedExecutions: 2,
            lastExecutionTime: Date.now(),
            activeExecutions: 1
        };

        await this.stateManager.updateExecutionStats(stats);
        console.log('   ✅ 更新执行统计');

        const loadedStats = this.stateManager.getExecutionStats();
        console.log(`   📊 总执行次数: ${loadedStats.totalExecutions}`);
        console.log(`   📊 成功次数: ${loadedStats.successfulExecutions}`);
        console.log(`   📊 失败次数: ${loadedStats.failedExecutions}`);
        console.log(`   📊 成功率: ${((loadedStats.successfulExecutions / loadedStats.totalExecutions) * 100).toFixed(1)}%`);
    }

    async cleanup() {
        console.log('\n🧹 清理测试数据...');

        try {
            // 移除测试账户
            await this.stateManager.removeAccount('test-account-1');
            await this.stateManager.removeAccount('test-account-2');
            console.log('   ✅ 测试账户已移除');

            // 关闭状态管理器
            await this.stateManager.shutdown();
            console.log('   ✅ 状态管理器已关闭');

        } catch (error) {
            console.warn('   ⚠️ 清理过程中出现警告:', error.message);
        }
    }

    async demonstrateStatePersistence() {
        console.log('\n🎯 状态持久化演示');
        console.log('─'.repeat(50));

        // 创建第一个状态管理器实例
        console.log('1️⃣ 创建第一个状态管理器实例...');
        const stateManager1 = new StateManager();
        await stateManager1.initialize();

        // 添加一些数据
        const demoAccount = {
            id: 'demo-account',
            name: '演示账户',
            walletAddress: ethers.Wallet.createRandom().address,
            balance: 5000,
            maxRisk: 1000,
            strategies: ['NewMarketSplit', 'LPMaking'],
            isActive: true,
            createdAt: Date.now()
        };

        await stateManager1.addAccount(demoAccount.id, demoAccount);
        console.log(`   ✅ 添加演示账户: ${demoAccount.name}`);

        // 保存状态
        await stateManager1.saveState();
        console.log('   💾 状态已保存');

        // 关闭第一个实例
        await stateManager1.shutdown();
        console.log('   🔒 第一个实例已关闭');

        // 创建第二个状态管理器实例
        console.log('\n2️⃣ 创建第二个状态管理器实例...');
        const stateManager2 = new StateManager();
        await stateManager2.initialize();

        // 验证数据是否恢复
        const restoredAccount = stateManager2.getAccount('demo-account');
        if (restoredAccount) {
            console.log('   ✅ 成功恢复账户数据:');
            console.log(`      ID: ${restoredAccount.id}`);
            console.log(`      名称: ${restoredAccount.name}`);
            console.log(`      地址: ${restoredAccount.walletAddress}`);
            console.log(`      余额: ${restoredAccount.balance}`);
            console.log(`      策略: ${restoredAccount.strategies.join(', ')}`);
        } else {
            console.log('   ❌ 未能恢复账户数据');
        }

        // 清理演示数据
        await stateManager2.removeAccount('demo-account');
        await stateManager2.shutdown();
        console.log('   🧹 演示数据已清理');

        console.log('\n🎉 状态持久化演示完成！');
    }
}

// 运行测试
async function runTests() {
    const tester = new StatePersistenceTest();
    
    console.log('选择测试模式:');
    console.log('1. 完整测试套件');
    console.log('2. 状态持久化演示');
    
    const mode = process.argv[2] || '1';
    
    if (mode === '2' || mode === 'demo') {
        await tester.demonstrateStatePersistence();
    } else {
        await tester.runTests();
    }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().catch(error => {
        console.error('❌ 测试运行失败:', error.message);
        process.exit(1);
    });
}

export default StatePersistenceTest;