const CHAIN_ID = 5042002;
const CHAIN_HEX = "0x4cef52";
const RPC = "https://rpc.testnet.arc.io/";
const EXPLORER = "https://testnet.arcscan.app";
const USDC = "0x3600000000000000000000000000000000000000";
const PAYLINK = "0xCaF923cd2FcE2f8852c9Bc8D7cD3aE79023594e1";
const STATUS = ["None", "Open", "Paid", "Canceled"];

const TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
const IRIS = "https://iris-api-sandbox.circle.com";

const PAYLINK_ABI = [
  "function createRequest(uint96 amount, string memo, address payerHint, uint64 deadline) returns (uint256 id)",
  "function pay(uint256 id)",
  "function cancel(uint256 id)",
  "function getRequest(uint256 id) view returns (tuple(address payerHint, address recipient, uint96 amount, uint64 deadline, uint8 status, string memo, address paidBy, uint64 paidAt))",
  "function nextId() view returns (uint256)",
  "event RequestCreated(uint256 indexed id, address indexed recipient, address payerHint, uint96 amount, uint64 deadline, string memo)"
];
const ERC20_ABI = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];
const MESSENGER_ABI = [
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64)"
];
const TRANSMITTER_ABI = [
  "function receiveMessage(bytes message, bytes attestation) returns (bool)"
];

const CHAINS = {
  arc: {
    key: "arc", name: "Arc Testnet", chainId: 5042002, hex: "0x4cef52", domain: 26,
    usdc: "0x3600000000000000000000000000000000000000",
    rpc: "https://rpc.testnet.arc.io/", explorer: "https://testnet.arcscan.app",
    symbol: "USDC", decimals: 18, minFinality: 2000
  },
  sepolia: {
    key: "sepolia", name: "Ethereum Sepolia", chainId: 11155111, hex: "0xaa36a7", domain: 0,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    rpc: "https://rpc.sepolia.org", explorer: "https://sepolia.etherscan.io",
    symbol: "ETH", decimals: 18, minFinality: 1000
  },
  base: {
    key: "base", name: "Base Sepolia", chainId: 84532, hex: "0x14a34", domain: 6,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org",
    symbol: "ETH", decimals: 18, minFinality: 1000
  },
  fuji: {
    key: "fuji", name: "Avalanche Fuji", chainId: 43113, hex: "0xa869", domain: 1,
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
    rpc: "https://api.avax-test.network/ext/bc/C/rpc", explorer: "https://testnet.snowtrace.io",
    symbol: "AVAX", decimals: 18, minFinality: 1000
  }
};

const $ = (id) => document.getElementById(id);
let provider, signer, account, lastLink = "", lastBurnTx = "", lastBurnDomain = 0;

const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
function setText(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.className = "status" + (cls ? " " + cls : "");
  el.textContent = text;
}
function payUrl(id) {
  const url = new URL(location.href);
  url.hash = "pay";
  url.searchParams.set("id", String(id));
  return url.toString();
}
function readProvider() {
  return provider || new ethers.JsonRpcProvider(RPC);
}
function toBytes32Address(addr) {
  return ethers.zeroPadValue(ethers.getAddress(addr), 32);
}

async function connect() {
  if (!window.ethereum) return setText("netStatus", "Install MetaMask or Rabby.", "bad");
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  account = await signer.getAddress();
  $("walletPill").textContent = short(account);
  await ensureNetwork(false);
}

async function switchToChain(chain) {
  if (!window.ethereum) throw new Error("No wallet");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.hex }] });
  } catch (err) {
    if (err.code === 4902 || String(err.message || "").includes("Unrecognized")) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chain.hex,
          chainName: chain.name,
          nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: chain.decimals },
          rpcUrls: [chain.rpc],
          blockExplorerUrls: [chain.explorer]
        }]
      });
    } else {
      throw err;
    }
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  account = await signer.getAddress();
  $("walletPill").textContent = short(account);
}

async function ensureNetwork(force) {
  if (!window.ethereum || !provider) return false;
  const net = await provider.getNetwork();
  if (Number(net.chainId) === CHAIN_ID) {
    setText("netStatus", "Connected · Arc Testnet", "ok");
    return true;
  }
  if (!force) {
    setText("netStatus", `Wrong network ${net.chainId}. Switch to Arc Testnet.`, "warn");
    return false;
  }
  await switchToChain(CHAINS.arc);
  setText("netStatus", "Switched to Arc Testnet", "ok");
  return true;
}

function contracts() {
  return {
    paylink: new ethers.Contract(PAYLINK, PAYLINK_ABI, signer),
    usdc: new ethers.Contract(USDC, ERC20_ABI, signer)
  };
}

function setShare(id) {
  lastLink = payUrl(id);
  $("shareLink").textContent = lastLink;
  $("qr").style.display = "block";
  $("qr").src = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=" + encodeURIComponent(lastLink);
}

async function loadRequest(id) {
  const c = new ethers.Contract(PAYLINK, PAYLINK_ABI, readProvider());
  const r = await c.getRequest(id);
  if (Number(r.status) === 0) {
    setText("payStatus", `Request #${id} not found.`, "bad");
    return null;
  }
  const lines = [
    `ID ${id} · ${STATUS[Number(r.status)]}`,
    `${ethers.formatUnits(r.amount, 6)} USDC`,
    `Recipient ${r.recipient}`,
    `Payer hint ${r.payerHint === ethers.ZeroAddress ? "public" : r.payerHint}`,
    `Memo ${r.memo || "-"}`,
    `Deadline ${Number(r.deadline) === 0 ? "none" : new Date(Number(r.deadline) * 1000).toLocaleString()}`,
    `Paid by ${r.paidBy === ethers.ZeroAddress ? "-" : r.paidBy}`,
    lastLink || payUrl(id)
  ];
  const cls = Number(r.status) === 2 ? "ok" : Number(r.status) === 1 ? "warn" : "bad";
  setText("payStatus", lines.join("\n"), cls);
  return r;
}

async function createRequest() {
  if (!signer) return setText("createStatus", "Connect a wallet first.", "bad");
  if (!(await ensureNetwork(true))) return;
  const amount = ethers.parseUnits(String($("amount").value || "0"), 6);
  if (amount <= 0n) return setText("createStatus", "Amount must be greater than 0.", "bad");
  const memo = $("memo").value || "";
  const payerHint = ($("payerHint").value || "").trim() || ethers.ZeroAddress;
  const hours = Number($("hours").value || 0);
  const deadline = hours > 0 ? BigInt(Math.floor(Date.now() / 1000) + hours * 3600) : 0n;
  setText("createStatus", "Creating request…");
  const { paylink } = contracts();
  const tx = await paylink.createRequest(amount, memo, payerHint, deadline);
  const rec = await tx.wait();
  let id = null;
  for (const log of rec.logs) {
    try {
      const parsed = paylink.interface.parseLog(log);
      if (parsed?.name === "RequestCreated") id = parsed.args.id.toString();
    } catch {}
  }
  if (!id) id = ((await paylink.nextId()) - 1n).toString();
  $("reqId").value = id;
  setShare(id);
  setText("createStatus", `Created #${id}\n${EXPLORER}/tx/${tx.hash}`, "ok");
  await loadRequest(id);
  await refreshActivity();
}

async function approve() {
  if (!signer) return setText("payStatus", "Connect a wallet first.", "bad");
  if (!(await ensureNetwork(true))) return;
  const r = await loadRequest(Number($("reqId").value));
  if (!r) return;
  const tx = await contracts().usdc.approve(PAYLINK, r.amount);
  await tx.wait();
  setText("payStatus", `Approved ${ethers.formatUnits(r.amount, 6)} USDC\n${EXPLORER}/tx/${tx.hash}`, "ok");
}

async function pay() {
  if (!signer) return setText("payStatus", "Connect a wallet first.", "bad");
  if (!(await ensureNetwork(true))) return;
  const id = Number($("reqId").value);
  const r = await loadRequest(id);
  if (!r) return;
  if (Number(r.status) !== 1) return setText("payStatus", "Request is not open.", "bad");
  const { usdc, paylink } = contracts();
  if ((await usdc.allowance(account, PAYLINK)) < r.amount) {
    return setText("payStatus", "Approve USDC first.", "warn");
  }
  const tx = await paylink.pay(id);
  await tx.wait();
  setText("payStatus", `Paid #${id}\n${EXPLORER}/tx/${tx.hash}`, "ok");
  await loadRequest(id);
  await refreshActivity();
}

async function cancel() {
  if (!signer) return setText("payStatus", "Connect a wallet first.", "bad");
  if (!(await ensureNetwork(true))) return;
  const id = Number($("reqId").value);
  const tx = await contracts().paylink.cancel(id);
  await tx.wait();
  setText("payStatus", `Canceled #${id}\n${EXPLORER}/tx/${tx.hash}`, "ok");
  await loadRequest(id);
  await refreshActivity();
}

async function refreshActivity() {
  const c = new ethers.Contract(PAYLINK, PAYLINK_ABI, readProvider());
  const next = await c.nextId();
  $("statNext").textContent = next.toString();
  const from = next > 12n ? next - 12n : 1n;
  const rows = [];
  for (let i = next - 1n; i >= from; i--) {
    const r = await c.getRequest(i);
    if (Number(r.status) === 0) continue;
    const st = STATUS[Number(r.status)];
    rows.push(`<tr>
      <td class="mono">#${i}</td>
      <td>${ethers.formatUnits(r.amount, 6)} USDC</td>
      <td><span class="badge ${st.toLowerCase()}">${st}</span></td>
      <td class="mono">${short(r.recipient)}</td>
      <td>${(r.memo || "—").slice(0, 32)}</td>
    </tr>`);
  }
  $("statOpen").textContent = String(rows.length);
  $("tbody").innerHTML = rows.join("") || `<tr><td colspan="5">No requests yet</td></tr>`;
}

function fillBridgeSelects() {
  const from = $("bridgeFrom");
  const to = $("bridgeTo");
  if (!from || !to) return;
  const opts = Object.values(CHAINS).map((c) => `<option value="${c.key}">${c.name}</option>`).join("");
  from.innerHTML = opts;
  to.innerHTML = opts;
  from.value = "sepolia";
  to.value = "arc";
}

async function fetchAttestation(domain, txHash) {
  const res = await fetch(`${IRIS}/v2/messages/${domain}?transactionHash=${txHash}`);
  if (!res.ok) throw new Error("Attestation API " + res.status);
  const data = await res.json();
  return data?.messages?.[0] || null;
}

async function bridgeBurn() {
  if (!signer) return setText("bridgeStatus", "Connect a wallet first.", "bad");
  const src = CHAINS[$("bridgeFrom").value];
  const dst = CHAINS[$("bridgeTo").value];
  if (src.key === dst.key) return setText("bridgeStatus", "Pick two different chains.", "bad");
  const amount = ethers.parseUnits(String($("bridgeAmount").value || "0"), 6);
  if (amount <= 0n) return setText("bridgeStatus", "Amount must be greater than 0.", "bad");

  setText("bridgeStatus", `Switching to ${src.name}…`);
  await switchToChain(src);

  const usdc = new ethers.Contract(src.usdc, ERC20_ABI, signer);
  const messenger = new ethers.Contract(TOKEN_MESSENGER, MESSENGER_ABI, signer);
  setText("bridgeStatus", "Approving USDC…");
  const allowance = await usdc.allowance(account, TOKEN_MESSENGER);
  if (allowance < amount) {
    const aTx = await usdc.approve(TOKEN_MESSENGER, amount);
    await aTx.wait();
  }
  setText("bridgeStatus", "Burning on source…");
  const tx = await messenger.depositForBurn(
    amount,
    dst.domain,
    toBytes32Address(account),
    src.usdc,
    ethers.ZeroHash,
    0,
    src.minFinality
  );
  await tx.wait();
  lastBurnTx = tx.hash;
  lastBurnDomain = src.domain;
  localStorage.setItem("paylink_burn_tx", lastBurnTx);
  localStorage.setItem("paylink_burn_domain", String(lastBurnDomain));
  setText("bridgeStatus", `Burned on ${src.name}\n${src.explorer}/tx/${tx.hash}\nWait 1–3 min, then mint.`, "ok");
}

async function bridgeMint() {
  if (!signer) return setText("bridgeStatus", "Connect a wallet first.", "bad");
  const dst = CHAINS[$("bridgeTo").value];
  if (!lastBurnTx) {
    lastBurnTx = localStorage.getItem("paylink_burn_tx") || "";
    lastBurnDomain = Number(localStorage.getItem("paylink_burn_domain") || 0);
  }
  if (!lastBurnTx) return setText("bridgeStatus", "Burn first.", "warn");

  setText("bridgeStatus", "Fetching Circle attestation…");
  let att = null;
  for (let i = 0; i < 24; i++) {
    try { att = await fetchAttestation(lastBurnDomain, lastBurnTx); } catch {}
    if (att?.message && att?.attestation) break;
    setText("bridgeStatus", `Waiting for attestation… ${i + 1}/24`);
    await new Promise((r) => setTimeout(r, 8000));
  }
  if (!att?.message || !att?.attestation) {
    return setText("bridgeStatus", "Attestation not ready yet. Wait and try Mint again.", "warn");
  }
  setText("bridgeStatus", `Switching to ${dst.name}…`);
  await switchToChain(dst);
  const transmitter = new ethers.Contract(MESSAGE_TRANSMITTER, TRANSMITTER_ABI, signer);
  setText("bridgeStatus", "Minting on destination…");
  const tx = await transmitter.receiveMessage(att.message, att.attestation);
  await tx.wait();
  setText("bridgeStatus", `Minted on ${dst.name}\n${dst.explorer}/tx/${tx.hash}`, "ok");
}

$("btnConnect").onclick = connect;
$("btnNetwork").onclick = async () => {
  if (!provider) await connect();
  await ensureNetwork(true);
};
$("btnCreate").onclick = createRequest;
$("btnLoad").onclick = () => loadRequest(Number($("reqId").value));
$("btnApprove").onclick = approve;
$("btnPay").onclick = pay;
$("btnCancel").onclick = cancel;
$("btnRefresh").onclick = refreshActivity;
$("btnCopy").onclick = async () => {
  if (!lastLink) lastLink = payUrl($("reqId").value);
  await navigator.clipboard.writeText(lastLink);
  setText("createStatus", "Link copied.", "ok");
};
$("btnOpen").onclick = () => { if (lastLink) location.href = lastLink; };

fillBridgeSelects();
$("btnSwitchFrom").onclick = async () => {
  try {
    await switchToChain(CHAINS[$("bridgeFrom").value]);
    setText("bridgeStatus", "Switched to source chain.", "ok");
  } catch (e) { setText("bridgeStatus", e.message || String(e), "bad"); }
};
$("btnSwitchTo").onclick = async () => {
  try {
    await switchToChain(CHAINS[$("bridgeTo").value]);
    setText("bridgeStatus", "Switched to destination chain.", "ok");
  } catch (e) { setText("bridgeStatus", e.message || String(e), "bad"); }
};
$("btnBurn").onclick = () => bridgeBurn().catch((e) => setText("bridgeStatus", e.shortMessage || e.message || String(e), "bad"));
$("btnMint").onclick = () => bridgeMint().catch((e) => setText("bridgeStatus", e.shortMessage || e.message || String(e), "bad"));

(async function init() {
  const id = new URLSearchParams(location.search).get("id");
  if (id) {
    $("reqId").value = id;
    setShare(id);
  }
  lastBurnTx = localStorage.getItem("paylink_burn_tx") || "";
  lastBurnDomain = Number(localStorage.getItem("paylink_burn_domain") || 0);
  try {
    if (id) await loadRequest(id);
    await refreshActivity();
  } catch (e) {
    setText("payStatus", "RPC error: " + (e.message || e), "bad");
  }
})();
