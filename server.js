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

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 1. Load the merged Cutoff & Rank Dataset synchronously
let tneaData = [];
try {
  tneaData = JSON.parse(fs.readFileSync(path.join(__dirname, 'tnea_data.json'), 'utf8'));
  console.log(`Loaded ${tneaData.length} college branches from local database.`);
} catch (err) {
  console.error("Could not load tnea_data.json. Make sure the file is in the folder.", err);
}

// 2. Official TNEA System Prompt (Math rejection removed, handled by backend now)
const TNEA_SYSTEM_PROMPT = `
You are the official Tamil Nadu Engineering Admissions (TNEA) 2026 Counseling Assistant & College Predictor.

--- 1. CONVERSATION & PREDICTION RULES ---
- NORMAL CONVERSATION: If the user is asking a general question (e.g., rules, fees) or saying hello, answer naturally. DO NOT ask for their cutoff, rank, or category.
- REGIONS & BRANCHES DEFAULT: If the user asks for college recommendations but does not specify a region or branch, ASSUME THEY WANT ALL REGIONS AND ALL BRANCHES. NEVER ask them to specify a region or branch. 
- CORE REQUIREMENTS: If the user specifically asks you to predict colleges, you need their Cutoff/Rank AND Category. If either is missing, politely ask for the specific missing detail.

--- 2. STRICT OUT-OF-SCOPE GUARDRAIL ---
You are strictly limited to discussing TNEA counseling, Tamil Nadu engineering colleges, and cutoffs. If a user asks about ANY other topic, politely refuse: "I specialize exclusively in TNEA Counseling. Please ask me a question regarding engineering cutoffs, ranks, or colleges!"

--- 3. ANTI-HALLUCINATION & FORMATTING ---
- NEVER guess or invent college cutoffs. Use ONLY the database results injected at the bottom of this prompt.
- IF AND ONLY IF database results are provided below, output a clean Markdown table with exactly these columns: | College Name | Branch | Closing Rank / Cutoff | Chance of Admission |
- IF NO database results are provided below, do NOT generate a table. Reply conversationally.

--- OFFICIAL TNEA 2026 INFORMATION & RULES ---
1. ALLOCATION OF SEATS & INSTITUTIONS: Govt, Aided, Anna Univ, Central Govt, Self-Financing.
2. MINIMUM ELIGIBILITY (PCM): General(OC): 45% | BC/BCM/MBC/SC/SCA/ST: 40%
3. RESERVATION POLICY: OC: 31%, BC: 26.5%, BCM: 3.5%, MBC: 20%, SC: 15%, SCA: 3%, ST: 1%
4. 7.5% Govt School Quota: Full fee waiver for students 6th-12th in TN State Govt schools.
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
  "mz": ["mechatronics"]
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

    const collegeName = item.college.toLowerCase();
    const branchName = item.branch.toLowerCase();

    if (prefs.cities.length > 0 && !prefs.cities.some(c => collegeName.includes(c))) continue;
    if (prefs.branches.length > 0 && !prefs.branches.some(b => 
        branchKeywords[b].some(kw => branchName.includes(kw)) || branchName.includes(`(${b.toUpperCase()})`)
      )) continue;

    if (previousRank >= (userRank - 5000) && previousRank <= (userRank + 5000)) {
      let chance = userRank > previousRank ? "Ambitious" : (userRank >= previousRank - 1500 ? "Target" : "Safe");
      matched.push({ college: item.college, branch: item.branch, closing_rank: previousRank, chance: chance });
    }
  }
  return matched.sort((a, b) => Math.abs(userRank - a.closing_rank) - Math.abs(userRank - b.closing_rank)).slice(0, 12);
}

function getRecommendationsByCutoff(userScore, category = "OC", prefs) {
  const validCategory = category.toUpperCase();
  let matched = [];
  
  for (const item of tneaData) {
    const requiredCutoff = item.cutoffs && item.cutoffs[validCategory];
    if (!requiredCutoff) continue;

    const collegeName = item.college.toLowerCase();
    const branchName = item.branch.toLowerCase();

    if (prefs.cities.length > 0 && !prefs.cities.some(c => collegeName.includes(c))) continue;
    if (prefs.branches.length > 0 && !prefs.branches.some(b => 
        branchKeywords[b].some(kw => branchName.includes(kw)) || branchName.includes(`(${b.toUpperCase()})`)
      )) continue;

    if (requiredCutoff >= (userScore - 5.0) && requiredCutoff <= (userScore + 5.0)) {
      let chance = userScore < requiredCutoff ? "Ambitious" : (userScore <= requiredCutoff + 1.5 ? "Target" : "Safe");
      matched.push({ college: item.college, branch: item.branch, required_cutoff: requiredCutoff, chance: chance });
    }
  }
  return matched.sort((a, b) => Math.abs(userScore - a.required_cutoff) - Math.abs(userScore - b.required_cutoff)).slice(0, 12);
}

// 5. Chat Route with Perfected Gatekeeper
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    // --- JS HARD VALIDATION: Reject Out-Of-Bounds Cutoffs ---
    const explicitCutoffCheck = message.match(/(?:cutoff|mark|score)\s*(?:is\s*)?(\d{1,3}(?:\.\d+)?)/i);
    if (explicitCutoffCheck) {
        const checkVal = parseFloat(explicitCutoffCheck[1]);
        if (checkVal < 77.5 || checkVal > 200) {
            return res.json({ reply: "⚠️ **Invalid Cutoff Mark.** TNEA engineering cutoffs must be strictly between 77.5 and 200." });
        }
    }

    const userHistoryText = history ? history.filter(h => h.role === 'user').map(h => h.content).join(" ") : "";
    const fullContext = userHistoryText + " " + message;

    let detectedRank = null;
    let detectedScore = null;
    
    const categoryMatch = fullContext.match(/\b(OC|BC|BCM|MBC|SC|SCA|ST)\b/i);
    const detectedCategory = categoryMatch ? categoryMatch[0].toUpperCase() : null;

    const explicitRankMatch = fullContext.match(/(?:rank\s*is\s*|rank\s*|ranked\s*)(\d+)|(\d+)\s*(?:th\s*)?rank/i);
    if (explicitRankMatch) detectedRank = parseInt(explicitRankMatch[1] || explicitRankMatch[2]);

    const explicitScoreMatch = fullContext.match(/(?:cutoff\s*is\s*|cutoff\s*|mark\s*is\s*|score\s*is\s*)(\d{2,3}(?:\.\d+)?)|(\d{2,3}(?:\.\d+)?)\s*(?:cutoff|mark|score)/i);
    if (explicitScoreMatch) detectedScore = parseFloat(explicitScoreMatch[1] || explicitScoreMatch[2]);

    if (!detectedRank && !detectedScore) {
      const rawNumbers = fullContext.match(/\b\d+(\.\d+)?\b/g);
      if (rawNumbers) {
        for (let numStr of rawNumbers.reverse()) {
          const num = parseFloat(numStr);
          if (num > 200) { detectedRank = parseInt(num); break; }
          else if (num <= 200 && num >= 77.5) { detectedScore = num; break; }
        }
      }
    }

    const prefs = extractPreferences(fullContext);
    let predictionContext = "";
    const disclaimerText = "\n\n--- \n*Disclaimer: These predictions are estimates based on previous year data. Official TNEA counseling seat allotment rules apply.*";

    const hasNumber = (detectedRank !== null || detectedScore !== null);
    const hasCategory = detectedCategory !== null;
    
    const isAskingForColleges = message.toLowerCase().match(/(recommend|suggest|predict|what college|which college|get into|list)/);

    // --- GATEKEEPER LOGIC ---
    if (hasNumber && hasCategory) {
      if (detectedRank) {
        const recommendations = getRecommendationsByRank(detectedRank, detectedCategory, prefs);
        predictionContext = recommendations.length > 0 
          ? `\n\n[DATABASE RESULTS FOR RANK ${detectedRank}, CATEGORY ${detectedCategory}]:\n` + JSON.stringify(recommendations, null, 2) + `\n\nFormat these into the recommended college table. AFTER the table, print this verbatim: ${disclaimerText}`
          : `\n\n[NO EXACT MATCHES FOUND IN DATABASE] State that no exact college matches were found.`;
      } else if (detectedScore) {
        const recommendations = getRecommendationsByCutoff(detectedScore, detectedCategory, prefs);
        predictionContext = recommendations.length > 0 
          ? `\n\n[DATABASE RESULTS FOR CUTOFF ${detectedScore}, CATEGORY ${detectedCategory}]:\n` + JSON.stringify(recommendations, null, 2) + `\n\nFormat these into the recommended college table. AFTER the table, print this verbatim: ${disclaimerText}`
          : `\n\n[NO EXACT MATCHES FOUND IN DATABASE] State that no exact college matches were found.`;
      }
    } else if (isAskingForColleges && (!hasNumber || !hasCategory)) {
      
      // Determine exactly what is missing so the AI asks perfectly
      const missingItems = [];
      if (!hasNumber) missingItems.push("Cutoff Mark (or Rank)");
      if (!hasCategory) missingItems.push("Community Category (e.g., OC, BC, MBC)");
      
      predictionContext = `\n\n[SYSTEM NOTIFICATION]: The user wants college predictions but is missing data.
      CRITICAL INSTRUCTION: You MUST politely ask the user to provide their ${missingItems.join(" AND ")}. DO NOT ask for regions or branches. DO NOT generate any colleges.`;
    } 

    const messages = [
      { role: "system", content: TNEA_SYSTEM_PROMPT + predictionContext },
      ...history,
      { role: "user", content: message }
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: messages,
      temperature: 0.3,
    });

    res.json({ reply: completion.choices[0].message.content });

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: 'Server error processing query.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TNEA GPT Backend running on http://localhost:${PORT}`));
