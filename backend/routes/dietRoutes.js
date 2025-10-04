// backend/routes/dietRoutes.js
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

const { interpretCondition, generatePlan } = require("../services/recommender");

// load conditions list for dropdown
router.get("/conditions", (req, res) => {
  const conditionsPath = path.join(__dirname, "..", "database", "conditions.json");
  const raw = fs.readFileSync(conditionsPath);
  const list = JSON.parse(raw);
  res.json({ status: "ok", conditions: list });
});

// main recommend endpoint
router.post("/recommend", async (req, res) => {
  try {
    const { symptomsText = "", conditionCode = "", preferences = {}, days = 1, allergies = [] } = req.body;

    // interpret or validate condition
    const interpretation = await interpretCondition({ symptomsText, conditionCode });

    // generate a plan
    const plan = await generatePlan({
      condition: interpretation,
      preferences,
      allergies,
      days: parseInt(days) || 1,
    });

    res.json({ status: "ok", condition: interpretation, plan });
  } catch (err) {
    console.error("Error in /recommend:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;
