document.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const appRoot = document.getElementById("appRoot");
  const sidebar = document.getElementById("sidebar");
  const mobileOverlay = document.getElementById("mobileOverlay");
  
  const chatView = document.getElementById("chatView");
  const calculatorView = document.getElementById("calculatorView");
  const navChatBtn = document.getElementById("navChatBtn");
  const navCalcPageBtn = document.getElementById("navCalcPageBtn");
  const returnToChatBtn = document.getElementById("returnToChatBtn");

  const inputField = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const messagesContainer = document.getElementById("messagesContainer");
  const typingIndicator = document.getElementById("typingIndicator");

  // --- 0. MARKED.JS OVERRIDES (New Tabs & Responsive Tables) ---
  const renderer = new marked.Renderer();
  renderer.link = function({ href, title, text }) {
    return `<a target="_blank" rel="noopener noreferrer" href="${href}" title="${title || ''}">${text}</a>`;
  };
  renderer.table = function(token) {
    // Render the default table HTML and wrap it in a div for mobile scrolling
    const defaultTable = marked.Renderer.prototype.table.call(this, token);
    return `<div class="table-wrapper">${defaultTable}</div>`;
  };

  // --- 1. HISTORY PERSISTENCE ---
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

  // --- 2. ROBUST SIDEBAR TOGGLE ---
  const menuToggleBtn = document.getElementById("menuToggleBtn");
  const closeSidebarBtn = document.getElementById("closeSidebarBtn");

  function toggleSidebar() {
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle("mobile-open");
        mobileOverlay.classList.toggle("active");
    } else {
        sidebar.classList.toggle("collapsed");
    }
  }

  function closeSidebar() {
    if (window.innerWidth <= 768) {
        sidebar.classList.remove("mobile-open");
        mobileOverlay.classList.remove("active");
    } else {
        sidebar.classList.add("collapsed");
    }
  }

  if (menuToggleBtn) menuToggleBtn.addEventListener("click", toggleSidebar);
  if (closeSidebarBtn) closeSidebarBtn.addEventListener("click", closeSidebar);
  if (mobileOverlay) mobileOverlay.addEventListener("click", closeSidebar);

  // Tablet auto-collapse handler
  window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && window.innerWidth <= 1024) {
          sidebar.classList.add('collapsed');
      }
  });

  // --- 3. NAVIGATION ---
  const headerCalcBtn = document.getElementById("headerCalcBtn");
  if (headerCalcBtn) headerCalcBtn.addEventListener("click", () => switchView("calc"));

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

  if (navCalcPageBtn) navCalcPageBtn.addEventListener("click", () => switchView("calc"));
  if (navChatBtn) navChatBtn.addEventListener("click", () => switchView("chat"));
  if (returnToChatBtn) returnToChatBtn.addEventListener("click", () => switchView("chat"));

  // --- 4. 3-DOTS MENU & EXPORT ---
  const headerMenuBtn = document.getElementById("headerMenuBtn");
  const headerDropdown = document.getElementById("headerDropdown");
  
  if (headerMenuBtn && headerDropdown) {
      headerMenuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          headerDropdown.classList.toggle("active");
      });
      document.addEventListener("click", (e) => {
          if (!headerDropdown.contains(e.target) && e.target !== headerMenuBtn) {
              headerDropdown.classList.remove("active");
          }
      });
  }

  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) {
      shareBtn.addEventListener("click", async () => {
          headerDropdown.classList.remove("active");
          if (navigator.share) {
              try {
                  await navigator.share({
                      title: 'TNEA GPT 2026',
                      text: 'Check out this TNEA Counseling Assistant!',
                      url: window.location.href
                  });
              } catch (err) {}
          } else {
              navigator.clipboard.writeText(window.location.href);
              alert("Link copied to clipboard!");
          }
      });
  }

  const downloadPdfBtn = document.getElementById("downloadPdfBtn");
  if (downloadPdfBtn) {
      downloadPdfBtn.addEventListener("click", () => {
          headerDropdown.classList.remove("active");
          const element = document.getElementById('messagesContainer');
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
              element.classList.remove('pdf-export-mode'); 
          });
      });
  }

  // --- 5. SETTINGS POPOVER ---
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

  if (navSettingsBtn) navSettingsBtn.addEventListener("click", openSettingsMenu);
  if (headerSettingsBtn) headerSettingsBtn.addEventListener("click", openSettingsMenu);

  if (themeMenuTrigger) {
      themeMenuTrigger.addEventListener("click", (e) => {
        e.stopPropagation(); 
        themeFlyout.classList.toggle("active");
      });
  }

  document.addEventListener("click", (e) => {
    if (settingsPopover && settingsPopover.classList.contains("active")) {
        const isClickInside = settingsPopover.contains(e.target) || 
                              (navSettingsBtn && navSettingsBtn.contains(e.target)) || 
                              (headerSettingsBtn && headerSettingsBtn.contains(e.target));
        if (!isClickInside) {
          settingsPopover.classList.remove("active");
          themeFlyout.classList.remove("active");
        }
    }
  });

  // --- 6. THEMES ---
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

  // --- 7. CALCULATOR ---
  const calcMath = document.getElementById("calcMath");
  const calcPhy = document.getElementById("calcPhy");
  const calcChem = document.getElementById("calcChem");
  const fullCalcDisplay = document.getElementById("fullCalcDisplay");
  const calcProgressBar = document.getElementById("calcProgressBar");
  const useCutoffInChatBtn = document.getElementById("useCutoffInChatBtn");

  function runCalculator() {
    if(!calcMath || !calcPhy || !calcChem) return 0;
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

  if(calcMath) calcMath.addEventListener("input", runCalculator);
  if(calcPhy) calcPhy.addEventListener("input", runCalculator);
  if(calcChem) calcChem.addEventListener("input", runCalculator);

  if (useCutoffInChatBtn) {
      useCutoffInChatBtn.addEventListener("click", () => {
        const finalScore = runCalculator();
        if (finalScore > 0) {
          switchView("chat");
          inputField.value = `My cutoff is ${finalScore}. Recommend eligible colleges.`;
          handleSend();
        }
      });
  }

  // --- 8. CHAT LOGIC ---
  const newChatBtn = document.getElementById("newChatBtn");
  if (newChatBtn) {
      newChatBtn.addEventListener("click", () => {
        history = [];
        localStorage.removeItem("tnea_chat_history");
        renderHistory();
        switchView("chat");
        if (window.innerWidth <= 768) closeSidebar();
        settingsPopover.classList.remove('active');
      });
  }

  function scrollToBottom() { 
      const wrapper = document.querySelector('.messages-wrapper');
      if(wrapper) wrapper.scrollTop = wrapper.scrollHeight; 
  }

  function appendMessageUI(text, sender) {
    const rowDiv = document.createElement("div");
    rowDiv.className = `msg-row ${sender}`;

    const avatarDiv = document.createElement("div");
    avatarDiv.className = `avatar ${sender}`;
    avatarDiv.innerHTML = sender === "bot" 
        ? `<img src="logo.jpeg" alt="Bot">` 
        : `<i data-lucide="user"></i>`;

    const bubbleContainer = document.createElement("div");
    bubbleContainer.className = "bubble-container";
    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "bubble";

    if (sender === "bot") {
      let htmlString = marked.parse(text, { renderer });
      bubbleDiv.innerHTML = htmlString;
    } else {
      bubbleDiv.textContent = text;
    }

    bubbleContainer.appendChild(bubbleDiv);
    rowDiv.appendChild(avatarDiv);
    rowDiv.appendChild(bubbleContainer);

    messagesContainer.insertBefore(rowDiv, typingIndicator);
    lucide.createIcons();
    setTimeout(scrollToBottom, 50); // Slight delay for animation render
  }

  if (inputField) {
      inputField.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight <= 140 ? this.scrollHeight : 140) + "px";
      });

      inputField.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
      });
  }

  // --- 9. VOICE INPUT ---
  const micBtn = document.getElementById("micBtn");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition && micBtn) {
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
      inputField.value = ""; 
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      inputField.value = transcript;
      inputField.style.height = "auto";
      inputField.style.height = inputField.scrollHeight + "px";
    };

    recognition.onerror = () => {
      micBtn.classList.remove("listening");
      inputField.placeholder = "Type marks, rank, or preferred branch…";
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove("listening");
      inputField.placeholder = "Type marks, rank, or preferred branch…";
      if(inputField.value.trim().length > 0) handleSend();
    };
  } else if (micBtn) {
    micBtn.style.display = "none";
  }

  // --- 10. SERVER CALL ---
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

  renderHistory();
});
