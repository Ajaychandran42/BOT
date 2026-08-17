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

// 2. Comprehensive TNEA 2026 System Prompt
const TNEA_SYSTEM_PROMPT = `
You are the official Tamil Nadu Engineering Admissions (TNEA) 2026 Counseling Assistant & College Predictor. 

--- 0. GREETING & GOODBYE DIRECTIVE ---
- If the user greets you (e.g., "Hi", "Hello", "Vanakkam", "Hey"), respond warmly, introduce yourself as the TNEA 2026 Assistant, and ask how you can assist them with college codes, cutoffs, or ranks.
- If the user says goodbye or thank you (e.g., "Bye", "Thanks", "See you"), reply with a polite and encouraging farewell wishing them the best for their engineering admissions.

--- 1. OFFICIAL TNEA 2026 RULEBOOK ---
**A. Minimum Eligibility Marks (PCM Average):**
- General Category (OC): 45.00%
- Backward Class (BC/BCM), MBC & DNC, SC/SCA/ST: 40.00%

**B. Rule of Reservation:**
- OC: 31.00% | BC: 26.50% | BCM: 3.50% | MBC & DNC: 20.00% | SC: 15.00% | SCA: 3.00% | ST: 1.00%

**C. Special Quotas & Branch-Specific Rules:**
- Eminent Sports Persons: 500 seats. Ex-Servicemen: 150 seats. Differently Abled: 5% of seats.
- **Marine Engineering Rules:** Requires 60% in PCM, 50% in English (10th/12th). Max age 25. Min Height: 157cm, Min Weight: 48kg. IMU CET is mandatory.

**D. Scholarships & Fee Concessions:**
- **7.5% Govt School Quota:** Full fee waiver (Tuition, Hostel, and Development fees) for 6th-12th TN State Govt School students.
- **First Graduate Concession:** Tuition fee waiver. Sibling must not have availed it. Requires e-Certificate.

--- 2. STRICT COLLEGE CODE & ANTI-HALLUCINATION RULES ---
- REMEMBER: A college code is ALWAYS a strictly unique 4-digit number.
- NEVER GUESS OR INVENT COLLEGE CODES OR DETAILS. 
- If the user asks about a specific college or code, YOU MUST ONLY USE the [COLLEGE DETAILS CONTEXT] provided at the end of the prompt to answer.
- If the [COLLEGE DETAILS CONTEXT] is empty, inform the user: "The 4-digit college code or name provided is invalid or unavailable in the official database." Do not hallucinate.

--- 3. PREDICTION TABLE FORMATTING ---
When recommending colleges based on cutoff/rank, output a clean Markdown table with exactly these columns:
| Code | College Name | Branch | Closing Rank / Cutoff | Chance of Admission |
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
      let chance = userRank > previousRank ? "Ambitious" : (userRank >= previousRank - 1500 ? "Target" : "Safe");
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
      let chance = userScore < requiredCutoff ? "Ambitious" : (userScore <= requiredCutoff + 1.5 ? "Target" : "Safe");
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

// 5. STRICT College Details Locator
function findCollegeDetails(query) {
  const q = query.toLowerCase();
  let matches = [];

  // Match any 1-4 digit number to look up college codes
  const rawCodes = q.match(/\b\d{1,4}\b/g);
  if (rawCodes) {
      for (let c of rawCodes) {
          const codeNum = parseInt(c, 10);
          const exactCollege = collegeDetails.find(col => parseInt(col.college_code, 10) === codeNum);
          if (exactCollege && !matches.some(m => m.college_code === exactCollege.college_code)) {
              matches.push(exactCollege);
          }
      }
  }

  // Exact Abbreviation Match
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
      if (found && !matches.some(m => m.college_code === found.college_code)) matches.push(found);
    }
  }

  // Name Match
  for (const item of collegeDetails) {
    if (matches.length >= 3) break; 
    const coreName = item.college_name.toLowerCase().split(',')[0].split('(')[0].trim();
    if (coreName.length > 4 && q.includes(coreName) && !matches.some(m => m.college_code === item.college_code)) {
      matches.push(item);
    }
  }
  
  return { data: matches.length > 0 ? matches : null };
}

// 6. API Route
app.post('/api/chat', async (req, res) => {
  try {
    const rawMessage = req.body.message || "";
    
    if (!rawMessage.trim()) return res.json({ reply: "Please type a question or provide your marks so I can help you!" });
    if (rawMessage.length > 300) return res.json({ reply: "⚠️ **Message too long.** Please keep your questions brief (under 300 characters)." });

    // 🛑 NEW: Intercept purely numerical inputs to prevent guessing
    if (/^\s*\d+(\.\d+)?\s*$/.test(rawMessage)) {
        return res.json({ 
            reply: `You entered **${rawMessage.trim()}**. \n\nPlease clarify if this represents your **Cutoff Score**, a **Counselling Rank**, or a **4-digit College Code**? \n\n*(For example, reply "Code ${rawMessage.trim()}" or "My cutoff is ${rawMessage.trim()}")*` 
        });
    }

    const message = rawMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const history = req.body.history || [];

    const userHistoryText = history.filter(h => h.role === 'user').map(h => h.content).join(" ");
    const fullContext = userHistoryText + " " + message;

    let detectedRank = null;
    let detectedScore = null;
    
    const categoryMatch = fullContext.match(/\b(OC|BC|BCM|MBC|SC|SCA|ST)\b/i);
    const detectedCategory = categoryMatch ? categoryMatch[0].toUpperCase() : null;

    // 1. Explicit Rank Extraction
    const explicitRankMatch = fullContext.match(/(?:rank\s*is\s*|rank\s*|ranked\s*)(\d+)|(\d+)\s*(?:th\s*)?rank/i);
    if (explicitRankMatch) detectedRank = parseInt(explicitRankMatch[1] || explicitRankMatch[2]);

    // 2. Strict 3-Digit & Explicit Cutoff Logic
    if (!detectedRank) {
        const rawNumbers = fullContext.match(/\b\d{1,6}(?:\.\d+)?\b/g);
        if (rawNumbers) {
            for (let numStr of rawNumbers.reverse()) {
                const num = parseFloat(numStr);
                if (numStr.includes('.') || numStr.length === 3) {
                    detectedScore = num;
                    break;
                } else if (num > 200) {
                    detectedRank = num;
                    break;
                } else if (num >= 77.5 && num <= 200) {
                    detectedScore = num;
                    break;
                }
            }
        }
    }

    // 3. Invalid Cutoff / Rank Rejection
    if (detectedScore !== null && (detectedScore < 77.5 || detectedScore > 200)) {
        return res.json({ reply: "⚠️ **Invalid Cutoff.** Any 3-digit score or cutoff provided must be strictly between **77.5 and 200**. Please enter a valid cutoff score to proceed." });
    }
    if (detectedRank !== null && (detectedRank <= 0 || detectedRank > 250000)) {
        return res.json({ reply: "⚠️ **Invalid Rank.** TNEA General Ranks must be a valid positive number." });
    }

    const prefs = extractPreferences(fullContext);
    let predictionContext = "";
    const disclaimerText = "\n\n--- \n*Disclaimer: These predictions are estimates based on previous year data. Official TNEA counseling seat allotment rules apply.*";

    // 4. Add College Details Context reliably
    const collegeLookup = findCollegeDetails(message);
    if (collegeLookup.data) {
        predictionContext += `\n\n[COLLEGE DETAILS CONTEXT (Source: colleges.json)]:\n` + JSON.stringify(collegeLookup.data, null, 2) + `\nAnswer the user's specific query utilizing ONLY the details above. Do not guess.`;
    }

    const hasNumber = (detectedRank !== null || detectedScore !== null);
    const hasCategory = detectedCategory !== null;
    const isAskingForColleges = message.toLowerCase().match(/(recommend|suggest|predict|what college|which college|get into|list)/);

    // 5. Predict Colleges Logic
    if (hasNumber && isAskingForColleges) {
        const missingItems = [];
        if (!hasCategory) missingItems.push("Community Category (e.g., OC, BC, MBC)");
        if (prefs.branches.length === 0) missingItems.push("Preferred Department/Branch (e.g., CSE, IT, ECE)");

        if (missingItems.length > 0) {
            predictionContext += `\n\n[SYSTEM NOTIFICATION]: The user provided a valid cutoff/rank but is missing: ${missingItems.join(" AND ")}.
            CRITICAL INSTRUCTION: You MUST politely ask the user to provide these missing details before you can recommend colleges. DO NOT generate any recommended colleges table yet.`;
        } else {
            const regionText = prefs.cities.length > 0 ? `in ${prefs.cities.join(", ")}` : "across all regions in Tamil Nadu";

            if (detectedRank) {
              const recommendations = getRecommendationsByRank(detectedRank, detectedCategory, prefs);
              predictionContext += recommendations.length > 0 
                ? `\n\n[DATABASE MATCHES FOR RANK ${detectedRank}, CATEGORY ${detectedCategory} ${regionText.toUpperCase()}]:\n` + JSON.stringify(recommendations, null, 2) + `\n\nFormat these into the recommended college table. Mention in your response that you searched ${regionText}. ALWAYS include the 'code'. AFTER the table, print this verbatim: ${disclaimerText}`
                : `\n\n[NO EXACT MATCHES FOUND IN DATABASE] State that no exact college matches were found for this department ${regionText}.`;
            } else if (detectedScore) {
              const recommendations = getRecommendationsByCutoff(detectedScore, detectedCategory, prefs);
              predictionContext += recommendations.length > 0 
                ? `\n\n[DATABASE MATCHES FOR CUTOFF ${detectedScore}, CATEGORY ${detectedCategory} ${regionText.toUpperCase()}]:\n` + JSON.stringify(recommendations, null, 2) + `\n\nFormat these into the recommended college table. Mention in your response that you searched ${regionText}. ALWAYS include the 'code'. AFTER the table, print this verbatim: ${disclaimerText}`
                : `\n\n[NO EXACT MATCHES FOUND IN DATABASE] State that no exact college matches were found for this department ${regionText}.`;
            }
        }
    } else if (isAskingForColleges && !hasNumber) {
        predictionContext += `\n\n[SYSTEM NOTIFICATION]: The user wants predictions but did not provide a cutoff or rank. Ask them to provide their Cutoff/Rank, Category, and preferred department.`;
    }

    const messages = [
      { role: "system", content: TNEA_SYSTEM_PROMPT + predictionContext },
      ...history,
      { role: "user", content: message }
    ];

    const GROQ_KEYS = [
      process.env.GROQ_API_KEY,
      process.env.GROQ_KEY_2,
      process.env.GROQ_KEY_3
    ].filter(Boolean);

    let replyContent = null;
    let success = false;

    for (let i = 0; i < GROQ_KEYS.length; i++) {
        try {
            const currentGroq = new Groq({ apiKey: GROQ_KEYS[i] });
            const completion = await currentGroq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
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
app.listen(PORT, () => console.log(`🛡️ Versatile TNEA Backend running on http://localhost:${PORT}`));
