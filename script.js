document.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const appRoot = document.getElementById("appRoot");
  const sidebar = document.getElementById("sidebar");
  
  // Navigation View Switchers
  const chatView = document.getElementById("chatView");
  const calculatorView = document.getElementById("calculatorView");
  const navChatBtn = document.getElementById("navChatBtn");
  const navCalcPageBtn = document.getElementById("navCalcPageBtn");
  const returnToChatBtn = document.getElementById("returnToChatBtn");

  // Chat Elements
  const inputField = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const messagesContainer = document.getElementById("messagesContainer");
  const typingIndicator = document.getElementById("typingIndicator");

  // --- 0. MARKED.JS OVERRIDE FOR NEW TABS ---
  const renderer = new marked.Renderer();
  renderer.link = function({ href, title, text }) {
    return `<a target="_blank" rel="noopener noreferrer" href="${href}" title="${title || ''}">${text}</a>`;
  };

  // --- 1. HISTORY PERSISTENCE USING LOCAL STORAGE ---
  let history = JSON.parse(localStorage.getItem("tnea_chat_history")) || [];

  const defaultWelcomeMessage = `Vanakkam! 👋 I am your <strong>TNEA 2026 Counseling Assistant</strong>.<br><br>
  Share your <strong>Cutoff Marks</strong> (e.g., <em>188.5</em>) alongside your <strong>Category</strong> (OC, BC, BCM, MBC, SC, SCA, ST) to predict safe, target, and ambitious college options. You can also ask me about specific college codes or hostel fees!`;

  function renderHistory() {
    document.querySelectorAll('.msg-row').forEach(el => el.remove());

    if (history.length === 0) {
      appendMessageUI(defaultWelcomeMessage, "bot");
    } else {
      history.forEach(msg => {
        appendMessageUI(msg.content, msg.role === 'assistant' ? 'bot' : 'user');
      });
    }
  }

  // --- 2. UNIVERSAL SIDEBAR TOGGLE ---
  const menuToggleBtn = document.getElementById("menuToggleBtn");
  const closeSidebarBtn = document.getElementById("closeSidebarBtn");

  function toggleSidebar() {
    if (window.innerWidth <= 768) sidebar.classList.toggle("mobile-open");
    else sidebar.classList.toggle("collapsed");
  }

  function closeSidebar() {
    if (window.innerWidth <= 768) sidebar.classList.remove("mobile-open");
    else sidebar.classList.add("collapsed");
  }

  menuToggleBtn.addEventListener("click", toggleSidebar);
  closeSidebarBtn.addEventListener("click", closeSidebar);

  // --- 3. HEADER QUICK ACTIONS ---
  const headerCalcBtn = document.getElementById("headerCalcBtn");
  headerCalcBtn.addEventListener("click", () => switchView("calc"));

  function switchView(target) {
    if (target === "calc") {
      chatView.classList.remove("active");
      calculatorView.classList.add("active");
      navChatBtn.classList.remove("active");
      navCalcPageBtn.classList.add("active");
    } else {
      calculatorView.classList.remove("active");
      chatView.classList.add("active");
      navCalcPageBtn.classList.remove("active");
      navChatBtn.classList.add("active");
    }
    if (window.innerWidth <= 768) closeSidebar();
  }

  navCalcPageBtn.addEventListener("click", () => switchView("calc"));
  navChatBtn.addEventListener("click", () => switchView("chat"));
  returnToChatBtn.addEventListener("click", () => switchView("chat"));

  // --- 4. 3-DOTS HEADER MENU & SHARE/PDF ---
  const headerMenuBtn = document.getElementById("headerMenuBtn");
  const headerDropdown = document.getElementById("headerDropdown");
  
  headerMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      headerDropdown.classList.toggle("active");
  });
  
  document.addEventListener("click", (e) => {
      if (!headerDropdown.contains(e.target) && e.target !== headerMenuBtn) {
          headerDropdown.classList.remove("active");
      }
  });

  // Share Button Logic
  document.getElementById("shareBtn").addEventListener("click", async () => {
      headerDropdown.classList.remove("active");
      if (navigator.share) {
          try {
              await navigator.share({
                  title: 'TNEA GPT 2026',
                  text: 'Check out this TNEA Counseling Assistant!',
                  url: window.location.href
              });
          } catch (err) { console.log('Share canceled', err); }
      } else {
          navigator.clipboard.writeText(window.location.href);
          alert("Link copied to clipboard!");
      }
  });

  // Download PDF Logic
  document.getElementById("downloadPdfBtn").addEventListener("click", () => {
      headerDropdown.classList.remove("active");
      const element = document.getElementById('messagesContainer');
      
      // Temporarily hide typing indicator and adjust CSS for full capture
      document.getElementById('typingIndicator').style.display = 'none';
      element.classList.add('pdf-export-mode');
      
      const opt = {
          margin:       10,
          filename:     'TNEA_Chat_History.pdf',
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true, windowWidth: element.scrollWidth },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      html2pdf().set(opt).from(element).save().then(() => {
          element.classList.remove('pdf-export-mode'); // Revert styles
      });
  });

  // --- 5. FLOATING POPOVER SETTINGS MENU ---
  const settingsPopover = document.getElementById("settingsPopover");
  const themeFlyout = document.getElementById("themeFlyout");
  const navSettingsBtn = document.getElementById("navSettingsBtn");
  const headerSettingsBtn = document.getElementById("headerSettingsBtn");
  const themeMenuTrigger = document.getElementById("themeMenuTrigger");

  function openSettingsMenu(event) {
    const btnRect = event.currentTarget.getBoundingClientRect();
    settingsPopover.classList.add('active');
    themeFlyout.classList.remove('active');

    if (window.innerWidth <= 768) {
      settingsPopover.style.top = (btnRect.bottom + 10) + 'px';
      settingsPopover.style.right = '16px';
      settingsPopover.style.left = 'auto';
      settingsPopover.style.bottom = 'auto';
    } else {
      settingsPopover.style.bottom = (window.innerHeight - btnRect.top - 10) + 'px';
      settingsPopover.style.left = (btnRect.right + 10) + 'px';
      settingsPopover.style.top = 'auto';
      settingsPopover.style.right = 'auto';
    }
  }

  navSettingsBtn.addEventListener("click", openSettingsMenu);
  headerSettingsBtn.addEventListener("click", openSettingsMenu);

  themeMenuTrigger.addEventListener("click", (e) => {
    e.stopPropagation(); 
    themeFlyout.classList.toggle("active");
  });

  document.addEventListener("click", (e) => {
    const isClickInside = settingsPopover.contains(e.target) || 
                          e.target.closest('#navSettingsBtn') || 
                          e.target.closest('#headerSettingsBtn');
    
    if (!isClickInside && settingsPopover.classList.contains("active")) {
      settingsPopover.classList.remove("active");
      themeFlyout.classList.remove("active");
    }
  });

  // --- 6. THEME SYSTEM APPLICATION ---
  const savedTheme = localStorage.getItem("tnea_theme_choice") || "system";
  applyTheme(savedTheme);

  function applyTheme(theme) {
    let isDark = false;
    if (theme === "system") {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else {
      isDark = (theme === "dark");
    }

    if (!isDark) {
      appRoot.classList.remove("theme-dark");
      appRoot.classList.add("theme-light");
    } else {
      appRoot.classList.remove("theme-light");
      appRoot.classList.add("theme-dark");
    }
    
    localStorage.setItem("tnea_theme_choice", theme);

    document.querySelectorAll('.theme-select').forEach(btn => {
      const btnTheme = btn.getAttribute('data-theme');
      if (btnTheme === theme) {
        btn.innerHTML = `<i data-lucide="check" style="width:18px"></i> ${btnTheme.charAt(0).toUpperCase() + btnTheme.slice(1)}`;
      } else {
        btn.innerHTML = `<i style="width:18px; display:inline-block"></i> ${btnTheme.charAt(0).toUpperCase() + btnTheme.slice(1)}`;
      }
    });
    lucide.createIcons();
  }

  document.querySelectorAll('.theme-select').forEach(btn => {
    btn.addEventListener('click', (e) => {
      applyTheme(e.currentTarget.getAttribute('data-theme'));
      themeFlyout.classList.remove("active");
    });
  });

  // --- 7. CUTOFF CALCULATOR REALTIME ENGINE ---
  const [calcMath, calcPhy, calcChem] = [document.getElementById("calcMath"), document.getElementById("calcPhy"), document.getElementById("calcChem")];
  const fullCalcDisplay = document.getElementById("fullCalcDisplay");
  const calcProgressBar = document.getElementById("calcProgressBar");
  const useCutoffInChatBtn = document.getElementById("useCutoffInChatBtn");

  function runCalculator() {
    const m = Math.min(Math.max(parseFloat(calcMath.value) || 0, 0), 100);
    const p = Math.min(Math.max(parseFloat(calcPhy.value) || 0, 0), 100);
    const c = Math.min(Math.max(parseFloat(calcChem.value) || 0, 0), 100);

    const totalCutoff = (m + (p / 2) + (c / 2)).toFixed(2);
    document.getElementById("mathContrib").textContent = m.toFixed(2);
    document.getElementById("phyContrib").textContent = (p / 2).toFixed(2);
    document.getElementById("chemContrib").textContent = (c / 2).toFixed(2);
    fullCalcDisplay.textContent = totalCutoff;

    calcProgressBar.style.width = `${(totalCutoff / 200) * 100}%`;
    return totalCutoff;
  }

  [calcMath, calcPhy, calcChem].forEach(input => input.addEventListener("input", runCalculator));

  useCutoffInChatBtn.addEventListener("click", () => {
    const finalScore = runCalculator();
    if (finalScore > 0) {
      switchView("chat");
      inputField.value = `My cutoff is ${finalScore}. Recommend eligible colleges.`;
      handleSend();
    }
  });

  // --- 8. CLEAR / NEW CHAT ---
  document.getElementById("newChatBtn").addEventListener("click", () => {
    history = [];
    localStorage.removeItem("tnea_chat_history");
    renderHistory();
    switchView("chat");
    if (window.innerWidth <= 768) closeSidebar();
    settingsPopover.classList.remove('active');
  });

  // --- 9. CHAT LOGIC & UI APPENDING ---
  function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }

  function appendMessageUI(text, sender) {
    const rowDiv = document.createElement("div");
    rowDiv.className = `msg-row ${sender}`;

    const avatarDiv = document.createElement("div");
    avatarDiv.className = `avatar ${sender}`;
    // User gets a unique icon, Bot gets the logo
    avatarDiv.innerHTML = sender === "bot" 
        ? `<img src="logo.jpeg" alt="Bot" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">` 
        : `<i data-lucide="user"></i>`;

    const bubbleContainer = document.createElement("div");
    bubbleContainer.className = "bubble-container";
    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "bubble";

    if (sender === "bot") {
      bubbleDiv.innerHTML = marked.parse(text, { renderer });
    } else {
      bubbleDiv.textContent = text;
    }

    bubbleContainer.appendChild(bubbleDiv);
    rowDiv.appendChild(avatarDiv);
    rowDiv.appendChild(bubbleContainer);

    messagesContainer.insertBefore(rowDiv, typingIndicator);
    lucide.createIcons();
    scrollToBottom();
  }

  inputField.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
  });

  inputField.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  // --- 10. FULLY WORKING VOICE RECOGNITION (AUTO-SEND) ---
  const micBtn = document.getElementById("micBtn");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    let isListening = false;

    micBtn.addEventListener("click", () => {
      if (isListening) recognition.stop();
      else recognition.start();
    });

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add("listening");
      inputField.placeholder = "Listening...";
      inputField.value = ""; // Clear for new voice input
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      inputField.value = transcript;
      inputField.style.height = "auto";
      inputField.style.height = inputField.scrollHeight + "px";
    };

    recognition.onerror = () => {
      micBtn.classList.remove("listening");
      inputField.placeholder = "Type your marks, rank, category, or preferred branch…";
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove("listening");
      inputField.placeholder = "Type your marks, rank, category, or preferred branch…";
      
      // Auto send if there's text
      if(inputField.value.trim().length > 0) {
          handleSend();
      }
    };
  } else {
    micBtn.style.display = "none"; // Hide if browser doesn't support it
  }

  // --- 11. SEND REQUEST TO SERVER ---
  window.handleSend = async function() {
    const text = inputField.value.trim();
    if (!text) return;

    inputField.value = "";
    inputField.style.height = "auto";

    appendMessageUI(text, "user");
    history.push({ role: "user", content: text });
    localStorage.setItem("tnea_chat_history", JSON.stringify(history));

    typingIndicator.style.display = "flex";
    scrollToBottom();
    sendBtn.disabled = true;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history })
      });

      const data = await res.json();
      typingIndicator.style.display = "none";
      sendBtn.disabled = false;

      if (data.reply) {
        appendMessageUI(data.reply, "bot");
        history.push({ role: "assistant", content: data.reply });
        localStorage.setItem("tnea_chat_history", JSON.stringify(history));
      } else {
        appendMessageUI("Unable to retrieve counseling data.", "bot");
      }
    } catch (err) {
      typingIndicator.style.display = "none";
      sendBtn.disabled = false;
      appendMessageUI("Network error. Make sure the backend server is running.", "bot");
    }
  };

  // INITIALIZE UI
  renderHistory();
});
