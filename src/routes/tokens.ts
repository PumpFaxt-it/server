import express from "express";
import Token from "../models/Token";
import { isAddress } from "viem";
import { refreshTokens } from "../utils";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    await refreshTokens();

    const page =
      (typeof req.query.page == "string" && parseInt(req.query.page)) || 1;
    const limit =
      (typeof req.query.limit == "string" && parseInt(req.query.limit)) || 10;
    const query = req.query.q as string;

    const startIndex = (page - 1) * limit;

    const response = {
      total: 0,
      tokens: [],
    };

    let tokenQuery = {};

    if (query) {
      tokenQuery = {
        $or: [
          { name: new RegExp(query, "i") },
          { symbol: new RegExp(query, "i") },
          { description: new RegExp(query, "i") },
        ],
      };
    }

    const total = await Token.countDocuments(tokenQuery);

    response.total = total;

    response.tokens = await Token.find(
      tokenQuery,
      { replies: false },
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

router.post("/:address/reply", async (req, res) => {
  try {
    const { reply } = req.body;
    if (typeof reply != "string") return res.sendStatus(400);

    const { address } = req.params;
    if (typeof address != "string") return res.sendStatus(400);

    const replyData = JSON.parse(reply);

    if (!replyData.author || !replyData.content) return res.sendStatus(400);

    const token = await Token.findOneAndUpdate(
      { address: address },
      {
        $push: {
          replies: JSON.stringify({ ...replyData, timestamp: Date.now() }),
        },
      }
    );
    await token?.save();

    return res.status(200).send({ message: "Success" });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
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
