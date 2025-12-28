const { ethers, Wallet, WebSocketProvider, JsonRpcProvider, Contract, Interface } = require('ethers');
require('dotenv').config();

// 1. BOOTSTRAP: SYSTEM MAXIMIZATION
console.log("-----------------------------------------");
console.log("🟢 [BOOT] LEVIATHAN WHALE STRIKER INITIALIZING...");

// AUTO-CONVERT WSS TO HTTPS FOR EXECUTION (Premium Stability)
const RAW_WSS = process.env.WSS_URL || "";
const EXECUTION_URL = RAW_WSS.replace("wss://", "https://");

const CONFIG = {
    CHAIN_ID: 8453,
    TARGET_CONTRACT: "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0",
    
    // ⚡ DUAL-LANE INFRASTRUCTURE
    WSS_URL: RAW_WSS,          // Listener (Fast)
    RPC_URL: EXECUTION_URL,    // Executor (Reliable)
    
    // 🏦 ASSETS
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    
    // 🔮 ORACLES
    GAS_ORACLE: "0x420000000000000000000000000000000000000F", // Base L1 Fee
    CHAINLINK_FEED: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", // ETH Price
    
    // 🐋 WHALE SETTINGS
    WHALE_MIN_ETH: ethers.parseEther("10"), // Only wake up for $33k+ moves
    
    // ⚙️ PERFORMANCE
    GAS_LIMIT: 950000n, 
    PRIORITY_BRIBE: 15n, // 15% Tip to be FIRST
    MARGIN_ETH: process.env.MARGIN_ETH || "0.012"
};

// Global State
let currentEthPrice = 0;
let nextNonce = 0;

async function startLeviathan() {
    // A. KEY SANITIZER (Safety First)
    let rawKey = process.env.TREASURY_PRIVATE_KEY;
    if (!rawKey) { console.error("❌ FATAL: Private Key missing."); process.exit(1); }
    const cleanKey = rawKey.trim();

    try {
        // B. DUAL-PROVIDER SETUP
        const httpProvider = new JsonRpcProvider(CONFIG.RPC_URL);
        const wsProvider = new WebSocketProvider(CONFIG.WSS_URL);
        const signer = new Wallet(cleanKey, httpProvider); // Signer uses HTTP (Stable)
        
        await wsProvider.ready;
        console.log(`✅ LEVIATHAN ONLINE | EXECUTOR: ${CONFIG.RPC_URL.substring(0, 25)}...`);

        // C. CONTRACTS
        const oracleContract = new Contract(CONFIG.GAS_ORACLE, ["function getL1Fee(bytes memory _data) public view returns (uint256)"], httpProvider);
        const priceFeed = new Contract(CONFIG.CHAINLINK_FEED, ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], httpProvider);
        const titanIface = new Interface(["function requestTitanLoan(address,uint256,address[])"]);

        // Sync Nonce
        nextNonce = await httpProvider.getTransactionCount(signer.address);

        // D. LIVE PRICE TRACKER (The Intelligence)
        wsProvider.on("block", async (blockNum) => {
            try {
                const [, price] = await priceFeed.latestRoundData();
                currentEthPrice = Number(price) / 1e8;
                process.stdout.write(`\r🌊 BLOCK: ${blockNum} | ETH: $${currentEthPrice.toFixed(2)} | Hunting Whales... `);
            } catch (e) {}
        });

        // E. THE WHALE LISTENER
        // Standard Swap Topic (Uniswap V2/V3)
        const swapTopic = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");

        wsProvider.on({ topics: [swapTopic] }, async (log) => {
            try {
                // 1. DECODE LOG (Detect Whale Volume)
                // We use a safe try/catch in case it's a non-standard pool
                const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                    ["uint256", "uint256", "uint256", "uint256"], 
                    log.data
                );
                
                // Find largest movement in the swap
                const maxSwap = decoded.reduce((max, val) => val > max ? val : max, 0n);

                if (maxSwap < CONFIG.WHALE_MIN_ETH) return; // Ignore "Fish"

                console.log(`\n🚨 WHALE DETECTED: ${ethers.formatEther(maxSwap)} ETH Volume!`);
                
                // 2. TRIGGER EXECUTION
                await executeLeviathanStrike(httpProvider, signer, titanIface, oracleContract);

            } catch (e) { 
                // Log decoding failed (likely V3 or non-standard), skip to save resources
            }
        });

        // F. IMMORTALITY PROTOCOL
        wsProvider.websocket.onclose = () => {
            console.warn("\n⚠️ CONNECTION LOST. REBOOTING...");
            process.exit(1); 
        };

    } catch (e) {
        console.error(`\n❌ CRITICAL: ${e.message}`);
        setTimeout(startLeviathan, 1000);
    }
}

async function executeLeviathanStrike(provider, signer, iface, oracle) {
    try {
        // 1. DYNAMIC LOAN (Using Real-Time Chainlink Price)
        const balanceWei = await provider.getBalance(signer.address);
        const balanceEth = parseFloat(ethers.formatEther(balanceWei));
        const usdValue = balanceEth * currentEthPrice; // MAXIMIZED ACCURACY

        let amount = ethers.parseEther("10");
        if (usdValue >= 200) amount = ethers.parseEther("100");
        else if (usdValue >= 100) amount = ethers.parseEther("75");
        else if (usdValue >= 50) amount = ethers.parseEther("25");

        // 2. ENCODE DATA
        const strikeData = iface.encodeFunctionData("requestTitanLoan", [
            CONFIG.WETH, amount, [CONFIG.WETH, CONFIG.USDC]
        ]);

        // 3. PRE-FLIGHT (Sim + L1 Fee + Gas Data)
        const [simulation, l1Fee, feeData] = await Promise.all([
            provider.call({ to: CONFIG.TARGET_CONTRACT, data: strikeData, from: signer.address }).catch(() => null),
            oracle.getL1Fee(strikeData),
            provider.getFeeData()
        ]);

        if (!simulation) return;

        // 4. MAXIMIZED PROFIT MATH
        // Aave V3 Fee: 0.05%
        const aaveFee = (amount * 5n) / 10000n;
        // Priority Bribe: 15%
        const aggressivePriority = (feeData.maxPriorityFeePerGas * (100n + CONFIG.PRIORITY_BRIBE)) / 100n;
        
        const l2Cost = CONFIG.GAS_LIMIT * feeData.maxFeePerGas;
        const totalCost = l2Cost + l1Fee + aaveFee;
        
        const netProfit = BigInt(simulation) - totalCost;

        // 5. EXECUTION
        if (netProfit > ethers.parseEther(CONFIG.MARGIN_ETH)) {
            const profitUSD = parseFloat(ethers.formatEther(netProfit)) * currentEthPrice;
            console.log(`💎 PROFIT LOCKED: ${ethers.formatEther(netProfit)} ETH (~$${profitUSD.toFixed(2)})`);
            
            const tx = await signer.sendTransaction({
                to: CONFIG.TARGET_CONTRACT,
                data: strikeData,
                gasLimit: CONFIG.GAS_LIMIT,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: aggressivePriority, // Bribe
                nonce: nextNonce++,
                type: 2
            });
            
            console.log(`🚀 LEVIATHAN STRIKE: ${tx.hash}`);
            await tx.wait();
        }
    } catch (e) {
        if (e.message.includes("nonce")) nextNonce = await provider.getTransactionCount(signer.address);
    }
}

// EXECUTE
if (require.main === module) {
    startLeviathan().catch(e => {
        console.error("FATAL ERROR. RESTARTING...");
        setTimeout(startLeviathan, 1000);
    });
}
