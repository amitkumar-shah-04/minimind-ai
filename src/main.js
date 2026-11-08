
import "./style.css";

const worker = new Worker(
  new URL("./ai-worker.js", import.meta.url),
  { type: "module" }
);

document.querySelector("#app").innerHTML = `
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-top">
        <div class="brand">
          <span class="brand-icon">✦</span>
          <strong>MiniMind</strong>
        </div>
        <button class="icon-btn" id="close-sidebar"
          title="Close sidebar">✕</button>
      </div>

      <button class="new-chat" id="new-chat">
        <span>＋</span> New chat
      </button>

      <div class="sidebar-label">Workspace</div>
      <div class="sidebar-link active">
        <span>◇</span> Current conversation
      </div>

      <div class="sidebar-bottom">
        <div class="model-indicator">
          <span class="status-dot"></span>
          <div>
            <strong id="model-label">MiniMind AI</strong>
            <small id="side-status">Not loaded</small>
          </div>
        </div>
        <small class="sidebar-note">
          Open-source · Runs in your browser
        </small>
      </div>
    </aside>

    <div class="main-area">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-btn menu-btn"
            id="menu-btn" title="Menu">☰</button>
          <div class="model-title">
            MiniMind <span class="chevron">⌄</span>
          </div>
          <span class="version">v0.5</span>
        </div>
        <button class="top-new-chat" id="top-new-chat"
          title="New chat">✎</button>
      </header>

      <main class="chat-content" id="chat-content">
        <div class="welcome" id="welcome">
          <div class="welcome-icon">✦</div>
          <h1>What can I help with?</h1>
          <p>Your lightweight open-source AI assistant.</p>

          <div class="suggestions">
            <button class="suggestion"
              data-prompt="Explain artificial intelligence simply.">
              ✧ Explain AI
            </button>
            <button class="suggestion"
              data-prompt="Write a short poem about the moon.">
              ✎ Write a poem
            </button>
            <button class="suggestion"
              data-prompt="What is Python programming?">
              &lt;/&gt; Learn Python
            </button>
          </div>
        </div>

        <div class="messages" id="messages"></div>
      </main>

      <div class="bottom-area">
        <div class="loading-panel" id="loading-panel">
          <div class="loading-info">
            <span id="status-text">Preparing AI...</span>
            <span id="loading-percent"></span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
        </div>

        <form class="composer" id="chat-form">
          <textarea
            id="prompt"
            rows="1"
            placeholder="Ask MiniMind anything"
            maxlength="1000"
            disabled
          ></textarea>
          <div class="composer-bottom">
            <span class="model-chip" id="model-chip">
              <span class="chip-dot"></span>
              Loading model
            </span>
            <button id="send" class="send-btn"
              type="submit" disabled title="Send">
              ↑
            </button>
          </div>
        </form>

        <p class="disclaimer">
          MiniMind is experimental and can make mistakes.
        </p>
      </div>
    </div>
    <div class="overlay" id="overlay"></div>
  </div>
`;

const $ = (selector) => document.querySelector(selector);

const messagesEl = $("#messages");
const welcomeEl = $("#welcome");
const chatContent = $("#chat-content");
const input = $("#prompt");
const sendBtn = $("#send");
const statusText = $("#status-text");
const sideStatus = $("#side-status");
const modelLabel = $("#model-label");
const modelChip = $("#model-chip");
const loadingPanel = $("#loading-panel");
const loadingPercent = $("#loading-percent");
const progressFill = $("#progress-fill");

let modelReady = false;
let busy = false;
let pendingBubble = null;
let pendingQuestion = null;
let pendingChatId = 0;
let chatId = 0;

const systemMessage = {
  role: "system",
  content:
    "You are MiniMind, a helpful AI assistant. " +
    "Give short, clear and factual answers. " +
    "If unsure, say you don't know."
};

let history = [systemMessage];

function updateControls() {
  input.disabled = !modelReady || busy;
  sendBtn.disabled =
    !modelReady || busy || !input.value.trim();
}

function scrollBottom() {
  chatContent.scrollTop = chatContent.scrollHeight;
}

function addMessage(text, role) {
  welcomeEl.classList.add("hidden");

  const message = document.createElement("div");
  message.className = `message ${role}`;

  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "ai-avatar";
    avatar.textContent = "✦";
    message.appendChild(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-text";
  content.textContent = text;

  message.appendChild(content);
  messagesEl.appendChild(message);

  scrollBottom();
  return content;
}

function newChat() {
  chatId++;
  history = [systemMessage];
  messagesEl.innerHTML = "";
  welcomeEl.classList.remove("hidden");
  input.value = "";
  input.style.height = "auto";
  updateControls();
  closeSidebar();
  input.focus();
}

function openSidebar() {
  $("#sidebar").classList.add("open");
  $("#overlay").classList.add("visible");
}

function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#overlay").classList.remove("visible");
}

$("#menu-btn").onclick = openSidebar;
$("#close-sidebar").onclick = closeSidebar;
$("#overlay").onclick = closeSidebar;
$("#new-chat").onclick = newChat;
$("#top-new-chat").onclick = newChat;

document.querySelectorAll(".suggestion").forEach((button) => {
  button.onclick = () => {
    input.value = button.dataset.prompt;
    updateControls();
    input.focus();
  };
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height =
    Math.min(input.scrollHeight, 160) + "px";
  updateControls();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey &&
      !event.isComposing) {
    event.preventDefault();
    if (!sendBtn.disabled) {
      $("#chat-form").requestSubmit();
    }
  }
});

$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();

  if (!modelReady || busy) return;

  const question = input.value.trim();
  if (!question) return;

  busy = true;
  pendingChatId = chatId;
  pendingQuestion = question;

  addMessage(question, "user");
  pendingBubble = addMessage("Thinking...", "assistant");
  pendingBubble.classList.add("thinking");

  input.value = "";
  input.style.height = "auto";
  updateControls();

  modelChip.textContent = "✦ Thinking...";

  worker.postMessage({
    type: "generate",
    messages: [
      ...history,
      { role: "user", content: question }
    ]
  });
});

worker.onmessage = (event) => {
  const {
    type, file, progress, reply,
    seconds, message, model
  } = event.data;

  if (type === "status") {
    statusText.textContent = message;
    sideStatus.textContent = "Loading...";
  }

  if (type === "progress") {
    loadingPanel.classList.add("visible");
    const percentage = Math.max(
      0, Math.min(100, Number(progress) || 0)
    );
    statusText.textContent = "Downloading AI model";
    loadingPercent.textContent =
      `${percentage}%`;
    progressFill.style.width = percentage + "%";
  }

  if (type === "ready") {
    modelReady = true;
    loadingPanel.classList.remove("visible");
    sideStatus.textContent = "Ready";
    modelLabel.textContent = model || "MiniMind AI";
    modelChip.textContent = "● AI Ready";
    modelChip.classList.add("ready");
    updateControls();
    input.focus();
  }

  if (type === "complete") {
    const answer = String(reply || "No response");

    if (pendingBubble) {
      pendingBubble.classList.remove("thinking");
      pendingBubble.textContent = answer;
    }

    // Ignore an old reply if New Chat was clicked.
    if (pendingChatId === chatId && pendingQuestion) {
      history.push(
        { role: "user", content: pendingQuestion },
        { role: "assistant", content: answer }
      );

      history = [
        systemMessage,
        ...history.slice(1).slice(-4)
      ];
    }

    pendingBubble = null;
    pendingQuestion = null;
    busy = false;

    sideStatus.textContent = `Ready · ${seconds}s`;
    modelChip.textContent = `● Ready · ${seconds}s`;

    updateControls();
    scrollBottom();
    input.focus();
  }

  if (type === "error") {
    if (pendingBubble) {
      pendingBubble.classList.remove("thinking");
      pendingBubble.textContent =
        "Something went wrong: " + message;
    }

    pendingBubble = null;
    pendingQuestion = null;
    busy = false;

    loadingPanel.classList.remove("visible");
    sideStatus.textContent = "Error";
    modelChip.textContent = "Model error";

    if (!modelReady) {
      statusText.textContent =
        "Model failed to load. Refresh to retry.";
      loadingPanel.classList.add("visible");
    }

    updateControls();
  }
};

worker.onerror = (event) => {
  console.error("Worker error:", event);
  sideStatus.textContent = "Worker error";
  modelChip.textContent = "Refresh to retry";
  loadingPanel.classList.add("visible");
  statusText.textContent = "AI worker failed. Refresh page.";

  if (pendingBubble) {
    pendingBubble.textContent = "Worker failed.";
  }

  modelReady = false;
  busy = false;
  updateControls();
};

// Auto-load the model when the website opens.
worker.postMessage({ type: "load" });
