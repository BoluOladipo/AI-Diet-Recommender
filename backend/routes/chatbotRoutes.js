const express = require("express");
const axios = require("axios");
const router = express.Router();


const OPENAI_API_KEY = "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";

router.post("/", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ reply: "Please enter a message." });

    const messages = [
      {
        role: "system",
        content: "You are an intelligent and conversational AI assistant capable of discussing any topic with reasoning, accuracy, and empathy. Provide helpful and context-aware responses."
      },
      ...history,
      { role: "user", content: message }
    ];

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini", // reliable & cheaper alternative
        messages,
        temperature: 0.9
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content || "Hmm... I didn’t catch that.";
    res.json({ reply });
  } catch (error) {
    console.error("Chatbot Error:", error.response?.data || error.message);
    res.status(500).json({ reply: "Sorry, I couldn’t process that at the moment. Please try again." });
  }
});

module.exports = router;
