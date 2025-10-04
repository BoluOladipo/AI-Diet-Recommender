// frontend/app.js
const conditionSelect = document.getElementById("conditionSelect");
const symptomsInput = document.getElementById("symptoms");
const allergiesInput = document.getElementById("allergies");
const daysSelect = document.getElementById("days");
const generateBtn = document.getElementById("generateBtn");
const loadingEl = document.getElementById("loading");
const resultArea = document.getElementById("resultArea");
const actions = document.getElementById("actions");
const downloadPdfBtn = document.getElementById("downloadPdf");

let latestPlan = null;
let latestCondition = null;

const BASE_URL = "http://localhost:5000";

async function loadConditions(){
  try {
    const res = await fetch(`${BASE_URL}/api/diet/conditions`);     
    const data = await res.json();
    if (data?.conditions) {
      conditionSelect.innerHTML = `<option value="">-- choose or type symptoms --</option>` +
        data.conditions.map(c => `<option value="${c.code}">${c.name}</option>`).join("");
    }
  } catch (e) {
    console.error("Could not load conditions", e);
  }
}

function showLoading(show){
  loadingEl.classList.toggle("hidden", !show);
  generateBtn.disabled = show;
  if (show) {
    resultArea.innerHTML = "";
    actions.classList.add("hidden");
  }
}

function renderPlan(plan, condition){
  latestPlan = plan;
  latestCondition = condition;
  resultArea.innerHTML = "";
  actions.classList.remove("hidden");

  plan.forEach((day, idx) => {
    const card = document.createElement("div");
    card.className = "day-card";
    const inner = document.createElement("div");
    inner.innerHTML = `<h3>${day.day} — Condition: ${condition.name}</h3>`;
    day.meals.forEach(meal => {
      const nut = meal.nutrients;
      const violations = (meal.violations || []).map(v => v.reason || JSON.stringify(v)).join(", ");
      const mealHtml = `
        <div class="meal-row">
          <div class="meal-meta">
            <h4>${meal.mealType}: ${meal.title}</h4>
            <p style="margin:6px 0;color:#475569">Calories: ${nut.calories} kcal • Protein: ${nut.protein}g • Carbs: ${nut.carbs}g • Fat: ${nut.fat}g • Sodium: ${nut.sodium}mg</p>
            <p style="margin:4px 0;color:#0f172a"><strong>Notes:</strong> ${meal.violations.length? "⚠️ "+violations : "Suitable"}</p>
            <details>
              <summary style="cursor:pointer;color:var(--accent)">Recipe / Steps</summary>
              <ol style="margin:8px 0 12px 18px">
                ${meal.recipeSteps.map(s => `<li>${s}</li>`).join("")}
              </ol>
            </details>
          </div>
          <div class="meal-score">${meal.suitabilityScore}%</div>
        </div>
      `;
      inner.innerHTML += mealHtml;
    });
    card.appendChild(inner);
    resultArea.appendChild(card);
    // animate appearance
    setTimeout(()=>card.classList.add("show"), 150 + idx*120);
  });
}

async function generate(){
  const symptoms = symptomsInput.value.trim();
  const conditionCode = conditionSelect.value;
  const allergies = allergiesInput.value.split(",").map(s => s.trim()).filter(Boolean);
  const days = daysSelect.value || "1";
  if (!symptoms && !conditionCode) {
    alert("Please enter symptoms or choose a condition.");
    return;
  }

  showLoading(true);
  try {
    const res = await fetch(`${BASE_URL}/api/diet/recommend`, { 
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ symptomsText: symptoms, conditionCode, preferences: {}, allergies, days })
    });
    const data = await res.json();
    if (data.status === "ok") {
      renderPlan(data.plan, data.condition);
    } else {
      alert("Error generating plan: " + (data.message || "unknown"));
    }
  } catch (e) {
    console.error(e);
    alert("Could not reach server. Make sure server is running.");
  } finally {
    showLoading(false);
  }
}

generateBtn.addEventListener("click", generate);
downloadPdfBtn.addEventListener("click", () => {
  if (!latestPlan) return alert("No plan to download");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("AI Nutrition Advisor - Meal Plan", 14, 20);
  doc.setFontSize(10);
  let y = 30;
  latestPlan.forEach(day => {
    doc.setFontSize(12);
    doc.text(day.day, 14, y);
    y += 6;
    day.meals.forEach(meal => {
      doc.setFontSize(10);
      doc.text(`${meal.mealType}: ${meal.title} — ${meal.suitabilityScore}%`, 16, y);
      y += 5;
      doc.text(`Calories: ${meal.nutrients.calories} kcal • Protein: ${meal.nutrients.protein}g • Sodium: ${meal.nutrients.sodium}mg`, 18, y);
      y += 6;
      if (y > 270) { doc.addPage(); y = 20; }
    });
    y += 6;
  });
  doc.save("meal-plan.pdf");
});

// load conditions on start
loadConditions();
