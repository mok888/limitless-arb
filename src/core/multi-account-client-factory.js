/**
 * 多账户API客户端工厂 - 为每个账户创建独立的API客户端实例
 */

import LimitlessApiClient from './api-client.js';

class MultiAccountClientFactory {
    constructor() {
        this.clients = new Map(); // 账户ID -> API客户端实例
    }

    /**
     * 为账户创建API客户端
     * @param {string} accountId - 账户ID
     * @param {Object} accountConfig - 账户配置
     */
    createClient(accountId, accountConfig) {
        if (this.clients.has(accountId)) {
            console.log(`⚠️ 账户 ${accountId} 的API客户端已存在，将被替换`);
        }

        // 验证账户配置
        if (!accountConfig.privateKey) {
            throw new Error(`账户 ${accountId} 缺少私钥配置`);
        }

        console.log(`🔧 为账户 ${accountId} 创建API客户端...`);

        // 创建客户端实例
        const client = new LimitlessApiClient({
            id: accountId,
            privateKey: accountConfig.privateKey,
            name: accountConfig.name || accountId
        });

        this.clients.set(accountId, client);

        console.log(`✅ 账户 ${accountId} 的API客户端创建成功`);
        return client;
    }

    /**
     * 获取账户的API客户端
     * @param {string} accountId - 账户ID
     */
    getClient(accountId) {
        const client = this.clients.get(accountId);
        if (!client) {
            throw new Error(`账户 ${accountId} 的API客户端不存在`);
        }
        return client;
    }

    /**
     * 检查账户是否有API客户端
     * @param {string} accountId - 账户ID
     */
    hasClient(accountId) {
        return this.clients.has(accountId);
    }

    /**
     * 移除账户的API客户端
     * @param {string} accountId - 账户ID
     */
    removeClient(accountId) {
        if (this.clients.has(accountId)) {
            this.clients.delete(accountId);
            console.log(`🗑️ 已移除账户 ${accountId} 的API客户端`);
            return true;
        }
        return false;
    }

    /**
     * 获取所有客户端
     */
    getAllClients() {
        return Array.from(this.clients.entries()).map(([accountId, client]) => ({
            accountId,
            client
        }));
    }

    /**
     * 批量初始化账户钱包
     */
    async initializeAllWallets() {
        console.log(`🔑 批量初始化 ${this.clients.size} 个账户的钱包...`);
        
        const results = [];
        for (const [accountId, client] of this.clients.entries()) {
            try {
                await client.initializeWallet();
                results.push({ accountId, success: true });
            } catch (error) {
                console.error(`❌ 账户 ${accountId} 钱包初始化失败: ${error.message}`);
                results.push({ accountId, success: false, error: error.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`✅ 钱包初始化完成: ${successCount}/${results.length} 成功`);
        
        return results;
    }

    /**
     * 批量执行账户登录
     */
    async loginAllAccounts() {
        console.log(`🔐 批量登录 ${this.clients.size} 个账户...`);
        
        const results = [];
        for (const [accountId, client] of this.clients.entries()) {
            try {
                const loginResult = await client.performLogin();
                results.push({ 
                    accountId, 
                    success: loginResult.success,
                    walletAddress: loginResult.walletAddress,
                    userId: loginResult.userId
                });
            } catch (error) {
                console.error(`❌ 账户 ${accountId} 登录失败: ${error.message}`);
                results.push({ accountId, success: false, error: error.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`✅ 账户登录完成: ${successCount}/${results.length} 成功`);
        
        return results;
    }

    /**
     * 获取所有账户的钱包地址
     */
    async getAllWalletAddresses() {
        const addresses = new Map();
        
        for (const [accountId, client] of this.clients.entries()) {
            try {
                if (!client.walletAddress) {
                    await client.initializeWallet();
                }
                addresses.set(accountId, client.walletAddress);
            } catch (error) {
                console.error(`❌ 获取账户 ${accountId} 钱包地址失败: ${error.message}`);
                addresses.set(accountId, null);
            }
        }

        return addresses;
    }

    /**
     * 获取工厂状态摘要
     */
    async getFactoryStatus() {
        const addresses = await this.getAllWalletAddresses();
        const clientStatuses = [];

        for (const [accountId, client] of this.clients.entries()) {
            clientStatuses.push({
                accountId: accountId,
                walletAddress: addresses.get(accountId),
                isAuthenticated: client.isAuthenticated,
                userId: client.userId,
                hasWallet: !!client.wallet
            });
        }

        return {
            totalClients: this.clients.size,
            authenticatedClients: clientStatuses.filter(c => c.isAuthenticated).length,
            clientStatuses: clientStatuses,
            timestamp: Date.now()
        };
    }

    /**
     * 清理所有客户端
     */
    clear() {
        console.log(`🧹 清理所有 ${this.clients.size} 个API客户端...`);
        this.clients.clear();
        console.log('✅ 所有API客户端已清理');
    }
}

export default MultiAccountClientFactory;