import express from "express";
import evm from "../../evm";
import Config from "../models/Config";
import contracts from "../../contracts";
import Token from "../models/Token";
import { getContract, isAddress } from "viem";
import { watchAllTrades } from "../hooks";
import PriceFeed from "../models/PriceFeed";
import { ONE_FRAX } from "../../config";
const router = express.Router();

router.post("/refresh", async (req, res) => {
  try {
    const config = await Config.findOne({});
    if (!config) throw "No config found";

    const tokens = await evm.client.getContractEvents({
      ...contracts.pumpItFaxtInterface,
      eventName: "Launch",
      fromBlock: config.tokensLastBlock,
      toBlock: "latest",
    });

    tokens.forEach(async (item) => {
      const tokenAddress = item.args.token;

      if (!tokenAddress) return;

      const token = getContract({
        abi: contracts.token.abi,
        address: tokenAddress,
        client: evm.client,
      });

      const metadata = JSON.parse(await token.read.metadata());

      await Token.deleteOne({ address: token.address });

      const newToken = await Token.create({
        address: token.address,
        creator: await token.read.creator(),
        name: await token.read.name(),
        totalSupply: Number((await token.read.totalSupply()) / evm.ONE_TOKEN),
        symbol: await token.read.symbol(),
        image: await token.read.image(),
        description: metadata.description,
        telegram: metadata.telegram,
        twitter: metadata.twitter,
        website: metadata.website,
      });

      await PriceFeed.deleteOne({ address: token.address });

      const priceFeed = await PriceFeed.create({
        address: token.address,
        lastRefreshedBlock: await evm.getBlockNumber(),
        data: [{ time: Date.now() - 1000 * 60, mktCap: 0, value: 0 }],
      });

      await priceFeed.save();
      await newToken.save();
      const updatedConfig = await Config.findOneAndUpdate(
        {},
        { $set: { tokensLastBlock: item.blockNumber } }
      );
      updatedConfig?.save();
    });

    return res.status(200).send({ message: "Success" });
  } catch (err) {
    console.error(err);

    return res.sendStatus(500);
  }
});

router.get("/", async (req, res) => {
  try {
    const page =
      (typeof req.query.page == "string" && parseInt(req.query.page)) || 1;
    const limit =
      (typeof req.query.limit == "string" && parseInt(req.query.limit)) || 10;

    const startIndex = (page - 1) * limit;

    const response = {
      total: 0,
      tokens: [],
    };

    const total = await Token.countDocuments();

    response.total = total;

    response.tokens = await Token.find(
      {},
      {},
      { limit: limit, skip: startIndex }
    );
    res.status(200).send(response);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: err });
  }
});

router.get("/:address", async (req, res) => {
  try {
    const { address } = req.params;
    if (typeof address != "string") return res.sendStatus(400);

    const token = await Token.findOne({ address: address });

    if (!token) return res.sendStatus(404);

    return res.status(200).send({ token: token });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

router.get("/:address/feed", async (req, res) => {
  const { address } = req.params;

  if (!isAddress(address)) return res.sendStatus(400);

  const feed = await PriceFeed.findOne({ address: address });

  if (!feed) {
    const token = await Token.findOne({ address: address });
    if (!token) return res.sendStatus(404);

    const config = await Config.findOne({});

    if (!config) return res.sendStatus(500);

    const newFeed = await PriceFeed.create({
      address: address,
      data: [],
      lastRefreshedBlock: config.startBlock,
    });
    await newFeed.save();

    return res.status(200).send({ data: newFeed.data });
  }

  const eventsFeed = await evm.client.getContractEvents({
    ...contracts.token,
    address: address,
    eventName: "PriceChange",
    fromBlock: feed.lastRefreshedBlock,
    toBlock: "latest",
  });

  eventsFeed.forEach(
    async (item) =>
      await PriceFeed.updateOne(
        { address: address },
        {
          $set: { lastRefreshedBlock: item.blockNumber + BigInt(1) },
          $push: {
            data: {
              time: Number(item.args.time),
              value: Number(item.args.value) / Number(ONE_FRAX),
              mktCap: Number(item.args.marketCap) / Number(ONE_FRAX),
            },
          },
        }
      )
  );

  return res.status(200).send({ data: feed.data });
});

router.get("/by-user/:address", async (req, res) => {
  const { address } = req.params;

  if (typeof address != "string" || !isAddress(address))
    return res.sendStatus(400);

  const tokens = await Token.find({ creator: req.params.address });

  if (!tokens) return res.sendStatus(404);

  return res.status(200).send({ tokens: tokens });
});

export default router;
