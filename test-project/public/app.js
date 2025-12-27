const userInput = document.getElementById("user");
const peerInput = document.getElementById("peer");
const loadButton = document.getElementById("load");
const threadEl = document.getElementById("thread");
const sendForm = document.getElementById("send");
const messageInput = document.getElementById("message");
const kvEl = document.getElementById("kv");

let pollHandle = null;
let lastRenderedCount = 0;

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(text) {
  threadEl.innerHTML = `<p class="status">${escapeHtml(text)}</p>`;
}

async function fetchMessages() {
  const user = userInput.value.trim();
  const peer = peerInput.value.trim();
  if (!user || !peer) {
    setStatus("Enter both names to load a conversation.");
    return;
  }

  const res = await fetch(`/api/messages?user=${encodeURIComponent(user)}&with=${encodeURIComponent(peer)}`);
  const data = await res.json();
  if (!data.ok) {
    setStatus(data.error || "Failed to load messages.");
    return;
  }

  if (data.messages.length === 0) {
    setStatus("No messages yet. Say hi!");
  } else {
    renderMessages(data.messages, user);
  }

  await refreshStore();
}

function renderMessages(messages, user) {
  if (messages.length === lastRenderedCount) return;
  lastRenderedCount = messages.length;
  threadEl.innerHTML = messages
    .map((msg) => {
      const who = msg.from === user ? "you" : escapeHtml(msg.from);
      const time = new Date(msg.ts).toLocaleTimeString();
      return `<div class="bubble ${msg.from === user ? "me" : "them"}">
        <div class="meta">${who} • ${time}</div>
        <div class="text">${escapeHtml(msg.text)}</div>
      </div>`;
    })
    .join("");
  threadEl.scrollTop = threadEl.scrollHeight;
}

async function refreshStore() {
  const res = await fetch("/api/store");
  const data = await res.json();
  if (!data.ok) return;
  kvEl.textContent = JSON.stringify(data.store, null, 2);
}

loadButton.addEventListener("click", () => {
  lastRenderedCount = 0;
  fetchMessages();
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(fetchMessages, 2000);
});

sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const from = userInput.value.trim();
  const to = peerInput.value.trim();
  const text = messageInput.value.trim();
  if (!from || !to || !text) {
    return;
  }

  await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, text }),
  });

  messageInput.value = "";
  lastRenderedCount = 0;
  fetchMessages();
});

setStatus("Enter two names to start a conversation.");
refreshStore();
