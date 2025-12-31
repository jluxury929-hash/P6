// ===============================================================================
// APEX LEVIATHAN WHALE STRIKER v21.1 (MERGED) - HIGH-FREQUENCY CLUSTER
// ===============================================================================

const cluster = require('cluster');
const os = require('os');
const http = require('http');
const axios = require('axios');
const { ethers, WebSocketProvider, JsonRpcProvider, Wallet, Interface, parseEther, formatEther, Contract, AbiCoder } = require('ethers');
require('dotenv').config();

// --- SAFETY: GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    console.error("\n\x1b[31m[CRITICAL ERROR] Uncaught Exception:\x1b[0m", err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error("\n\x1b[31m[CRITICAL ERROR] Unhandled Rejection:\x1b[0m", reason instanceof Error ? reason.message : reason);
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
    
    // LEVIATHAN STRATEGY SETTINGS
    MIN_WHALE_VALUE: 0.5,                // Heartbeat trigger for logs
    WHALE_MIN_ETH: parseEther("10.0"),   // Leviathan Log Threshold (v21.0)
    GAS_LIMIT: 1200000n,                 // Safety buffer for L2
    PORT: process.env.PORT || 8080,
    MARGIN_ETH: "0.012",                 // ~$40 Profit Floor
    PRIORITY_BRIBE: 15n,                 // 15% Tip

    // 🌍 NETWORKS
    NETWORKS: [
        {
            name: "ETH_MAINNET",
            chainId: 1,
            rpc: process.env.ETH_RPC || "https://eth.llamarpc.com",
            wss: process.env.ETH_WSS || "wss://ethereum-rpc.publicnode.com", 
            type: "FLASHBOTS",
            relay: "https://relay.flashbots.net",
            aavePool: "0x87870Bca3F3f6332F99512Af77db630d00Z638025",
            uniswapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
            gasOracle: null,
            priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
            color: TXT.cyan
        },
        {
            name: "ARBITRUM",
            chainId: 42161,
            rpc: process.env.ARB_RPC || "https://arb1.arbitrum.io/rpc",
            wss: process.env.ARB_WSS || "wss://arb1.arbitrum.io/feed",
            type: "PRIVATE_RELAY",
            privateRpc: "https://arb1.arbitrum.io/rpc",
            aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            uniswapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564", 
            gasOracle: null,
            priceFeed: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
            color: TXT.blue
        },
        {
            name: "BASE_MAINNET",
            chainId: 8453,
            rpc: process.env.BASE_RPC || "https://mainnet.base.org",
            wss: process.env.BASE_WSS || "wss://base-rpc.publicnode.com",
            type: "PRIVATE_RELAY",
            privateRpc: "https://base.merkle.io",
            aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
            uniswapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481", 
            gasOracle: "0x420000000000000000000000000000000000000F",
            priceFeed: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
            color: TXT.magenta
        }
    ]
};

// --- MASTER PROCESS ---
if (cluster.isPrimary) {
    console.clear();
    console.log(`${TXT.bold}${TXT.gold}╔════════════════════════════════════════════════════════╗${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}║   ⚡ LEVIATHAN WHALE STRIKER v21.1 | CLUSTER EDITION   ║${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}║   DUAL SNIPE: PENDING TXS + SWAP LOG DECODING          ║${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}╚════════════════════════════════════════════════════════╝${TXT.reset}\n`);

    const cpuCount = os.cpus().length;
    console.log(`${TXT.green}[SYSTEM] Initializing Leviathan Cluster (${cpuCount} cores)...${TXT.reset}`);
    console.log(`${TXT.magenta}🎯 TARGET: ${GLOBAL_CONFIG.TARGET_CONTRACT}${TXT.reset}\n`);

    for (let i = 0; i < cpuCount; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker) => {
        console.log(`${TXT.red}⚠️  Worker ${worker.process.pid} offline. Respawning...${TXT.reset}`);
        setTimeout(() => cluster.fork(), 3000);
    });
} 
// --- WORKER PROCESS ---
else {
    const networkIndex = (cluster.worker.id - 1) % GLOBAL_CONFIG.NETWORKS.length;
    const NETWORK = GLOBAL_CONFIG.NETWORKS[networkIndex];
    initWorker(NETWORK).catch(err => console.error(`${TXT.red}[FATAL] ${err.message}${TXT.reset}`));
}

async function initWorker(CHAIN) {
    const TAG = `${CHAIN.color}[${CHAIN.name}]${TXT.reset}`;
    
    // 0. JITTER
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5000)));

    // 1. HEALTH CHECK
    try {
        const server = http.createServer((req, res) => {
            if (req.url === '/status') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: "ONLINE", chain: CHAIN.name, mode: "LEVIATHAN_v21" }));
            } else { res.writeHead(404); res.end(); }
        });
        server.on('error', () => {});
        server.listen(GLOBAL_CONFIG.PORT + cluster.worker.id); 
    } catch (e) {}
    
    // 2. PROVIDERS & CONTRACTS
    let provider, wsProvider, wallet, gasOracle, priceFeed;
    let currentEthPrice = 0;
    let scanCount = 0;

    try {
        const network = ethers.Network.from(CHAIN.chainId);
        provider = new JsonRpcProvider(CHAIN.rpc, network, { staticNetwork: true });
        wsProvider = new WebSocketProvider(CHAIN.wss);
        
        wsProvider.on('error', (error) => {
            if (error && error.message && (error.message.includes("UNEXPECTED_MESSAGE") || error.message.includes("delayedMessagesRead"))) return;
            console.error(`${TXT.yellow}⚠️ [WS ERROR] ${TAG}: ${error.message}${TXT.reset}`);
        });

        if (wsProvider.websocket) {
            wsProvider.websocket.onerror = () => {};
            wsProvider.websocket.onclose = () => process.exit(0);
        }
        
        const pk = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
        wallet = new Wallet(pk, provider);

        if (CHAIN.gasOracle) gasOracle = new Contract(CHAIN.gasOracle, ["function getL1Fee(bytes memory _data) public view returns (uint256)"], provider);
        if (CHAIN.priceFeed) {
            priceFeed = new Contract(CHAIN.priceFeed, ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], provider);
            try {
                const [, price] = await priceFeed.latestRoundData();
                currentEthPrice = Number(price) / 1e8;
            } catch(e) {}
            
            setInterval(async () => {
                try {
                    const [, price] = await priceFeed.latestRoundData();
                    currentEthPrice = Number(price) / 1e8;
                } catch (e) {}
            }, 10000);
        }
        
        console.log(`${TXT.green}✅ WORKER ${cluster.worker.id} ACTIVE${TXT.reset} on ${TAG}`);
    } catch (e) {
        console.log(`${TXT.red}❌ Connection Failed on ${TAG}: ${e.message}${TXT.reset}`);
        return;
    }

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

    // 4. LEVIATHAN SNIPER ENGINE
    // A. PENDING LAYER (Speed)
    wsProvider.on("pending", async (txHash) => {
        try {
            scanCount++;
            if (scanCount % 25 === 0 && (cluster.worker.id % 8 === 0)) {
               process.stdout.write(`\r${TAG} ${TXT.blue}⚡ SCANNING${TXT.reset} | Txs: ${scanCount} | ETH: $${currentEthPrice.toFixed(2)} `);
            }

            if (!provider) return;
            const tx = await provider.getTransaction(txHash).catch(() => null);
            if (!tx || !tx.to) return;

            const valueEth = tx.value ? parseFloat(formatEther(tx.value)) : 0;
            
            if (valueEth >= GLOBAL_CONFIG.MIN_WHALE_VALUE && tx.to.toLowerCase() === CHAIN.uniswapRouter.toLowerCase()) {
                console.log(`\n${TAG} ${TXT.magenta}🌊 PENDING WHALE DETECTED: ${txHash.substring(0, 10)}...${TXT.reset}`);
                await executeStrike(provider, wallet, poolIface, gasOracle, currentEthPrice, CHAIN, flashbotsProvider);
            }
        } catch (err) {}
    });

    // B. LOG DECODER LAYER (Accuracy)
    const swapTopic = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");
    wsProvider.on({ topics: [swapTopic] }, async (log) => {
        try {
            const decoded = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256", "uint256"], log.data);
            const maxSwap = decoded.reduce((max, val) => val > max ? val : max, 0n);

            if (maxSwap >= GLOBAL_CONFIG.WHALE_MIN_ETH) {
                 console.log(`\n${TAG} ${TXT.yellow}🐳 CONFIRMED LEVIATHAN VOLUME: ${formatEther(maxSwap)} ETH${TXT.reset}`);
                 await executeStrike(provider, wallet, poolIface, gasOracle, currentEthPrice, CHAIN, flashbotsProvider);
            }
        } catch (e) {}
    });
}

async function executeStrike(provider, wallet, iface, gasOracle, ethPrice, CHAIN, flashbotsProvider) {
    try {
        // 1. DYNAMIC LOAN SCALING
        const balanceWei = await provider.getBalance(wallet.address);
        const balanceEth = parseFloat(formatEther(balanceWei));
        const usdValue = balanceEth * ethPrice; 

        let loanAmount = parseEther("10"); 
        if (usdValue >= 200) loanAmount = parseEther("100");
        else if (usdValue >= 100) loanAmount = parseEther("75");
        else if (usdValue >= 50)  loanAmount = parseEther("25");

        const wethAddress = CHAIN.chainId === 8453 ? "0x4200000000000000000000000000000000000006" : "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; 

        const tradeData = iface.encodeFunctionData("flashLoanSimple", [
            GLOBAL_CONFIG.TARGET_CONTRACT,
            wethAddress, 
            loanAmount,
            "0x", 
            0
        ]);

        // 2. PRE-FLIGHT SIMULATION
        const [simulation, l1Fee, feeData] = await Promise.all([
            provider.call({ to: CHAIN.aavePool, data: tradeData, from: wallet.address, gasLimit: GLOBAL_CONFIG.GAS_LIMIT }).catch(() => null),
            gasOracle ? gasOracle.getL1Fee(tradeData) : 0n,
            provider.getFeeData()
        ]);

        if (!simulation) return;

        // 3. PROFIT VALIDATION
        const aaveFee = (loanAmount * 5n) / 10000n;
        const l2Cost = GLOBAL_CONFIG.GAS_LIMIT * feeData.maxFeePerGas;
        const marginWei = parseEther(GLOBAL_CONFIG.MARGIN_ETH);
        
        const totalCost = l2Cost + l1Fee + aaveFee + marginWei;
        const rawProfit = BigInt(simulation);

        if (rawProfit > totalCost) {
            console.log(`${TXT.green}${TXT.bold}💎 LEVIATHAN STRIKE CONFIRMED${TXT.reset} | Profit: ${formatEther(rawProfit - totalCost)} ETH`);

            let aggressivePriority = (feeData.maxPriorityFeePerGas * (100n + GLOBAL_CONFIG.PRIORITY_BRIBE)) / 100n;

            const txPayload = {
                to: CHAIN.aavePool,
                data: tradeData,
                type: 2,
                chainId: CHAIN.chainId,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: aggressivePriority,
                gasLimit: GLOBAL_CONFIG.GAS_LIMIT,
                nonce: await provider.getTransactionCount(wallet.address),
                value: 0n
            };

            const signedTx = await wallet.signTransaction(txPayload);

            if (CHAIN.type === "FLASHBOTS" && flashbotsProvider) {
                const bundle = [{ signedTransaction: signedTx }];
                await flashbotsProvider.sendBundle(bundle, (await provider.getBlockNumber()) + 1);
                console.log(`   ${TXT.green}🎉 Bundle Secured (Flashbots)${TXT.reset}`);
            } else {
                const relayResponse = await axios.post(CHAIN.privateRpc || CHAIN.rpc, {
                    jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx]
                }, { timeout: 2000 }).catch(() => null);

                if (relayResponse && relayResponse.data && relayResponse.data.result) {
                    console.log(`   ${TXT.green}🎉 SUCCESS: ${relayResponse.data.result}${TXT.reset}`);
                } else {
                    await wallet.sendTransaction(txPayload).catch(() => {});
                }
            }
        }
    } catch (e) {}
}
