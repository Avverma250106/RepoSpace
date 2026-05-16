// src/index.js

import express from "express";
import dotenv  from "dotenv";
import webhookHandler from "./server/webhook.js";

dotenv.config();

const app = express();
app.use(express.json());

app.post("/webhook", webhookHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});