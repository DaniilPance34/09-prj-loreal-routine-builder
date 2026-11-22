// Project 9: Product-aware routine builder. No API secrets belong in this file.
// Paste your class-hosted Cloudflare Worker URL here (it must accept { messages }).
const WORKER_URL = "https://loreal-beauty-chatbot.daniilp-8a9.workers.dev";
const categoryFilter = document.getElementById("categoryFilter");
const searchInput = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedList = document.getElementById("selectedProductsList");
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const generateButton = document.getElementById("generateRoutine");
const clearButton = document.getElementById("clearSelections");
const statusText = document.getElementById("statusText");
let products = [];
let selectedIds = [];
let messages = [];
let busy = false;

try {
  const saved = JSON.parse(localStorage.getItem("loreal-selected-products") || "[]");
  selectedIds = Array.isArray(saved) ? saved.map(Number) : [];
} catch (error) { selectedIds = []; }

function saveSelection() {
  localStorage.setItem("loreal-selected-products", JSON.stringify(selectedIds));
}
function makeElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}
function toggleProduct(id) {
  selectedIds = selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id];
  saveSelection();
  renderProducts();
  renderSelected();
}
function renderProducts() {
  const category = categoryFilter.value;
  const search = searchInput.value.trim().toLowerCase();
  const matching = products.filter(product =>
    (!category || product.category === category) &&
    (!search || `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase().includes(search))
  );
  productsContainer.replaceChildren();
  statusText.textContent = `${matching.length} products available · ${selectedIds.length} selected`;
  if (!matching.length) {
    productsContainer.append(makeElement("p", "empty-state", "No matching products. Try another category or search."));
    return;
  }
  matching.forEach(product => {
    const selected = selectedIds.includes(product.id);
    const card = makeElement("article", `product-card ${selected ? "is-selected" : ""}`);
    const image = makeElement("img", "product-image");
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";
    const info = makeElement("div", "product-info");
    info.append(makeElement("span", "brand", product.brand), makeElement("h3", "", product.name));
    const categoryText = makeElement("span", "category-pill", product.category);
    const details = makeElement("details", "product-details");
    details.append(makeElement("summary", "", "Product description"), makeElement("p", "", product.description));
    const selectButton = makeElement("button", `select-btn ${selected ? "active" : ""}`, selected ? "✓ Selected — remove" : "+ Add to routine");
    selectButton.type = "button";
    selectButton.setAttribute("aria-pressed", String(selected));
    selectButton.addEventListener("click", () => toggleProduct(product.id));
    info.append(categoryText, details, selectButton);
    card.append(image, info);
    productsContainer.append(card);
  });
}
function renderSelected() {
  selectedList.replaceChildren();
  const chosen = products.filter(product => selectedIds.includes(product.id));
  if (!chosen.length) selectedList.append(makeElement("p", "empty-state", "No products selected yet. Choose products above to get started."));
  chosen.forEach(product => {
    const item = makeElement("div", "selected-item");
    item.append(makeElement("span", "", `${product.brand} · ${product.name}`));
    const remove = makeElement("button", "remove-btn", "Remove");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${product.name}`);
    remove.addEventListener("click", () => toggleProduct(product.id));
    item.append(remove);
    selectedList.append(item);
  });
  clearButton.disabled = !chosen.length;
  generateButton.disabled = !chosen.length || busy;
}
function formatAIResponse(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ");
}
function addMessage(role, content) {
  const formattedContent =
    role === "assistant" ? formatAIResponse(content) : content;

  const bubble = makeElement(
    "div",
    `message ${role === "user" ? "user-message" : "assistant-message"}`,
    formattedContent
  );

  chatWindow.append(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function setBusy(value) {
  busy = value;
  generateButton.disabled = value || selectedIds.length === 0;
  document.getElementById("sendBtn").disabled = value;
  userInput.disabled = value;
  generateButton.textContent = value ? "Generating…" : "✦ Generate Routine";
}
const systemPrompt = `You are a friendly, knowledgeable L'Oréal beauty routine advisor. Only discuss skincare, haircare, makeup, fragrance, grooming, beauty products and the user's generated routine. Politely redirect unrelated requests. Use ONLY the selected product JSON supplied by the user when recommending items from their selection; never invent product names or product properties. Explain morning/evening order, frequency, compatibility and basic precautions when relevant. Avoid medical diagnosis or guarantees; suggest professional care for significant reactions. Keep replies clear and practical.`;
async function askAI(content, newRoutine = false) {
  if (busy) return;
  if (!WORKER_URL || !/^https:\/\//.test(WORKER_URL)) {
    addMessage("assistant", "AI setup needed: add your class Cloudflare Worker HTTPS URL to WORKER_URL near the top of script.js. Your selections and product search work without it.");
    return;
  }
  if (newRoutine) {
    messages = [{ role: "system", content: systemPrompt }];
    chatWindow.replaceChildren();
  }
  messages.push({ role: "user", content });
  addMessage("user", newRoutine ? "Build my personalized routine from my selected products." : content);
  setBusy(true);
  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });
    if (!response.ok) throw new Error(`Worker returned HTTP ${response.status}`);
    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) throw new Error("Worker returned an unexpected response format");
    messages.push({ role: "assistant", content: reply });
    addMessage("assistant", reply);
  } catch (error) {
    messages.pop(); // Failed requests should not pollute conversation history.
    addMessage("assistant", `I couldn't reach the AI service: ${error.message}. Check your Worker URL, deployment and CORS settings.`);
  } finally { setBusy(false); }
}
categoryFilter.addEventListener("change", renderProducts);
searchInput.addEventListener("input", renderProducts);
clearButton.addEventListener("click", () => { selectedIds = []; saveSelection(); renderProducts(); renderSelected(); });
document.getElementById("rtlToggle").addEventListener("change", event => {
  document.documentElement.dir = event.target.checked ? "rtl" : "ltr";
  localStorage.setItem("loreal-rtl", event.target.checked ? "1" : "0");
});
const rtlSaved = localStorage.getItem("loreal-rtl") === "1";
document.getElementById("rtlToggle").checked = rtlSaved;
document.documentElement.dir = rtlSaved ? "rtl" : "ltr";
generateButton.addEventListener("click", () => {
  const chosen = products.filter(product => selectedIds.includes(product.id));
  if (!chosen.length) return;
  const payload = chosen.map(({ id, name, brand, category, description }) => ({ id, name, brand, category, description }));
  askAI(`Create a personalized, practical beauty routine using ONLY these selected products (JSON):\n${JSON.stringify(payload, null, 2)}\nExplain the order, timing and any safety considerations. If products serve unrelated purposes, organize into relevant sections.`, true);
});
chatForm.addEventListener("submit", event => {
  event.preventDefault();
  const question = userInput.value.trim();
  if (!question || busy) return;
  if (!messages.length) {
    addMessage("assistant", "First select products and click Generate Routine. Then ask me follow-up questions about your routine.");
    return;
  }
  userInput.value = "";
  askAI(question);
});
async function loadProducts() {
  try {
    const response = await fetch("products.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.products)) throw new Error("Invalid product data");
    products = data.products;
    selectedIds = selectedIds.filter(id => products.some(product => product.id === id));
    saveSelection();
    renderProducts();
    renderSelected();
  } catch (error) {
    productsContainer.append(makeElement("p", "empty-state", `Unable to load products: ${error.message}. Open the project through a local web server or GitHub Pages, not as a file:// URL.`));
  }
}
loadProducts();
