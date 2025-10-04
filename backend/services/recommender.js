// backend/services/recommender.js
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const dotenv = require("dotenv");
dotenv.config();

const USE_OPENAI = (process.env.USE_OPENAI || "false").toLowerCase() === "true";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

let openaiClient = null;
if (USE_OPENAI && OPENAI_KEY) {
  openaiClient = new OpenAI({ apiKey: OPENAI_KEY });
}

// helper to load json
function loadJSON(name) {
  const p = path.join(__dirname, "..", "database", name);
  const raw = fs.readFileSync(p);
  return JSON.parse(raw);
}

const foodData = loadJSON("foodData.json");     // food items -> per 100g nutrients
const recipes = loadJSON("recipes.json");       // recipes with ingredients and grams
const conditionsList = loadJSON("conditions.json"); // condition codes and constraints

// simple keyword map fallback (lots of keys for broader match)
const KEYWORD_CONDITION_MAP = {
  diabetes: "DIABETES",
  sugar: "DIABETES",
  highblood: "HYPERTENSION",
  hypertension: "HYPERTENSION",
  bloodpressure: "HYPERTENSION",
  ulcer: "ULCER",
  stomach: "ULCER",
  celiac: "CELIAC",
  gluten: "CELIAC",
  lactose: "LACTOSE",
  milk: "LACTOSE",
  kidney: "KIDNEY",
  renal: "KIDNEY",
  gout: "GOUT",
  arthritis: "GOUT",
  obese: "OBESITY",
  obesity: "OBESITY",
  cholesterol: "HYPERLIPIDEMIA",
  anemia: "ANEMIA",
  pregnancy: "PREGNANCY",
  ibs: "IBS",
  "irritable bowel": "IBS",
  reflux: "GERD",
  acidity: "GERD",
  asthma: "ASTHMA",
  headache: "MIGRAINE", // rough mapping
  migraine: "MIGRAINE",
};

// ------------ interpretCondition ---------------
// if conditionCode provided and exists → return it
// else try OpenAI (optional). fallback to keyword mapping and "GENERAL".
async function interpretCondition({ symptomsText = "", conditionCode = "" }) {
  // if explicit and exists
  if (conditionCode) {
    const found = conditionsList.find(c => c.code === conditionCode.toUpperCase());
    if (found) return found;
  }

  // try OpenAI if enabled
  if (USE_OPENAI && openaiClient) {
    try {
      const prompt = `User symptoms: "${symptomsText}". 
Return the best matching condition code from this list (JSON): ${JSON.stringify(conditionsList.map(c=>({code:c.code,name:c.name})))}
If unsure, return code "GENERAL". Output only JSON: {"code":"...","name":"...","notes":"..."}.
`;
      const r = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
        max_tokens: 200,
      });
      const text = r.choices?.[0]?.message?.content || "";
      try {
        const parsed = JSON.parse(text);
        const found = conditionsList.find(c => c.code === parsed.code);
        if (found) {
          // attach any notes
          return { ...found, notes: parsed.notes || "" };
        }
      } catch (e) {
        // ignore parse errors and fallback
      }
    } catch (e) {
      console.warn("OpenAI interpretCondition error:", e.message || e);
    }
  }

  // fallback keyword map (scan words)
  const lower = (symptomsText || "").toLowerCase();
  for (const [key, code] of Object.entries(KEYWORD_CONDITION_MAP)) {
    if (lower.includes(key)) {
      const found = conditionsList.find(c => c.code === code);
      if (found) return found;
    }
  }

  // default
  return conditionsList.find(c => c.code === "GENERAL") || { code: "GENERAL", name: "General/Default", bannedIngredients: [], nutrientConstraints: {} };
}

// ------------- utility: compute nutrients for a recipe --------------
function computeRecipeNutrients(recipe) {
  // recipe.ingredients = [{ name: "Pap", grams: 200 }, ...]
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0 };
  for (const ing of recipe.ingredients) {
    const fd = foodData.find(f => f.name.toLowerCase() === ing.name.toLowerCase());
    if (!fd) continue;
    const factor = (ing.grams || 100) / 100.0;
    totals.calories += (fd.calories || 0) * factor;
    totals.protein += (fd.protein || 0) * factor;
    totals.carbs += (fd.carbs || 0) * factor;
    totals.fat += (fd.fat || 0) * factor;
    totals.sodium += (fd.sodium || 0) * factor;
    totals.sugar += (fd.sugar || 0) * factor;
  }
  // round
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 10) / 10;
  return totals;
}

// -------------- check if recipe contains banned ingredients or allergies --------------
function recipeViolations(recipe, condition, allergies = []) {
  const banned = (condition.bannedIngredients || []).map(b => b.toLowerCase());
  const ingNames = recipe.ingredients.map(i => (i.name || "").toLowerCase());
  const violations = [];
  // banned ingredients
  for (const b of banned) {
    if (ingNames.some(i => i.includes(b) || b.includes(i))) violations.push({ type: "banned_ingredient", reason: b });
  }
  // allergies
  for (const a of (allergies || [])) {
    const low = (a || "").toLowerCase();
    for (const ing of ingNames) {
      if (ing.includes(low) || low.includes(ing)) violations.push({ type: "allergy", reason: a });
    }
  }

  // nutrient constraint checks (simple)
  const nut = computeRecipeNutrients(recipe);
  const nc = condition.nutrientConstraints || {};
  if (nc.sodiumMax && nut.sodium > nc.sodiumMax) violations.push({ type: "sodium", reason: `sodium ${nut.sodium}mg > ${nc.sodiumMax}mg` });
  if (nc.sugarMax && nut.sugar > nc.sugarMax) violations.push({ type: "sugar", reason: `sugar ${nut.sugar}g > ${nc.sugarMax}g` });
  if (nc.caloriesMax && nut.calories > nc.caloriesMax) violations.push({ type: "calories", reason: `calories ${nut.calories} > ${nc.caloriesMax}` });

  return { count: violations.length, violations, nutrients: nut };
}

// --------------- generatePlan --------------
async function generatePlan({ condition, preferences = {}, allergies = [], days = 1 }) {
  const chosen = [];
  // filter recipes by preferences (if user wants vegetarian etc)
  const preferNo = (preferences.exclude || []).map(s => s.toLowerCase());

  // build candidate list
  const candidates = recipes.filter(r => {
    // check if recipe title includes excluded word like 'fried' if preferences exclude fried
    const title = r.title.toLowerCase();
    for (const ex of preferNo) if (title.includes(ex)) return false;
    return true;
  });

  // For each recipe precompute nutrients and violations
  const scored = candidates.map(r => {
    const nut = computeRecipeNutrients(r);
    const vio = recipeViolations(r, condition, allergies);
    // base score 100, subtract 40 per violation and penalty for sodium/sugar proportionally
    let score = 100 - (vio.count * 30);
    // extra sodium penalty
    if ((condition.nutrientConstraints || {}).sodiumMax) {
      const smax = condition.nutrientConstraints.sodiumMax;
      if (nut.sodium > smax) score -= Math.min(30, Math.round((nut.sodium - smax) / 10));
    }
    if (score < 0) score = 0;
    return { recipe: r, nutrients: nut, violations: vio.violations, score: Math.round(score) };
  });

  // sort by score desc
  scored.sort((a, b) => b.score - a.score);

  // build day by day plan (breakfast, lunch, dinner)
  const plan = [];
  for (let d = 0; d < days; d++) {
    const day = { day: `Day ${d + 1}`, meals: [] };
    // pick top available 3 recipes (ensuring variety)
    const taken = new Set();
    const mealNames = ["Breakfast", "Lunch", "Dinner"];
    for (let i = 0; i < 3; i++) {
      // find next highest not taken and not violating allergy too much
      const pick = scored.find(s => !taken.has(s.recipe.id));
      if (!pick) break;
      taken.add(pick.recipe.id);
      day.meals.push({
        mealType: mealNames[i],
        recipeId: pick.recipe.id,
        title: pick.recipe.title,
        nutrients: pick.nutrients,
        suitabilityScore: pick.score,
        violations: pick.violations,
        recipeSteps: pick.recipe.steps || [],
      });
    }
    plan.push(day);
  }

  return plan;
}

module.exports = { interpretCondition, generatePlan };
