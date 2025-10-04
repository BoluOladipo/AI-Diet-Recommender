// backend/routes/chatbotRoutes.js
const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// POST /api/chat
router.post("/", async (req, res) => {
  try {
    const { message, history } = req.body;

    const messages = [
      { role: "system", content: "You are a smart and friendly AI assistant that can talk about anything, not just food. Be clear, helpful, and engaging." },
      ...(history || []),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
      max_tokens: 500,
      temperature: 0.8,
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Chatbot failed to respond" });
  }
});

module.exports = router;

