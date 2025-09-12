import axios from 'axios';

import { config } from './config.js';
import proxyManager from '../managers/proxy-manager.js';

class PythClient {
    constructor() {
        this.proxyManager = proxyManager;
        this.symbolIds = {
            'BTC/USD': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
            'ETH/USD': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
            'DOGE/USD': '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
            'SOL/USD': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
        }
    }

    async request(options) {
        const {
            method = 'get',
            url,
            data = null,
            params = null,
            useProxy = false,
            headers = {}
        } = options;

        // 组装 headers
        const mergedHeaders = { ...headers };

        // 组装 axios 配置
        let axiosConfig = {
            baseURL: 'https://hermes.pyth.network',
            timeout: config.API.TIMEOUT,
            method,
            url,
            headers: mergedHeaders,
            ...(data ? { data } : {}),
            ...(params ? { params } : {})
        };

        if (useProxy) {
            const proxyConfig = await this.proxyManager.createProxyConfig();
            if (proxyConfig.httpsAgent) {
                axiosConfig.httpsAgent = proxyConfig.httpsAgent;
                axiosConfig.httpAgent = proxyConfig.httpAgent;
            }
        }

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), config.API.TIMEOUT)
        );

        try {
            const response = await Promise.race([
                axios.request(axiosConfig),
                timeoutPromise,
            ])

            return { 
                success: response.status == 200,
                data: response.data,
            }
        } catch (error) {
            throw new Error(error.response?.data?.message || error.message);
        }
    }

    async getIds(symbol) {
        return this.symbolIds.get(symbol)
    }

    async getLatestPriceFeed(ids) {
        const params = {};
        params['ids[]'] = ids;

        try {
            return await this.request({
                method: 'get',
                url: '/api/latest_price_feeds',
                params,
            });
        } catch(e) {
            return null
        }
    }
}

export default PythClient;