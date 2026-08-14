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

// 1. Load the merged TNEA Data
let tneaData = [];
try {
  tneaData = JSON.parse(fs.readFileSync(path.join(__dirname, 'tnea_data.json'), 'utf8'));
  console.log(`Loaded ${tneaData.length} college branches from database.`);
} catch (err) {
  console.error("Could not load tnea_data.json. Make sure the file is in the folder.", err);
}

const TNEA_SYSTEM_PROMPT = `
You are an expert Tamil Nadu Engineering Admissions (TNEA) Counselor.
Your job is to provide accurate advice about TNEA counseling procedures, cutoffs, ranks, and college recommendations based ONLY on the provided context.

Core Rules for Structuring Your Response:
1. ALWAYS use a clean Markdown Table when recommending colleges.
2. The table must have exactly these columns: | College Name | Branch | Closing Rank / Cutoff | Chance of Admission |.
3. Use bolding (**bold text**) to emphasize important advice.
4. If providing a list of instructions or rules, use bullet points.
5. Be concise. Start with a brief, encouraging greeting, present the table, and end with a quick piece of choice-filling advice.
`;

// 2. Intelligent Keyword Filtering
const cityKeywords = ["chennai", "coimbatore", "madurai", "salem", "trichy", "tiruchirappalli", "erode", "thanjavur", "tirunelveli", "kanyakumari", "vellore", "kancheepuram", "chengalpattu"];

const branchKeywords = {
    "cs": ["computer science", "cse", "cs", "computer"],
    "it": ["information technology", "it"],
    "ad": ["artificial intelligence", "ai", "data science", "machine learning"],
    "ec": ["electronics and communication", "ece", "electronics"],
    "ee": ["electrical and electronics", "eee", "electrical"],
    "me": ["mechanical", "mech"],
    "ce": ["civil"],
    "bm": ["biomedical", "bio medical"]
};

// Helper function to extract city and branch preferences from user message
function extractPreferences(message) {
    const lowerMessage = message.toLowerCase();
    
    let detectedCity = null;
    for (let city of cityKeywords) {
        if (lowerMessage.includes(city)) {
            detectedCity = city;
            break;
        }
    }

    let detectedBranchFilters = [];
    for (let [key, keywords] of Object.entries(branchKeywords)) {
        if (keywords.some(kw => lowerMessage.includes(kw))) {
            detectedBranchFilters.push(key);
        }
    }

    return { city: detectedCity, branches: detectedBranchFilters };
}

// -------------------------------------------------------------
// MATCHING FUNCTIONS (+/- Ranges)
// -------------------------------------------------------------

// Helper 1: Match by Rank (+/- 5000 Range)
function getRecommendationsByRank(userRank, category = "OC", prefs) {
  const validCategory = category.toUpperCase();
  let matched = [];
  
  for (const item of tneaData) {
    const previousRank = item.ranks[validCategory];
    const collegeName = item.college.toLowerCase();
    const branchName = item.branch.toLowerCase();

    // Filter by City 
    if (prefs.city && !collegeName.includes(prefs.city)) continue;

    // Filter by Branch
    if (prefs.branches.length > 0) {
        const matchesBranch = prefs.branches.some(b => 
            branchKeywords[b].some(kw => branchName.includes(kw)) || branchName.includes(`(${b.toUpperCase()})`)
        );
        if (!matchesBranch) continue;
    }

    // Match Logic (Within a +/- 5000 rank window)
    if (previousRank !== null && previousRank >= (userRank - 5000) && previousRank <= (userRank + 5000)) {
        let chance = "Safe";
        if (userRank > previousRank) {
             chance = "Ambitious"; // User rank is worse than previous closing rank
        } else if (userRank <= previousRank && userRank >= previousRank - 1500) {
             chance = "Target";
        } else {
             chance = "Safe";
        }
        
        matched.push({ 
          college: item.college, branch: item.branch, closing_rank: previousRank, chance: chance 
        });
    }
  }
  
  // Sort by the absolute closest match to the user's rank, return top 12 options
  return matched.sort((a, b) => Math.abs(userRank - a.closing_rank) - Math.abs(userRank - b.closing_rank)).slice(0, 12);
}

// Helper 2: Match by Cutoff (+/- 5 Range)
function getRecommendationsByCutoff(userScore, category = "OC", prefs) {
  const validCategory = category.toUpperCase();
  let matched = [];
  
  for (const item of tneaData) {
    const requiredCutoff = item.cutoffs[validCategory];
    const collegeName = item.college.toLowerCase();
    const branchName = item.branch.toLowerCase();

    // Filter by City 
    if (prefs.city && !collegeName.includes(prefs.city)) continue;

    // Filter by Branch
    if (prefs.branches.length > 0) {
        const matchesBranch = prefs.branches.some(b => 
            branchKeywords[b].some(kw => branchName.includes(kw)) || branchName.includes(`(${b.toUpperCase()})`)
        );
        if (!matchesBranch) continue;
    }

    // Match Logic (Cutoff strictly between userScore - 5 and userScore + 5)
    if (requiredCutoff !== null && requiredCutoff >= (userScore - 5.0) && requiredCutoff <= (userScore + 5.0)) {
        let chance = "Safe";
        if (userScore < requiredCutoff) {
            chance = "Ambitious"; // User scored slightly below the required cutoff
        } else if (userScore >= requiredCutoff && userScore <= requiredCutoff + 1.5) {
            chance = "Target"; // User scored exactly at or slightly above the cutoff
        } else {
            chance = "Safe"; // User scored well above the cutoff
        }
        
        matched.push({ 
          college: item.college, branch: item.branch, required_cutoff: requiredCutoff, chance: chance 
        });
    }
  }
  
  // Sort by the absolute closest match to the user's score, return top 12 options
  return matched.sort((a, b) => Math.abs(userScore - a.required_cutoff) - Math.abs(userScore - b.required_cutoff)).slice(0, 12);
}

// -------------------------------------------------------------
// CHAT API ROUTE
// -------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    const rankMatch = message.match(/rank\s*is\s*(\d+)|rank\s*(\d+)|(\d+)\s*rank/i);
    const scoreMatch = message.match(/\b(1\d{2}(\.\d{1,2})?|200(\.0{1,2})?)\b/);
    const categoryMatch = message.match(/\b(OC|BC|BCM|MBC|SC|SCA|ST)\b/i);
    
    const prefs = extractPreferences(message);

    let predictionContext = "";
    const detectedCategory = categoryMatch ? categoryMatch[0].toUpperCase() : "OC";

    if (rankMatch) {
      const detectedRank = parseInt(rankMatch[1] || rankMatch[2] || rankMatch[3]);
      const recommendations = getRecommendationsByRank(detectedRank, detectedCategory, prefs);
      
      if (recommendations.length > 0) {
        predictionContext = `\n\n[DATABASE RESULTS FOR RANK ${detectedRank}, CATEGORY ${detectedCategory}]:\n` +
          JSON.stringify(recommendations, null, 2) +
          `\n\nUse these exact options to build your response table. The list includes colleges within a +/- 5000 rank range.`;
      } else {
        predictionContext = `\n\n[NO EXACT MATCHES FOUND IN DATABASE] Tell the user you couldn't find colleges matching their specific filters (City/Branch/Rank).`;
      }
    } else if (scoreMatch) {
      const detectedScore = parseFloat(scoreMatch[0]);
      const recommendations = getRecommendationsByCutoff(detectedScore, detectedCategory, prefs);
      
      if (recommendations.length > 0) {
        predictionContext = `\n\n[DATABASE RESULTS FOR CUTOFF ${detectedScore}, CATEGORY ${detectedCategory}]:\n` +
          JSON.stringify(recommendations, null, 2) +
          `\n\nUse these exact options to build your response table. The list includes colleges within a +/- 5 mark range. Politely remind the user that General Rank is much more accurate for TNEA than Cutoff marks, and ask them for their rank if they know it.`;
      } else {
         predictionContext = `\n\n[NO EXACT MATCHES FOUND IN DATABASE] Tell the user you couldn't find colleges matching their specific filters (City/Branch/Cutoff).`;
      }
    }

    const messages = [
      { role: "system", content: TNEA_SYSTEM_PROMPT + predictionContext },
      ...history,
      { role: "user", content: message }
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
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
app.listen(PORT, () => console.log(`TNEA Predictor running on http://localhost:${PORT}`));