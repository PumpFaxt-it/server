import crypto from "crypto";
import contracts from "./contracts";

import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  publicActions,
} from "viem";
import { hardhat } from "viem/chains";

const rpcUrl = "http://127.0.0.1:8545/";
const pvtKey = crypto.randomBytes(32).toString("hex");

const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(rpcUrl),
});

const client = createWalletClient({
  chain: hardhat,
  transport: http(rpcUrl),
  key: pvtKey,
}).extend(publicActions);

const pumpItFaxt = getContract({
  ...contracts.pumpItFaxtInterface,
  client: { public: publicClient, wallet: client },
});

async function getBlockNumber() {
  return await client.getBlockNumber();
}

export default { client, pumpItFaxt, getBlockNumber };
