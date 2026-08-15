const inputField = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const typingIndicator = document.getElementById('typing-indicator');
const themeToggle = document.getElementById('theme-toggle');

let history = [];

// --- Theme Toggle Logic ---
const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
}

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    let theme = 'light';
    if (document.body.classList.contains('dark-mode')) {
        theme = 'dark';
        themeToggle.textContent = '☀️';
    } else {
        themeToggle.textContent = '🌙';
    }
    localStorage.setItem('theme', theme);
});

// --- UI Helpers ---
function scrollToBottom() { 
    chatMessages.scrollTop = chatMessages.scrollHeight; 
}

function appendMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
    
    // Parse Markdown text into HTML for bot responses
    if(sender === 'bot') {
        msgDiv.innerHTML = marked.parse(text);
    } else {
        msgDiv.textContent = text;
    }
    
    chatMessages.insertBefore(msgDiv, typingIndicator);
    scrollToBottom();
}

function sendQuickPrompt(promptText) {
    inputField.value = promptText;
    handleSend();
}

// --- Textarea Dynamic Resizing & Shift+Enter ---
inputField.addEventListener('input', function() {
    this.style.height = 'auto'; // Reset height
    this.style.height = (this.scrollHeight) + 'px'; // Expand to fit text
});

inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (e.shiftKey) {
            // Do nothing, browser adds a new line naturally
        } else {
            e.preventDefault(); // Stop newline
            handleSend();       // Send the message
        }
    }
});

// --- API Communication ---
async function handleSend() {
    const text = inputField.value.trim();
    if (!text) return;

    // Reset input box
    inputField.value = '';
    inputField.style.height = 'auto'; 
    
    // Add user message to UI
    appendMessage(text, 'user');
    history.push({ role: 'user', content: text });

    // Show typing dots
    typingIndicator.style.display = 'block';
    scrollToBottom();
    sendBtn.disabled = true;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history: history })
        });
        const data = await res.json();
        
        typingIndicator.style.display = 'none';
        sendBtn.disabled = false;

        if (data.reply) {
            appendMessage(data.reply, 'bot');
            history.push({ role: 'assistant', content: data.reply });
        } else {
            appendMessage("Unable to fetch response. Please try again.", 'bot');
        }
    } catch (err) {
        typingIndicator.style.display = 'none';
        sendBtn.disabled = false;
        appendMessage("Network error. Please make sure the server is running.", 'bot');
    }
}
