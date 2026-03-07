//src/index.js

import express from "express";
import dotenv from "dotenv";
import webhookHandler from "./server/webhook.js";

dotenv.config();

const app = express();
app.use(express.json());

app.post("/webhook", webhookHandler);

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
