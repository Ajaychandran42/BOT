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
  const needleGroup = document.getElementById("needleGroup");
  const gaugeStatusText = document.getElementById("gaugeStatusText");

  let history = [];

  // --- 1. UNIVERSAL SIDEBAR TOGGLE (Mini-Sidebar on PC, Slide-out on Mobile) ---
  const menuToggleBtn = document.getElementById("menuToggleBtn");
  const closeSidebarBtn = document.getElementById("closeSidebarBtn");

  function toggleSidebar() {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle("mobile-open");
    } else {
      sidebar.classList.toggle("collapsed");
    }
  }

  function closeSidebar() {
    if (window.innerWidth <= 768) {
      sidebar.classList.remove("mobile-open");
    } else {
      sidebar.classList.add("collapsed");
    }
  }

  menuToggleBtn.addEventListener("click", toggleSidebar);
  closeSidebarBtn.addEventListener("click", closeSidebar);

  // --- 2. HEADER QUICK ACTIONS (Visible on Mobile) ---
  const headerCalcBtn = document.getElementById("headerCalcBtn");
  headerCalcBtn.addEventListener("click", () => switchView("calc"));

  // --- 3. SMOOTH PAGE VIEW SWITCHING ---
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

  // --- 4. FLOATING POPOVER SETTINGS MENU (Gemini Style) ---
  const settingsPopover = document.getElementById("settingsPopover");
  const themeFlyout = document.getElementById("themeFlyout");
  const navSettingsBtn = document.getElementById("navSettingsBtn");
  const headerSettingsBtn = document.getElementById("headerSettingsBtn");
  const themeMenuTrigger = document.getElementById("themeMenuTrigger");

  function openSettingsMenu(event) {
    const btnRect = event.currentTarget.getBoundingClientRect();
    settingsPopover.classList.add('active');
    themeFlyout.classList.remove('active'); // reset flyout

    if (window.innerWidth <= 768) {
      // Mobile: Open from Header (Top Right)
      settingsPopover.style.top = (btnRect.bottom + 10) + 'px';
      settingsPopover.style.right = '16px';
      settingsPopover.style.left = 'auto';
      settingsPopover.style.bottom = 'auto';
    } else {
      // Desktop: Open from Sidebar (Bottom Left)
      settingsPopover.style.bottom = (window.innerHeight - btnRect.top - 10) + 'px';
      settingsPopover.style.left = (btnRect.right + 10) + 'px';
      settingsPopover.style.top = 'auto';
      settingsPopover.style.right = 'auto';
    }
  }

  navSettingsBtn.addEventListener("click", openSettingsMenu);
  headerSettingsBtn.addEventListener("click", openSettingsMenu);

  // Toggle Theme Flyout
  themeMenuTrigger.addEventListener("click", (e) => {
    e.stopPropagation(); // prevent document click from closing
    themeFlyout.classList.toggle("active");
  });

  // Close menus when clicking outside
  document.addEventListener("click", (e) => {
    const isClickInside = settingsPopover.contains(e.target) || 
                          e.target.closest('#navSettingsBtn') || 
                          e.target.closest('#headerSettingsBtn');
    
    if (!isClickInside && settingsPopover.classList.contains("active")) {
      settingsPopover.classList.remove("active");
      themeFlyout.classList.remove("active");
    }
  });

  // --- 5. THEME SYSTEM APPLICATION ---
  const savedTheme = localStorage.getItem("tnea_theme_choice") || "system";
  applyTheme(savedTheme);

  function applyTheme(theme) {
    let isDark = false;
    
    // Evaluate System Preference
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

    // Update Popover Checkmarks
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

  // Listen for clicks on Theme Flyout Buttons
  document.querySelectorAll('.theme-select').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedTheme = e.currentTarget.getAttribute('data-theme');
      applyTheme(selectedTheme);
      themeFlyout.classList.remove("active"); // close flyout after selection
    });
  });

  // Automatically update if 'System' theme is active and OS changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (localStorage.getItem("tnea_theme_choice") === "system") {
      applyTheme("system");
    }
  });

  // --- 6. CUTOFF CALCULATOR REALTIME ENGINE ---
  const calcMath = document.getElementById("calcMath");
  const calcPhy = document.getElementById("calcPhy");
  const calcChem = document.getElementById("calcChem");
  const fullCalcDisplay = document.getElementById("fullCalcDisplay");
  const calcProgressBar = document.getElementById("calcProgressBar");
  const mathContrib = document.getElementById("mathContrib");
  const phyContrib = document.getElementById("phyContrib");
  const chemContrib = document.getElementById("chemContrib");
  const useCutoffInChatBtn = document.getElementById("useCutoffInChatBtn");

  function runCalculator() {
    const m = Math.min(Math.max(parseFloat(calcMath.value) || 0, 0), 100);
    const p = Math.min(Math.max(parseFloat(calcPhy.value) || 0, 0), 100);
    const c = Math.min(Math.max(parseFloat(calcChem.value) || 0, 0), 100);

    const mPart = m; const pPart = p / 2; const cPart = c / 2;
    const totalCutoff = (mPart + pPart + cPart).toFixed(2);

    mathContrib.textContent = mPart.toFixed(2);
    phyContrib.textContent = pPart.toFixed(2);
    chemContrib.textContent = cPart.toFixed(2);
    fullCalcDisplay.textContent = totalCutoff;

    const percentage = (totalCutoff / 200) * 100;
    calcProgressBar.style.width = `${percentage}%`;
    return totalCutoff;
  }

  [calcMath, calcPhy, calcChem].forEach(input => {
    input.addEventListener("input", runCalculator);
  });

  useCutoffInChatBtn.addEventListener("click", () => {
    const finalScore = runCalculator();
    if (finalScore > 0) {
      switchView("chat");
      inputField.value = `My cutoff is ${finalScore}. Recommend eligible colleges.`;
      handleSend();
    }
  });

  // --- 7. NEW CHAT RESET ---
  document.getElementById("newChatBtn").addEventListener("click", () => {
    history = [];
    messagesContainer.innerHTML = `
      <div class="msg-row bot">
          <div class="avatar bot"><i data-lucide="bot"></i></div>
          <div class="bubble-container">
              <div class="bubble">
                  Vanakkam! 👋 I am your <strong>TNEA 2026 Counseling Assistant</strong>.<br><br>
                  Share your <strong>Cutoff Marks</strong> (e.g., <em>188.5</em>) or <strong>General Rank</strong> alongside your <strong>Category</strong> (OC, BC, BCM, MBC, SC, SCA, ST) to predict safe, target, and ambitious college options.
              </div>
          </div>
      </div>
    `;
    messagesContainer.appendChild(typingIndicator);
    lucide.createIcons();
    switchView("chat");
    if (window.innerWidth <= 768) closeSidebar();
  });

  // --- 8. CHAT & GAUGE LOGIC ---
  function updateGauge(category) {
    let angle = 0; let text = "Target"; let color = "var(--moderate)";
    if (category === "safe") { angle = -55; text = "Safe"; color = "var(--safe)"; } 
    else if (category === "ambitious") { angle = 55; text = "Ambitious"; color = "var(--ambitious)"; }
    needleGroup.setAttribute("transform", `translate(60,62) rotate(${angle})`);
    gaugeStatusText.textContent = text;
    gaugeStatusText.style.color = color;
  }

  function scrollToBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }

  function appendMessage(text, sender) {
    const rowDiv = document.createElement("div");
    rowDiv.className = `msg-row ${sender}`;

    const avatarDiv = document.createElement("div");
    avatarDiv.className = `avatar ${sender}`;
    avatarDiv.innerHTML = sender === "bot" ? `<i data-lucide="bot"></i>` : "U";

    const bubbleContainer = document.createElement("div");
    bubbleContainer.className = "bubble-container";
    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "bubble";

    if (sender === "bot") {
      bubbleDiv.innerHTML = marked.parse(text);
      const lower = text.toLowerCase();
      if (lower.includes("ambitious")) updateGauge("ambitious");
      else if (lower.includes("safe")) updateGauge("safe");
      else updateGauge("moderate");
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

  window.sendQuickPrompt = function(promptText) {
    inputField.value = promptText;
    handleSend();
  };

  inputField.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
  });

  inputField.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // --- 9. VOICE RECOGNITION (Web Speech API) ---
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
      inputField.placeholder = "Listening to your marks & category...";
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      inputField.value += (inputField.value ? ' ' : '') + transcript;
      inputField.style.height = "auto";
      inputField.style.height = inputField.scrollHeight + "px";
    };

    recognition.onerror = () => {
      micBtn.classList.remove("listening");
      inputField.placeholder = "Type your marks, rank, category, or questions…";
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove("listening");
      inputField.placeholder = "Type your marks, rank, category, or questions…";
    };
  } else {
    micBtn.style.display = "none";
  }

  // --- 10. SEND REQUEST TO SERVER ---
  window.handleSend = async function() {
    const text = inputField.value.trim();
    if (!text) return;

    inputField.value = "";
    inputField.style.height = "auto";

    appendMessage(text, "user");
    history.push({ role: "user", content: text });

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
        appendMessage(data.reply, "bot");
        history.push({ role: "assistant", content: data.reply });
      } else {
        appendMessage("Unable to retrieve counseling data. Please try again.", "bot");
      }
    } catch (err) {
      typingIndicator.style.display = "none";
      sendBtn.disabled = false;
      appendMessage("Network error. Please make sure the server is active.", "bot");
    }
  };
});
