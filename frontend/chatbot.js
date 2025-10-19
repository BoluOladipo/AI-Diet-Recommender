const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatWindow = document.getElementById("chatWindow");

let chatHistory = [];

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const userMsg = chatInput.value.trim();
  if (!userMsg) return;

  // Display user message
  const userBubble = document.createElement("div");
  userBubble.className = "user-bubble";
  userBubble.textContent = userMsg;
  chatWindow.appendChild(userBubble);

  chatInput.value = "";

  const loadingBubble = document.createElement("div");
  loadingBubble.className = "bot-bubble loading";
  loadingBubble.textContent = "Thinking...";
  chatWindow.appendChild(loadingBubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    const res = await fetch("https://ai-diet-recommender-1hsu.onrender.com/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMsg, history: chatHistory }),
    });

    const data = await res.json();
    loadingBubble.remove();

    const botBubble = document.createElement("div");
    botBubble.className = "bot-bubble";
    botBubble.textContent = data.reply || "Sorry, I couldn’t process that.";
    chatWindow.appendChild(botBubble);

    chatHistory.push({ role: "user", content: userMsg });
    chatHistory.push({ role: "assistant", content: data.reply });

    // ✅ Auto-scroll to the bottom when new message appears
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } catch (err) {
    loadingBubble.remove();
    const errorBubble = document.createElement("div");
    errorBubble.className = "bot-bubble error";
    errorBubble.textContent = "⚠️ Could not reach AI server.";
    chatWindow.appendChild(errorBubble);
  }
});

// ✅ Keeps scroll stable when window resizes (like on keyboard open)
window.addEventListener("resize", () => {
  chatWindow.scrollTop = chatWindow.scrollHeight;
});
