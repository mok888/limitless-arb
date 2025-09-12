#!/usr/bin/env node

/**
 * 代理配置验证工具
 * 验证proxies.txt文件中的代理配置是否正确
 */

import fs from 'fs/promises';
import axios from 'axios';

async function validateProxyConfig() {
    console.log('🔍 代理配置验证工具\n');

    try {
        // 1. 检查代理文件是否存在
        console.log('📋 步骤1: 检查代理文件');
        try {
            await fs.access('proxies.txt');
            console.log('   ✅ proxies.txt 文件存在');
        } catch (error) {
            console.log('   ❌ proxies.txt 文件不存在');
            console.log('   💡 请复制 proxies.txt.example 为 proxies.txt 并配置代理');
            return;
        }

        // 2. 读取和解析代理配置
        console.log('\n📋 步骤2: 读取代理配置');
        const content = await fs.readFile('proxies.txt', 'utf8');
        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));

        if (lines.length === 0) {
            console.log('   ❌ 代理文件为空或只包含注释');
            return;
        }

        console.log(`   ✅ 找到 ${lines.length} 个代理配置`);

        // 3. 验证每个代理配置的格式
        console.log('\n📋 步骤3: 验证代理格式');
        const validProxies = [];
        const invalidProxies = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            console.log(`\n   代理 ${i + 1}: ${line}`);

            try {
                const url = new URL(line);
                
                // 检查协议
                if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol)) {
                    throw new Error(`不支持的协议: ${url.protocol}`);
                }

                // 检查主机和端口
                if (!url.hostname) {
                    throw new Error('缺少主机名');
                }

                if (!url.port) {
                    throw new Error('缺少端口号');
                }

                // 构建axios代理配置
                const proxyConfig = {
                    protocol: url.protocol.replace(':', ''),
                    host: url.hostname,
                    port: parseInt(url.port)
                };

                if (url.username && url.password) {
                    proxyConfig.auth = {
                        username: url.username,
                        password: url.password
                    };
                    console.log('     ✅ 格式正确（包含认证信息）');
                } else {
                    console.log('     ✅ 格式正确（无认证信息）');
                }

                console.log('     📋 解析结果:', JSON.stringify(proxyConfig, null, 6));
                validProxies.push({ line, config: proxyConfig });

            } catch (error) {
                console.log(`     ❌ 格式错误: ${error.message}`);
                invalidProxies.push({ line, error: error.message });
            }
        }

        // 4. 显示验证结果
        console.log('\n📋 步骤4: 验证结果汇总');
        console.log(`   有效代理: ${validProxies.length} 个`);
        console.log(`   无效代理: ${invalidProxies.length} 个`);

        if (invalidProxies.length > 0) {
            console.log('\n   ❌ 无效代理列表:');
            invalidProxies.forEach((proxy, index) => {
                console.log(`   ${index + 1}. ${proxy.line}`);
                console.log(`      错误: ${proxy.error}`);
            });
        }

        // 5. 测试代理连接（可选）
        if (validProxies.length > 0) {
            console.log('\n📋 步骤5: 测试代理连接（可选）');
            console.log('   是否要测试代理连接？这可能需要一些时间...');
            
            // 简单测试第一个代理
            const firstProxy = validProxies[0];
            console.log(`\n   测试代理: ${firstProxy.line}`);
            
            try {
                const axiosConfig = {
                    timeout: 10000,
                    proxy: firstProxy.config
                };

                console.log('   发送测试请求到 httpbin.org/ip...');
                const testClient = axios.create(axiosConfig);
                const response = await testClient.get('https://httpbin.org/ip');
                
                console.log('   ✅ 代理连接测试成功！');
                console.log(`   代理IP: ${response.data.origin}`);
                
            } catch (error) {
                console.log('   ⚠️ 代理连接测试失败:', error.message);
                console.log('   这可能是因为:');
                console.log('   - 代理服务器不可用');
                console.log('   - 认证信息错误');
                console.log('   - 网络连接问题');
                console.log('   - 代理不支持HTTPS请求');
            }
        }

        // 6. 提供配置建议
        console.log('\n📋 步骤6: 配置建议');
        if (validProxies.length > 0) {
            console.log('   ✅ 代理配置验证通过！');
            console.log('   💡 建议:');
            console.log('   - 确保代理服务器稳定可用');
            console.log('   - 定期检查代理的有效性');
            console.log('   - 使用多个代理以提高可靠性');
            console.log('   - 监控代理的错误率和响应时间');
        } else {
            console.log('   ❌ 没有有效的代理配置');
            console.log('   💡 请检查代理格式，正确格式示例:');
            console.log('   http://proxy.example.com:8080');
            console.log('   http://username:password@proxy.example.com:8080');
            console.log('   https://username:password@proxy.example.com:3128');
        }

        console.log('\n✅ 代理配置验证完成！');

    } catch (error) {
        console.error('❌ 验证过程中发生错误:', error.message);
        console.error(error.stack);
    }
}

async function main() {
    console.log('🚀 代理配置验证');
    console.log('=' .repeat(50));

    try {
        await validateProxyConfig();
        
        console.log('\n' + '=' .repeat(50));
        console.log('🎉 验证完成！');

    } catch (error) {
        console.error('❌ 验证过程中发生错误:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error.message);
    console.error(error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ 未处理的Promise拒绝:', reason);
    process.exit(1);
});

// 运行验证
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { validateProxyConfig };