import evm from "../../evm";
import Config from "../models/Config";

export async function ensureConfig() {
  const configExists = await Config.countDocuments();
  if (configExists == 0) {
    console.log("Creating new config");
    const newConfig = await Config.create({
      tokensLastBlock: ((await evm.getBlockNumber()) * BigInt(8)) / BigInt(10),
      startBlock: ((await evm.getBlockNumber()) * BigInt(8)) / BigInt(10),
    });
    await newConfig.save();
  }
}
