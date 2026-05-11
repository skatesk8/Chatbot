const chatForm = document.getElementById('chatForm');
const questionInput = document.getElementById('questionInput');
const chatMessages = document.getElementById('chatMessages');
const chatList = document.getElementById('chatList');
const newChatButton = document.getElementById('newChatButton');

let currentChatId = localStorage.getItem('currentChatId');

function addMessage(type, text, sources = []) {
  const message = document.createElement('div');
  message.className = `message ${type}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (window.marked) {
    bubble.innerHTML = marked.parse(text || '');
  } else {
    bubble.textContent = text || '';
  }

  if (sources && sources.length) {
    const sourcesBox = document.createElement('div');
    sourcesBox.className = 'sources';

    const title = document.createElement('h4');
    title.textContent = 'Sources:';
    sourcesBox.appendChild(title);

    sources.forEach((source) => {
      const item = document.createElement('div');
      item.className = 'source-item';

      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title || 'View source';

      item.appendChild(link);

      if (source.type) {
        const type = document.createElement('span');
        type.textContent = ` — ${source.type}`;
        item.appendChild(type);
      }

      sourcesBox.appendChild(item);
    });

    bubble.appendChild(sourcesBox);
  }

  message.appendChild(bubble);
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearMessages() {
  chatMessages.innerHTML = '';
}

async function loadChatList() {
  const response = await fetch('/api/chats');
  const data = await response.json();

  if (!data.success) return;

  chatList.innerHTML = '';

  data.chats.forEach((chat) => {
    const button = document.createElement('button');
    button.className = 'chat-item';

    if (String(chat.id) === String(currentChatId)) {
      button.classList.add('active');
    }

    button.textContent = chat.title || 'New Chat';

    button.addEventListener('click', async () => {
      currentChatId = chat.id;
      localStorage.setItem('currentChatId', currentChatId);
      await loadCurrentChat();
      await loadChatList();
    });

    chatList.appendChild(button);
  });
}

async function createChat() {
  const response = await fetch('/api/chats', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'New Chat',
      user_identifier: 'guest'
    })
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Could not create chat');
  }

  currentChatId = data.chat.id;
  localStorage.setItem('currentChatId', currentChatId);

  await loadChatList();

  return currentChatId;
}

async function loadCurrentChat() {
  if (!currentChatId) {
    await createChat();
    addMessage('bot', 'Hello! I can help you learn more about Air Techniques products, dealers, training programs, and sales contacts.');
    return;
  }

  const response = await fetch(`/api/chats/${currentChatId}`);
  const data = await response.json();

  if (!data.success) {
    localStorage.removeItem('currentChatId');
    currentChatId = null;
    await createChat();
    addMessage('bot', 'Hello! I can help you learn more about Air Techniques products, dealers, training programs, and sales contacts.');
    return;
  }

  clearMessages();

  if (!data.messages.length) {
    addMessage('bot', 'Hello! I can help you learn more about Air Techniques products, dealers, training programs, and sales contacts.');
    return;
  }

  data.messages.forEach((msg) => {
    addMessage(
      msg.role === 'assistant' ? 'bot' : 'user',
      msg.message,
      msg.sources || []
    );
  });
}

async function sendQuestion(question) {
  if (!currentChatId) {
    await createChat();
  }

  const response = await fetch(`/api/chats/${currentChatId}/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ question })
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'An error occurred');
  }

  return data;
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const question = questionInput.value.trim();

  if (!question) return;

  addMessage('user', question);
  questionInput.value = '';

  const button = chatForm.querySelector('button');
  button.disabled = true;
  button.textContent = 'Thinking...';

  addMessage('bot', 'Searching information...');

  try {
    const data = await sendQuestion(question);

    const lastBotMessage = chatMessages.querySelector('.message.bot:last-child');
    if (lastBotMessage) lastBotMessage.remove();

    addMessage('bot', data.answer, data.sources || []);
    await loadChatList();
  } catch (error) {
    const lastBotMessage = chatMessages.querySelector('.message.bot:last-child');
    if (lastBotMessage) lastBotMessage.remove();

    addMessage('bot', `Error: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Send';
    questionInput.focus();
  }
});

newChatButton.addEventListener('click', async () => {
  clearMessages();
  await createChat();
  addMessage('bot', 'Hello! I can help you learn more about Air Techniques products, dealers, training programs, and sales contacts.');
});

(async function init() {
  await loadCurrentChat();
  await loadChatList();
})();
