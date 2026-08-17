require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Groq } = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 1. Load Both Datasets into Memory
let tneaData = [];
let collegeDetails = [];

try {
  tneaData = JSON.parse(fs.readFileSync(path.join(__dirname, 'tnea_data.json'), 'utf8'));
  console.log(`✅ Loaded ${tneaData.length} cutoff records from tnea_data.json`);
  
  collegeDetails = JSON.parse(fs.readFileSync(path.join(__dirname, 'colleges.json'), 'utf8'));
  console.log(`✅ Loaded ${collegeDetails.length} detailed college profiles from colleges.json`);
} catch (err) {
  console.error("❌ Error loading JSON databases. Check your filenames.", err);
}

// 2. Comprehensive TNEA 2026 System Prompt (Polished & Bite-Sized Output)
const TNEA_SYSTEM_PROMPT = `
You are the official Tamil Nadu Engineering Admissions (TNEA) 2026 Counseling Assistant. 

--- 0. GREETING & TONE ---
ALWAYS start your first response in a conversation with a polite, warm greeting (e.g., "Hello!", "Vanakkam! 👋"). Keep your tone highly professional, modern, and friendly.

--- 1. OFFICIAL TNEA 2026 RULEBOOK ---
**A. Minimum Eligibility Marks (PCM Average):**
- General Category (OC): 45.00%
- BC/BCM, MBC & DNC, SC/SCA/ST: 40.00%

**B. Rule of Reservation:**
- OC: 31.00% | BC: 26.50% | BCM: 3.50% | MBC & DNC: 20.00% | SC: 15.00% | SCA: 3.00% | ST: 1.00%

**C. Special Quotas:**
- Eminent Sports Persons: 500 seats. Ex-Servicemen: 150 seats. Differently Abled: 5%.
- **Marine Engineering:** Requires 60% in PCM, 50% in English. Max age 25. Min Height: 157cm, Min Weight: 48kg. IMU CET is mandatory.
- **Mining Engineering:** Female candidates restricted from underground work.

**D. Scholarships & Fee Concessions:**
- **7.5% Govt School Quota:** Full fee waiver (Tuition, Hostel, Development) for 6th-12th TN State Govt School students.
- **First Graduate Concession:** Tuition fee waiver. Requires e-Certificate. Sibling must not have availed it.
- **AICTE TFW:** For parental annual income < Rs. 8.0 Lakhs.

**E. Counselling Process:**
- **Registration Fee:** OC/BC/BCM/MBC/DNC: Rs. 500/- | SC/SCA/ST: Rs. 250/-.
- **Confirmation Options:**
  1. *Accept and Join:* Satisfied, report to college.
  2. *Accept and Upward:* Satisfied, waiting for higher choices. Report to TFC to pay fees.
  3. *Decline and Upward:* Declines current seat, waits for higher choices.
  4. *Decline and move to next round:* Declines seat, moves to next round.
  5. *Decline and Quit:* Quits counseling entirely.

--- 2. GIBBERISH & OFF-TOPIC GUARDRAIL ---
- If the user inputs random letters or unreadable text, politely reply: "I didn't quite catch that. Could you please rephrase your question about TNEA counseling?"
- DO NOT write code, roleplay, or discuss topics outside of TNEA Admissions.

--- 3. COLLEGE INFORMATION (STRICT BITE-SIZED RULE) ---
When the user asks about a specific college, you will receive [COLLEGE DETAILS CONTEXT]. 
- **CRITICAL RULE:** DO NOT dump all the information at once. Format your output beautifully using Markdown (bolding, bullet points, blockquotes, and emojis).
- **If the query is BROAD** (e.g., "Tell me about CEG", "SSN details"):
  1. Provide a sleek, quick overview. Example format:
     > 🏛️ **[College Name]** 
     > 🔢 **TNEA Code:** [Code]
     > 📍 **Status:** [Autonomous / Affiliated] | [District]
  2. **STOP.** Do not list fees, contacts, or transport yet. 
  3. **ASK A FOLLOW-UP:** "What specific details would you like to explore? (e.g., **Hostel Fees**, **Transport Charges**, **Contact Info**, or **Cutoffs**?)"
- **If the query is SPECIFIC** (e.g., "Hostel fee for PSG"):
  1. Answer ONLY that specific question using clean bullet points.
  2. Ask if they need anything else.

--- 4. PREDICTION TABLE FORMATTING ---
When recommending colleges based on cutoff/rank, output a clean Markdown table with exactly these columns:
| Code | College Name | Branch | Closing Rank / Cutoff | Chance |
Classify chances into 🟢 Safe, 🟡 Target, and 🔴 Ambitious.
`;

// 3. Keyword Detection Lists
const cityKeywords = ["chennai", "coimbatore", "madurai", "salem", "trichy", "tiruchirappalli", "erode", "thanjavur", "tirunelveli", "kanyakumari", "vellore", "kancheepuram", "chengalpattu", "namakkal", "dindigul"];

const branchKeywords = {
  "cs": ["computer science", "cse", "cs", "computer"],
  "it": ["information technology", "it"],
  "ad": ["artificial intelligence", "ai", "data science", "machine learning"],
  "ec": ["electronics and communication", "ece", "electronics"],
  "ee": ["electrical and electronics", "eee", "electrical"],
  "me": ["mechanical", "mech"],
  "ce": ["civil"],
  "bm": ["biomedical", "bio medical"],
  "bt": ["biotechnology", "bio technology"],
  "ch": ["chemical"],
  "rm": ["robotics", "automation"],
  "mz": ["mechatronics"],
  "mr": ["marine", "shipping"],
  "mi": ["mining"]
};

function extractPreferences(text) {
  const lower = text.toLowerCase();
  let detectedCities = cityKeywords.filter(city => lower.includes(city));
  let detectedBranches = Object.keys(branchKeywords).filter(key => 
       branchKeywords[key].some(kw => lower.includes(kw))
  );
  return { cities: detectedCities, branches: detectedBranches };
}

// 4. Recommendation Matchers 
function getRecommendationsByRank(userRank, category = "OC", prefs) {
  const validCategory = category.toUpperCase();
  let matched = [];
  
  for (const item of tneaData) {
    const previousRank = item.ranks && item.ranks[validCategory];
    if (!previousRank) continue;

    const collegeName = item.college_name ? item.college_name.toLowerCase() : (item.college || "").toLowerCase();
    const branchName = item.branch_name ? item.branch_name.toLowerCase() : (item.branch || "").toLowerCase();

    if (prefs.cities.length > 0 && !prefs.cities.some(c => collegeName.includes(c))) continue;
    if (prefs.branches.length > 0 && !prefs.branches.some(b => 
        branchKeywords[b].some(kw => branchName.includes(kw)) || branchName.includes(`(${b.toUpperCase()})`)
      )) continue;

    if (previousRank >= (userRank - 5000) && previousRank <= (userRank + 5000)) {
      let chance = userRank > previousRank ? "🔴 Ambitious" : (userRank >= previousRank - 1500 ? "🟡 Target" : "🟢 Safe");
      matched.push({ 
          code: item.college_code, 
          college: item.college_name || item.college, 
          branch: item.branch_name || item.branch, 
          closing_rank: previousRank, 
          chance: chance 
      });
    }
  }
  return matched.sort((a, b) => Math.abs(userRank - a.closing_rank) - Math.abs(userRank - b.closing_rank)).slice(0, 10);
}

function getRecommendationsByCutoff(userScore, category = "OC", prefs) {
  const validCategory = category.toUpperCase();
  let matched = [];
  
  for (const item of tneaData) {
    const requiredCutoff = item.cutoffs && item.cutoffs[validCategory];
    if (!requiredCutoff) continue;

    const collegeName = item.college_name ? item.college_name.toLowerCase() : (item.college || "").toLowerCase();
    const branchName = item.branch_name ? item.branch_name.toLowerCase() : (item.branch || "").toLowerCase();

    if (prefs.cities.length > 0 && !prefs.cities.some(c => collegeName.includes(c))) continue;
    if (prefs.branches.length > 0 && !prefs.branches.some(b => 
        branchKeywords[b].some(kw => branchName.includes(kw)) || branchName.includes(`(${b.toUpperCase()})`)
      )) continue;

    if (requiredCutoff >= (userScore - 5.0) && requiredCutoff <= (userScore + 5.0)) {
      let chance = userScore < requiredCutoff ? "🔴 Ambitious" : (userScore <= requiredCutoff + 1.5 ? "🟡 Target" : "🟢 Safe");
      matched.push({ 
          code: item.college_code, 
          college: item.college_name || item.college, 
          branch: item.branch_name || item.branch, 
          required_cutoff: requiredCutoff, 
          chance: chance 
      });
    }
  }
  return matched.sort((a, b) => Math.abs(userScore - a.required_cutoff) - Math.abs(userScore - b.required_cutoff)).slice(0, 10);
}

// 5. SMARTER College Details Locator
function findCollegeDetails(query) {
  const q = query.toLowerCase();
  const codeMatch = q.match(/\b\d{1,4}\b/);
  const code = codeMatch ? parseInt(codeMatch[0], 10) : null;
  let matches = [];

  const exactAbbreviations = {
    "ceg": 1, "act": 2, "mit": 4, "psg": 2006, "cit": 2007, 
    "ssn": 1315, "svce": 1219, "srm": 1422, "saveetha": 1216,
    "panimalar": 1210, "rajalakshmi": 1211, "kcg": 1311,
    "jeppiaar": 1306, "st. joseph": 1317, "sairam": 1419,
    "easwari": 1304, "rmk": 1113, "rmd": 1112, "velammal": 1120
  };

  for (const [key, val] of Object.entries(exactAbbreviations)) {
    if (q.includes(key)) {
      const found = collegeDetails.find(c => parseInt(c.college_code, 10) === val);
      if (found && !matches.includes(found)) matches.push(found);
    }
  }

  for (const item of collegeDetails) {
    if (matches.length >= 2) break; // Limit to 2 to prevent overwhelming the context
    const itemCode = parseInt(item.college_code, 10);
    if (code === itemCode && !matches.includes(item)) {
        matches.push(item);
        continue;
    }
    const coreName = item.college_name.toLowerCase().split(',')[0].split('(')[0].trim();
    if (coreName.length > 4 && q.includes(coreName) && !matches.includes(item)) {
      matches.push(item);
    }
  }
  return matches.length > 0 ? matches : null;
}

// 6. API Route (Multi-Key Support & Full Constraints)
app.post('/api/chat', async (req, res) => {
  try {
    const rawMessage = req.body.message || "";
    
    if (!rawMessage.trim()) return res.json({ reply: "Please type a question or provide your marks so I can help you!" });
    if (rawMessage.length > 300) return res.json({ reply: "⚠️ **Message too long.** Please keep your questions brief (under 300 characters)." });

    const message = rawMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const history = req.body.history || [];

    const explicitCutoffCheck = message.match(/(?:cutoff|mark|score)\s*(?:is\s*)?(\d{1,3}(?:\.\d+)?)/i);
    if (explicitCutoffCheck) {
        const checkVal = parseFloat(explicitCutoffCheck[1]);
        if (checkVal < 77.5 || checkVal > 200) {
            return res.json({ reply: "⚠️ **Invalid Cutoff.** TNEA engineering cutoffs must be strictly between 77.5 and 200." });
        }
    }

    const explicitRankCheck = message.match(/(?:rank\s*is\s*|rank\s*|ranked\s*)(\d+)|(\d+)\s*(?:th\s*)?rank/i);
    if (explicitRankCheck) {
        const checkRank = parseInt(explicitRankCheck[1] || explicitRankCheck[2]);
        if (checkRank <= 0 || checkRank > 250000) {
            return res.json({ reply: "⚠️ **Invalid Rank.** TNEA General Ranks must be a valid positive number." });
        }
    }

    const userHistoryText = history.filter(h => h.role === 'user').map(h => h.content).join(" ");
    const fullContext = userHistoryText + " " + message;

    let detectedRank = null;
    let detectedScore = null;
    
    const categoryMatch = fullContext.match(/\b(OC|BC|BCM|MBC|SC|SCA|ST)\b/i);
    const detectedCategory = categoryMatch ? categoryMatch[0].toUpperCase() : null;

    if (explicitRankCheck) detectedRank = parseInt(explicitRankCheck[1] || explicitRankCheck[2]);
    if (explicitCutoffCheck) detectedScore = parseFloat(explicitCutoffCheck[1]);

    if (!detectedRank && !detectedScore) {
      const rawNumbers = fullContext.match(/\b\d+(\.\d+)?\b/g);
      if (rawNumbers) {
        for (let numStr of rawNumbers.reverse()) {
          const num = parseFloat(numStr);
          if (num > 200 && num <= 250000) { detectedRank = parseInt(num); break; }
          else if (num <= 200 && num >= 77.5) { detectedScore = num; break; }
        }
      }
    }

    const prefs = extractPreferences(fullContext);
    let predictionContext = "";
    const disclaimerText = "\n\n---\n*Disclaimer: These predictions are estimates based on previous year data. Official TNEA counseling seat allotment rules apply.*";

    // Inject Specific College Facts if requested
    const collegeInfoArray = findCollegeDetails(message);
    if (collegeInfoArray) {
      predictionContext += `\n\n[COLLEGE DETAILS CONTEXT]:\n` + JSON.stringify(collegeInfoArray, null, 2) + `\nAnswer the user's specific query utilizing the codes and facts above. Remember: Be brief, use emojis and blockquotes, and DO NOT dump all information. Ask follow-up questions.`;
    }

    const hasNumber = (detectedRank !== null || detectedScore !== null);
    const hasCategory = detectedCategory !== null;
    const isAskingForColleges = message.toLowerCase().match(/(recommend|suggest|predict|what college|which college|get into|list)/);

    // Predict Colleges based on data
    if (hasNumber && hasCategory) {
      if (detectedRank) {
        const recommendations = getRecommendationsByRank(detectedRank, detectedCategory, prefs);
        predictionContext += recommendations.length > 0 
          ? `\n\n[DATABASE MATCHES FOR RANK ${detectedRank}, CATEGORY ${detectedCategory}]:\n` + JSON.stringify(recommendations, null, 2) + `\n\nFormat these into the recommended college table. AFTER the table, print this verbatim: ${disclaimerText}`
          : `\n\n[NO EXACT MATCHES FOUND IN DATABASE] State that no exact college matches were found.`;
      } else if (detectedScore) {
        const recommendations = getRecommendationsByCutoff(detectedScore, detectedCategory, prefs);
        predictionContext += recommendations.length > 0 
          ? `\n\n[DATABASE MATCHES FOR CUTOFF ${detectedScore}, CATEGORY ${detectedCategory}]:\n` + JSON.stringify(recommendations, null, 2) + `\n\nFormat these into the recommended college table. AFTER the table, print this verbatim: ${disclaimerText}`
          : `\n\n[NO EXACT MATCHES FOUND IN DATABASE] State that no exact college matches were found.`;
      }
    } else if (isAskingForColleges && (!hasNumber || !hasCategory)) {
      const missingItems = [];
      if (!hasNumber) missingItems.push("Cutoff Mark (or Rank)");
      if (!hasCategory) missingItems.push("Community Category (e.g., OC, BC, MBC)");
      
      predictionContext += `\n\n[SYSTEM NOTIFICATION]: The user wants predictions but is missing data.
      CRITICAL INSTRUCTION: You MUST politely ask the user to provide their ${missingItems.join(" AND ")}. DO NOT generate any colleges.`;
    } 

    const messages = [
      { role: "system", content: TNEA_SYSTEM_PROMPT + predictionContext },
      ...history,
      { role: "user", content: message }
    ];

    // Auto-Rotate through provided Groq API Keys
    const GROQ_KEYS = [
      process.env.GROQ_KEY_1,
      process.env.GROQ_KEY_2,
      process.env.GROQ_KEY_3
    ].filter(Boolean);

    let replyContent = null;
    let success = false;

    for (let i = 0; i < GROQ_KEYS.length; i++) {
        try {
            const currentGroq = new Groq({ apiKey: GROQ_KEYS[i] });
            const completion = await currentGroq.chat.completions.create({
                model: "llama-3.1-8b-instant",
                messages: messages,
                temperature: 0.3,
            });
            
            replyContent = completion.choices[0].message.content;
            success = true;
            break;
        } catch (error) {
            console.warn(`⚠️ Groq Key #${i + 1} failed or hit rate limit. Trying next key...`);
            if (i === GROQ_KEYS.length - 1) {
                return res.status(429).json({ reply: "⚠️ All API rate limits are currently exhausted. Please try again in a few minutes." });
            }
        }
    }

    if (success) {
        res.json({ reply: replyContent });
    }

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ reply: "⚠️ **Connection Error.** Please wait a moment and try again." });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🛡️ Master TNEA Backend running on http://localhost:${PORT}`));
