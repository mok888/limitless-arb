#!/usr/bin/env node

/**
 * 安全账户设置工具 - 将账户数据分离为状态文件和加密私钥文件
 */

import KeyManager from '../src/managers/key-manager.js';
import fs from 'fs/promises';
import path from 'path';

async function setupSecureAccounts() {
    console.log('🔐 安全账户设置工具');
    console.log('='.repeat(50));

    try {
        // 创建密钥管理器
        const keyManager = new KeyManager();
        await keyManager.initialize();

        // 定义测试账户数据
        const accountsData = {
            account1: {
                id: 'account1',
                name: '账户1',
                privateKey: '0x740739a0dbe5375117384c44a953b119fb1c96fdeab541c71693990d9656b28d',
                balance: 0,
                maxRisk: 1000,
                strategies: ['NewMarketSplit', 'LPMaking'],
                isActive: true,
                createdAt: 1754986456805
            },
            account2: {
                id: 'account2',
                name: '账户2',
                privateKey: '0x65a64a4fedb51e46ee36816cd7a87cd54133e3202c06a90b99c9ff00343f4c2d',
                balance: 0,
                maxRisk: 500,
                strategies: ['NewMarketSplit'],
                isActive: true,
                createdAt: 1754986456816
            },
            account3: {
                id: 'account3',
                name: '账户3',
                privateKey: '0xc862fbd4d986fd4937bb614570d006221e229f00cb18f61cf70e83ba54a21384',
                balance: 0,
                maxRisk: 800,
                strategies: ['LPMaking', 'HourlyArbitrage'],
                isActive: true,
                createdAt: 1754986456821
            }
        };

        console.log('📝 处理账户数据...');

        // 分离私钥和状态数据
        const privateKeys = {};
        const accountStates = {};

        for (const [accountId, accountData] of Object.entries(accountsData)) {
            // 提取私钥
            privateKeys[accountId] = accountData.privateKey;

            // 创建不包含私钥的状态数据
            const { privateKey, ...stateData } = accountData;
            accountStates[accountId] = stateData;

            console.log(`✅ 处理账户: ${accountId} (${accountData.name})`);
        }

        // 保存私钥到加密文件
        console.log('\n🔐 保存私钥到加密文件...');
        await keyManager.saveKeys(privateKeys);

        // 保存状态数据到JSON文件
        console.log('💾 保存账户状态到JSON文件...');
        const stateDir = '.kiro/state';
        await fs.mkdir(stateDir, { recursive: true });
        
        const stateFile = path.join(stateDir, 'accounts.json');
        await fs.writeFile(stateFile, JSON.stringify(accountStates, null, 2));

        console.log('\n✅ 安全账户设置完成!');
        console.log('\n📁 文件结构:');
        console.log('├── .kiro/secure/keys.enc     (加密的私钥文件)');
        console.log('└── .kiro/state/accounts.json (账户状态文件)');

        console.log('\n🔍 验证设置...');
        
        // 验证私钥文件
        const loadedKeys = await keyManager.loadKeys();
        console.log(`✅ 私钥文件验证: ${Object.keys(loadedKeys).length} 个账户`);

        // 验证状态文件
        const stateContent = await fs.readFile(stateFile, 'utf8');
        const loadedStates = JSON.parse(stateContent);
        console.log(`✅ 状态文件验证: ${Object.keys(loadedStates).length} 个账户`);

        // 显示账户摘要
        console.log('\n👤 账户摘要:');
        for (const [accountId, state] of Object.entries(loadedStates)) {
            const hasKey = loadedKeys[accountId] ? '🔑' : '❌';
            console.log(`   ${accountId}: ${state.name} ${hasKey}`);
            console.log(`     策略: ${state.strategies.join(', ')}`);
            console.log(`     风险限制: ${state.maxRisk} USDC`);
        }

        console.log('\n💡 使用说明:');
        console.log('1. 私钥已加密存储在 .kiro/secure/keys.enc');
        console.log('2. 账户状态存储在 .kiro/state/accounts.json');
        console.log('3. 系统启动时会自动加载这两个文件');
        console.log('4. 私钥文件使用AES-256-GCM加密');

    } catch (error) {
        console.error('❌ 设置失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 运行设置工具
if (import.meta.url === `file://${process.argv[1]}`) {
    setupSecureAccounts().catch(console.error);
}

export { setupSecureAccounts };