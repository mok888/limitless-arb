/**
 * 代理管理器 - 负责代理的加载、轮换和管理
 * 使用 https-proxy-agent 提供更稳定的代理支持
 */

import fs from 'fs/promises';
import { HttpsProxyAgent } from 'https-proxy-agent';

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.currentIndex = 0;
        this.proxiesFile = 'proxies.txt';
        this.isLoaded = false;
    }

    /**
     * 从文件加载代理列表
     */
    async loadProxies() {
        try {
            // 检查代理文件是否存在
            try {
                await fs.access(this.proxiesFile);
            } catch (error) {
                console.log('📝 代理文件不存在，将不使用代理');
                this.proxies = [];
                this.isLoaded = true;
                return;
            }

            // 读取代理文件内容
            const content = await fs.readFile(this.proxiesFile, 'utf8');
            const lines = content.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));

            this.proxies = lines.map((line, index) => ({
                id: index + 1,
                url: line,
                isActive: true,
                errorCount: 0,
                lastUsed: null
            }));

            this.isLoaded = true;
            console.log(`🔗 成功加载 ${this.proxies.length} 个代理`);

        } catch (error) {
            console.error('❌ 加载代理文件失败:', error.message);
            this.proxies = [];
            this.isLoaded = true;
        }
    }

    /**
     * 确保代理已加载
     */
    async ensureLoaded() {
        if (!this.isLoaded) {
            await this.loadProxies();
        }
    }

    /**
     * 获取随机代理
     */
    async getRandomProxy() {
        await this.ensureLoaded();

        if (this.proxies.length === 0) {
            return null;
        }

        // 过滤出活跃的代理
        const activeProxies = this.proxies.filter(proxy => proxy.isActive);

        if (activeProxies.length === 0) {
            console.warn('⚠️ 没有可用的活跃代理');
            return null;
        }

        // 随机选择一个代理
        const randomIndex = Math.floor(Math.random() * activeProxies.length);
        const selectedProxy = activeProxies[randomIndex];

        // 更新使用时间
        selectedProxy.lastUsed = new Date();

        return selectedProxy;
    }

    /**
     * 获取下一个代理（轮换方式）
     */
    async getNextProxy() {
        await this.ensureLoaded();

        if (this.proxies.length === 0) {
            return null;
        }

        // 过滤出活跃的代理
        const activeProxies = this.proxies.filter(proxy => proxy.isActive);

        if (activeProxies.length === 0) {
            console.warn('⚠️ 没有可用的活跃代理');
            return null;
        }

        // 轮换选择代理
        const selectedProxy = activeProxies[this.currentIndex % activeProxies.length];
        this.currentIndex = (this.currentIndex + 1) % activeProxies.length;

        // 更新使用时间
        selectedProxy.lastUsed = new Date();

        return selectedProxy;
    }

    /**
     * 标记代理出错
     */
    markProxyError(proxyId) {
        const proxy = this.proxies.find(p => p.id === proxyId);
        if (proxy) {
            proxy.errorCount++;

            // 如果错误次数过多，暂时禁用代理
            if (proxy.errorCount >= 3) {
                proxy.isActive = false;
                console.warn(`⚠️ 代理 ${proxyId} 错误次数过多，已暂时禁用`);
            }
        }
    }

    /**
     * 重置代理错误计数
     */
    resetProxyErrors() {
        this.proxies.forEach(proxy => {
            proxy.errorCount = 0;
            proxy.isActive = true;
        });
        console.log('🔄 已重置所有代理的错误计数');
    }

    /**
     * 获取代理统计信息
     */
    getProxyStats() {
        const total = this.proxies.length;
        const active = this.proxies.filter(p => p.isActive).length;
        const inactive = total - active;
        const totalErrors = this.proxies.reduce((sum, p) => sum + p.errorCount, 0);

        return {
            total,
            active,
            inactive,
            totalErrors,
            proxies: this.proxies.map(p => ({
                id: p.id,
                isActive: p.isActive,
                errorCount: p.errorCount,
                lastUsed: p.lastUsed
            }))
        };
    }

    /**
     * 创建 https-proxy-agent 实例
     */
    createProxyAgent(proxyUrl) {
        try {
            // 使用 https-proxy-agent 创建代理实例
            const agent = new HttpsProxyAgent(proxyUrl);
            return agent;
        } catch (error) {
            console.error(`❌ 创建代理代理失败: ${proxyUrl}`, error.message);
            return null;
        }
    }

    /**
     * 创建带代理的axios配置
     */
    async createProxyConfig() {
        const proxy = await this.getRandomProxy();

        if (!proxy) {
            return {};
        }

        const proxyAgent = this.createProxyAgent(proxy.url);

        if (!proxyAgent) {
            this.markProxyError(proxy.id);
            return {};
        }

        return {
            httpsAgent: proxyAgent,
            httpAgent: proxyAgent, // 同时支持 HTTP 和 HTTPS
            proxyId: proxy.id
        };
    }

    /**
     * 为多个请求创建不同的代理配置
     */
    async createMultipleProxyConfigs(count) {
        await this.ensureLoaded();

        const configs = [];

        for (let i = 0; i < count; i++) {
            const proxy = await this.getRandomProxy();

            if (proxy) {
                const proxyAgent = this.createProxyAgent(proxy.url);

                if (proxyAgent) {
                    configs.push({
                        httpsAgent: proxyAgent,
                        httpAgent: proxyAgent,
                        proxyId: proxy.id
                    });
                } else {
                    this.markProxyError(proxy.id);
                    configs.push({});
                }
            } else {
                configs.push({});
            }
        }

        return configs;
    }
}

// 创建全局代理管理器实例
const proxyManager = new ProxyManager();

export default proxyManager;
export { ProxyManager };