// ===============================================================================
// APEX LEVIATHAN WHALE STRIKER v21.3 (ULTIMATE MERGE) - HIGH-FREQUENCY CLUSTER
// ===============================================================================
// FIXED: NONCE COLLISION + SIMULATION ROBUSTNESS + MULTI-CHANNEL RELAY
// STRATEGY: DUAL-LAYER DETECTION (PENDING TX + LOG DECODING)
// TARGET BENEFICIARY: 0x4B8251e7c80F910305bb81547e301DcB8A596918
// ===============================================================================

const cluster = require('cluster');
const os = require('os');
const http = require('http');
const axios = require('axios');
const { ethers, WebSocketProvider, JsonRpcProvider, Wallet, Interface, parseEther, formatEther, Contract, FallbackProvider, AbiCoder } = require('ethers');
require('dotenv').config();

// --- SAFETY: GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    const msg = err.message || "";
    if (msg.includes('200') || msg.includes('429') || msg.includes('network')) return;
    console.error("\n\x1b[31m[CRITICAL ERROR]\x1b[0m", msg);
});

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || reason || "";
    if (msg.toString().includes('200') || msg.toString().includes('429')) return;
});

// --- DEPENDENCY CHECK ---
let FlashbotsBundleProvider;
let hasFlashbots = false;
try {
    ({ FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle'));
    hasFlashbots = true;
} catch (e) {
    if (cluster.isPrimary) console.error("\x1b[33m%s\x1b[0m", "\n⚠️ WARNING: Flashbots dependency missing. Mainnet bundling disabled.");
}

// --- THEME ENGINE ---
const TXT = {
    reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", 
    magenta: "\x1b[35m", blue: "\x1b[34m", red: "\x1b[31m",
    gold: "\x1b[38;5;220m", gray: "\x1b[90m"
};

// --- CONFIGURATION ---
const GLOBAL_CONFIG = {
    TARGET_CONTRACT: process.env.TARGET_CONTRACT || "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0", 
    BENEFICIARY: process.env.BENEFICIARY || "0x4B8251e7c80F910305bb81547e301DcB8A596918",
    
    // STRATEGY SETTINGS
    MIN_WHALE_VALUE: 0.1,                // Heartbeat trigger for logs
    WHALE_MIN_ETH: parseEther("10.0"),   // Leviathan Log Threshold
    GAS_LIMIT: 1250000n,                 // Optimal safety buffer
    PORT: process.env.PORT || 8080,
    MARGIN_ETH: "0.012",                 // ~$40 Profit Floor
    PRIORITY_BRIBE: 25n,                 // 25% Tip for block priority
    
    RPC_POOL: [
        "https://eth.llamarpc.com",
        "https://1rpc.io/eth",
        "https://rpc.flashbots.net",
        "https://base.llamarpc.com"
    ],

    // 🌍 NETWORKS
    NETWORKS: [
        {
            name: "ETH_MAINNET", chainId: 1,
            rpc: process.env.ETH_RPC || "https://eth.llamarpc.com",
            wss: process.env.ETH_WSS || "wss://ethereum-rpc.publicnode.com", 
            type: "FLASHBOTS", relay: "https://relay.flashbots.net",
            aavePool: "0x87870Bca3F3f6332F99512Af77db630d00Z638025",
            uniswapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
            priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
            weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            color: TXT.cyan
        },
        {
            name: "ARBITRUM", chainId: 42161,
            rpc: process.env.ARB_RPC || "https://arb1.arbitrum.io/rpc",
            wss: process.env.ARB_WSS || "wss://arb1.arbitrum.io/feed",
            type: "PRIVATE_RELAY",
            aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            uniswapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564", 
            priceFeed: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
            weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
            color: TXT.blue
        },
        {
            name: "BASE_MAINNET", chainId: 8453,
            rpc: process.env.BASE_RPC || "https://mainnet.base.org",
            wss: process.env.BASE_WSS || "wss://base-rpc.publicnode.com",
            privateRpc: "https://base.merkle.io",
            aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
            uniswapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481", 
            gasOracle: "0x420000000000000000000000000000000000000F",
            priceFeed: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
            weth: "0x4200000000000000000000000000000000000006",
            color: TXT.magenta
        }
    ]
};

// --- MASTER PROCESS ---
if (cluster.isPrimary) {
    console.clear();
    console.log(`${TXT.bold}${TXT.gold}╔════════════════════════════════════════════════════════╗${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}║   ⚡ LEVIATHAN WHALE STRIKER v21.3 | CLUSTER ENGINE    ║${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}║   DUAL LAYER: PENDING TXS + LOG DECODING (FIXED)       ║${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}╚════════════════════════════════════════════════════════╝${TXT.reset}\n`);

    const cpuCount = Math.min(os.cpus().length, 32);
    console.log(`${TXT.green}[SYSTEM] Spawning ${cpuCount} Quantum Workers...${TXT.reset}`);
    console.log(`${TXT.magenta}🎯 TARGET: ${GLOBAL_CONFIG.TARGET_CONTRACT}${TXT.reset}\n`);

    for (let i = 0; i < cpuCount; i++) cluster.fork();

    cluster.on('exit', (worker) => {
        console.log(`${TXT.red}⚠️ Worker offline. Respawning...${TXT.reset}`);
        setTimeout(() => cluster.fork(), 2000);
    });
} 
// --- WORKER PROCESS ---
else {
    const networkIndex = (cluster.worker.id - 1) % GLOBAL_CONFIG.NETWORKS.length;
    const NETWORK = GLOBAL_CONFIG.NETWORKS[networkIndex];
    initWorker(NETWORK).catch(() => {});
}

async function initWorker(CHAIN) {
    const TAG = `${CHAIN.color}[${CHAIN.name}]${TXT.reset}`;
    let currentEthPrice = 0;
    let scanCount = 0;

    const rawKey = process.env.PRIVATE_KEY || "";
    if (!rawKey) return;

    async function connect() {
        try {
            const network = ethers.Network.from(CHAIN.chainId);
            
            // Reliability: Fallback provider pool for broad broadcasting
            const rpcConfigs = [CHAIN.rpc, ...GLOBAL_CONFIG.RPC_POOL].map((url, i) => ({
                provider: new JsonRpcProvider(url, network, { staticNetwork: true }),
                priority: i + 1, stallTimeout: 1500
            }));
            const provider = new FallbackProvider(rpcConfigs, network, { quorum: 1 });
            
            const wsProvider = new WebSocketProvider(CHAIN.wss, network);
            const wallet = new Wallet(rawKey.trim(), provider);

            const priceFeed = CHAIN.priceFeed ? new Contract(CHAIN.priceFeed, ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], provider) : null;
            const gasOracle = CHAIN.gasOracle ? new Contract(CHAIN.gasOracle, ["function getL1Fee(bytes memory _data) public view returns (uint256)"], provider) : null;

            if (priceFeed) {
                const updatePrice = async () => {
                    try {
                        const [, price] = await priceFeed.latestRoundData();
                        currentEthPrice = Number(price) / 1e8;
                    } catch (e) {}
                };
                await updatePrice();
                setInterval(updatePrice, 20000);
            }

            console.log(`${TXT.green}✅ CORE ${cluster.worker.id} ACTIVE on ${CHAIN.name}${TXT.reset}`);

            const poolIface = new Interface([
                "function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode)"
            ]);

            let flashbotsProvider = null;
            if (CHAIN.type === "FLASHBOTS" && hasFlashbots) {
                try {
                    const authSigner = new Wallet(wallet.privateKey, provider);
                    flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, CHAIN.relay);
                } catch (e) {}
            }

            // --- LAYER A: PENDING MEMPOOL SNIPE (Speed) ---
            wsProvider.on("pending", async (txHash) => {
                try {
                    scanCount++;
                    if (scanCount % 50 === 0 && (cluster.worker.id % 4 === 0)) {
                        process.stdout.write(`\r${TAG} ${TXT.blue}⚡ SCANNING${TXT.reset} | Txs: ${scanCount} | ETH: $${currentEthPrice.toFixed(2)} `);
                    }

                    const tx = await provider.getTransaction(txHash).catch(() => null);
                    if (!tx || !tx.to) return;

                    const valueEth = tx.value ? parseFloat(formatEther(tx.value)) : 0;
                    if (valueEth >= GLOBAL_CONFIG.MIN_WHALE_VALUE && tx.to.toLowerCase() === CHAIN.uniswapRouter.toLowerCase()) {
                        console.log(`\n${TAG} ${TXT.magenta}🌊 PENDING WHALE: ${txHash.substring(0, 10)}...${TXT.reset}`);
                        await executeStrike(provider, wallet, poolIface, gasOracle, currentEthPrice, CHAIN, flashbotsProvider);
                    }
                } catch (err) {}
            });

            // --- LAYER B: LOG DECODER SNIPE (Accuracy) ---
            const swapTopic = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");
            wsProvider.on({ topics: [swapTopic] }, async (log) => {
                try {
                    const decoded = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256", "uint256"], log.data);
                    const maxSwap = decoded.reduce((max, val) => val > max ? val : max, 0n);

                    if (maxSwap >= GLOBAL_CONFIG.WHALE_MIN_ETH) {
                         console.log(`\n${TAG} ${TXT.yellow}🐳 LOG CONFIRMED WHALE: ${formatEther(maxSwap)} ETH${TXT.reset}`);
                         await executeStrike(provider, wallet, poolIface, gasOracle, currentEthPrice, CHAIN, flashbotsProvider);
                    }
                } catch (e) {}
            });

        } catch (e) {
            setTimeout(connect, 5000);
        }
    }
    connect();
}

async function executeStrike(provider, wallet, iface, gasOracle, ethPrice, CHAIN, flashbotsProvider) {
    try {
        // Wealth-Based Scaling
        const balanceEth = parseFloat(formatEther(await provider.getBalance(wallet.address)));
        const usdWealth = balanceEth * ethPrice; 

        let loanAmount = parseEther("10"); 
        if (usdWealth >= 500) loanAmount = parseEther("100");
        else if (usdWealth >= 200) loanAmount = parseEther("50");
        else if (usdWealth >= 100) loanAmount = parseEther("25");

        const tradeData = iface.encodeFunctionData("flashLoanSimple", [
            GLOBAL_CONFIG.TARGET_CONTRACT,
            CHAIN.weth, 
            loanAmount,
            "0x", 
            0
        ]);

        // TRIPLE-CHECK PRE-FLIGHT (Nonce Latest Fix)
        const [simulation, l1Fee, feeData, nonce] = await Promise.all([
            provider.call({ to: CHAIN.aavePool, data: tradeData, from: wallet.address, gasLimit: GLOBAL_CONFIG.GAS_LIMIT }).catch(() => null),
            gasOracle ? gasOracle.getL1Fee(tradeData).catch(() => 0n) : 0n,
            provider.getFeeData(),
            provider.getTransactionCount(wallet.address, 'latest')
        ]);

        if (!simulation || simulation === "0x") return;

        const aaveFee = (loanAmount * 5n) / 10000n; 
        const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || parseEther("1", "gwei");
        const l2Cost = GLOBAL_CONFIG.GAS_LIMIT * gasPrice;
        const totalThreshold = l2Cost + l1Fee + aaveFee + parseEther(GLOBAL_CONFIG.MARGIN_ETH);
        
        const rawProfit = BigInt(simulation);

        if (rawProfit > totalThreshold) {
            console.log(`${TXT.green}${TXT.bold}💎 STRIKE AUTHORIZED [${CHAIN.name}]${TXT.reset} | Profit: ${formatEther(rawProfit - totalThreshold)} ETH`);

            const priority = (feeData.maxPriorityFeePerGas || 0n) * (100n + GLOBAL_CONFIG.PRIORITY_BRIBE) / 100n;

            const txPayload = {
                to: CHAIN.aavePool,
                data: tradeData,
                type: 2,
                chainId: CHAIN.chainId,
                maxFeePerGas: (feeData.maxFeePerGas || gasPrice) + priority,
                maxPriorityFeePerGas: priority,
                gasLimit: GLOBAL_CONFIG.GAS_LIMIT,
                nonce: nonce,
                value: 0n
            };

            // --- NUCLEAR BROADCAST (Triple Path) ---
            if (CHAIN.type === "FLASHBOTS" && flashbotsProvider) {
                const signedTx = await wallet.signTransaction(txPayload);
                flashbotsProvider.sendBundle([{ signedTransaction: signedTx }], (await provider.getBlockNumber()) + 1);
                console.log(`   ${TXT.green}🎉 Bundle Secured (Flashbots Relay)${TXT.reset}`);
            } else {
                // Reliable Channel (Ethers)
                wallet.sendTransaction(txPayload).then(res => {
                    console.log(`   ${TXT.green}🚀 TX BROADCAST: ${res.hash}${TXT.reset}`);
                }).catch(() => {});

                // High-Speed Channel (Manual RPC Push)
                const signedTx = await wallet.signTransaction(txPayload);
                axios.post(CHAIN.privateRpc || CHAIN.rpc, {
                    jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx]
                }, { timeout: 3000 }).catch(() => {});
            }
        }
    } catch (e) {}
}
