import dotenv from 'dotenv';

dotenv.config();

export const config = {
    API: {
        BASE_URL: process.env.API_BASE_URL || 'https://api.limitless.exchange',
        TIMEOUT: process.env.API_TIMEOUT,
    },
    RPC_URL: process.env.RPC_URL || 'https://mainnet.base.org',
};

export async function initializeConfig() {
    return Promise.resolve();
}