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

// 1. Load the merged Cutoff & Rank Dataset
let tneaData = [];
try {
  tneaData = JSON.parse(fs.readFileSync(path.join(__dirname, 'tnea_data.json'), 'utf8'));
  console.log(`Loaded ${tneaData.length} college branches from database.`);
} catch (err) {
  console.error("Could not load tnea_data.json. Make sure the file is in the folder.", err);
}

// 2. Official TNEA 2026 Comprehensive Knowledge Base from Brochure
const TNEA_SYSTEM_PROMPT = `
You are the official Tamil Nadu Engineering Admissions (TNEA) 2026 Counseling Assistant & College Predictor.
Answer candidates' questions based on the official TNEA 2026 Information Brochure rules and provided database context.

--- OFFICIAL TNEA 2026 INFORMATION & RULES ---
1. ALLOCATION OF SEATS & INSTITUTIONS:
   - Government, Govt-Aided (Aided & Self-supporting), Anna University (Departments & Constituent Colleges), Annamalai University, Central Govt Institutions (CECRI Karaikudi, CIPET Chennai, IIHT Salem), and surrendered seats in Self-Financing Colleges.
   - Official Portals: https://www.tneaonline.org and https://www.dte.tn.gov.in

2. MINIMUM ELIGIBILITY CRITERIA (HSC Academic / Vocational):
   - General Category (OC): 45.00% minimum average in Maths, Physics, Chemistry (PCM) put together.
   - BC / BCM / MBC & DNC / SC / SCA / ST: 40.00% minimum average in PCM.
   - Marine Engineering: 10+2 with Physics, Chemistry, Maths & English as separate subjects; minimum 60% average in PCM, minimum 50% in English (10th or 12th), IMU CET qualification mandatory, max age 25 years, min height 157 cm, min weight 48 kg.

3. RESERVATION POLICY (Government of Tamil Nadu):
   - Open Competition (OC): 31.00%
   - Backward Class (BC): 26.50%
   - Backward Class Muslim (BCM): 3.50%
   - Most Backward Class & Denotified Communities (MBC & DNC): 20.00%
   - Scheduled Caste (SC): 15.00%
   - Scheduled Caste Arunthathiyars (SCA): 3.00%
   - Scheduled Tribes (ST): 1.00%
   - 7.5% Preferential Reservation: For State Government School students who studied from 6th to 12th in TN State Government schools. Applies across all communal categories. Full fee waiver (tuition, hostel, development) paid by the State Govt.

4. SPECIAL RESERVATIONS:
   - Sons/Daughters of Ex-Servicemen: 150 total seats (8 Univ Depts, 34 Govt/Aided, 108 Self-Financing).
   - Persons with Benchmark Disabilities (PwD): 5% seats reserved across 21 categories.
   - Eminent Sports Persons: 500 total seats (12 Univ Depts, 488 Govt/Aided/Self-Financing).

5. TUITION FEE CONCESSIONS & SCHOLARSHIPS:
   - First Graduate (FG): Concession in tuition fee for the first person in a family to graduate. Requires e-Certificate from Head Quarters Deputy Tahsildar. If a brother or sister has already availed FG concession, the applicant is NOT eligible.
   - AICTE Tuition Fee Waiver (TFW): Available up to 5% intake in Self-Financing and Self-Supporting courses. Family annual income must be less than Rs. 8.0 Lakhs.
   - Post Matric Scholarship: For SC/SCA/ST and SC Converted Christians whose parental annual income is less than Rs. 2,50,000/-.

6. MERIT LIST & TIE-BREAKING RULES (Out of 200 marks: Maths 100, Physics 50, Chemistry 50):
   In case of a tie in marks, rank priority is decided strictly in this order:
   1. Percentage of marks in Mathematics
   2. Percentage of marks in Physics
   3. Percentage of marks in Optional Subject
   4. Percentage of total marks in 12th standard examination
   5. Date of Birth (Elder candidate given preference)
   6. Random number assigned (Higher value given preference)

7. COUNSELING STAGES & CONFIRMATION OPTIONS:
   - Registration Fee: Rs. 500 (OC/BC/BCM/MBC) | Rs. 250 (SC/SCA/ST).
   - Rounds: Choice Filling (3 days) -> Tentative Allotment -> Confirmation (2 days) -> Reporting to College/TFC.
   - Confirmation Options:
     1. Accept and Join: Download allotment order and report to college within 5 days.
     2. Accept and Upward: Hold allotted seat, report to nearest TFC, pay fee/submit certificates, and wait for a higher-priority choice in upward movement.
     3. Decline and Upward: Decline current seat, wait for higher choices in upward movement. If none available, moved to next round.
     4. Decline and move to next round: Decline seat and participate in next counseling round.
     5. Decline and Quit: Leave counseling completely.
     6. Upward or move to next round: Shown if 'no seat' was allotted based on choices.

--- INSTRUCTIONS FOR RESPONSE FORMATTING ---
1. IF the user asks for college prediction/recommendations AND database context is provided below:
   - Output a clean Markdown table: | College Name | Branch | Closing Rank / Cutoff | Chance of Admission |
   - Follow with concise choice-filling strategy.
2. IF the user asks general counseling questions, eligibility, quota, scholarship, or greeting:
   - DO NOT generate a table. Reply with clear, structured bullet points and bold text.
   - Quote the exact rules from the 2026 brochure.
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

function extractPreferences(message) {
  const lower = message.toLowerCase();
  
  let detectedCities = [];
  for (let city of cityKeywords) {
    if (lower.includes(city)) detectedCities.push(city);
  }

  let detectedBranches = [];
  for (let [key, keywords] of Object.entries(branchKeywords)) {
    if (keywords.some(kw => lower.includes(kw))) detectedBranches.push(key);
  }

  return { cities: detectedCities, branches: detectedBranches };
}

// 4. Recommendation Matchers (+/- 5 Cutoff, +/- 5000 Rank)
function getRecommendationsByRank(userRank, category = "OC", prefs) {
  const validCategory = category.toUpperCase();
  let matched = [];
  
  for (const item of tneaData) {
    const previousRank = item.ranks[validCategory];
    const collegeName = item.college.toLowerCase();
    const branchName = item.branch.toLowerCase();

    if (prefs.cities.length > 0 && !prefs.cities.some(c => collegeName.includes(c))) continue;

    if (prefs.branches.length > 0) {
      const matchesBranch = prefs.branches.some(b => 
        branchKeywords[b].some(kw => branchName.includes(kw)) || branchName.includes(`(${b.toUpperCase()})`)
      );
      if (!matchesBranch) continue;
    }

    if (previousRank !== null && previousRank >= (userRank - 5000) && previousRank <= (userRank + 5000)) {
      let chance = "Safe";
      if (userRank > previousRank) chance = "Ambitious";
      else if (userRank >= previousRank - 1500) chance = "Target";
      else chance = "Safe";
      
      matched.push({ college: item.college, branch: item.branch, closing_rank: previousRank, chance: chance });
    }
  }
  
  return matched.sort((a, b) => Math.abs(userRank - a.closing_rank) - Math.abs(userRank - b.closing_rank)).slice(0, 12);
}

function getRecommendationsByCutoff(userScore, category = "OC", prefs) {
  const validCategory = category.toUpperCase();
  let matched = [];
  
  for (const item of tneaData) {
    const requiredCutoff = item.cutoffs[validCategory];
    const collegeName = item.college.toLowerCase();
    const branchName = item.branch.toLowerCase();

    if (prefs.cities.length > 0 && !prefs.cities.some(c => collegeName.includes(c))) continue;

    if (prefs.branches.length > 0) {
      const matchesBranch = prefs.branches.some(b => 
        branchKeywords[b].some(kw => branchName.includes(kw)) || branchName.includes(`(${b.toUpperCase()})`)
      );
      if (!matchesBranch) continue;
    }

    if (requiredCutoff !== null && requiredCutoff >= (userScore - 5.0) && requiredCutoff <= (userScore + 5.0)) {
      let chance = "Safe";
      if (userScore < requiredCutoff) chance = "Ambitious";
      else if (userScore >= requiredCutoff && userScore <= requiredCutoff + 1.5) chance = "Target";
      else chance = "Safe";
      
      matched.push({ college: item.college, branch: item.branch, required_cutoff: requiredCutoff, chance: chance });
    }
  }
  
  return matched.sort((a, b) => Math.abs(userScore - a.required_cutoff) - Math.abs(userScore - b.required_cutoff)).slice(0, 12);
}

// 5. Chat Route with Intelligent Number Detection & Brochure Context
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    let detectedRank = null;
    let detectedScore = null;
    
    const categoryMatch = message.match(/\b(OC|BC|BCM|MBC|SC|SCA|ST)\b/i);
    const detectedCategory = categoryMatch ? categoryMatch[0].toUpperCase() : null;

    // Explicit Rank Match
    const explicitRankMatch = message.match(/(?:rank\s*is\s*|rank\s*|ranked\s*)(\d+)|(\d+)\s*(?:th\s*)?rank/i);
    if (explicitRankMatch) {
      detectedRank = parseInt(explicitRankMatch[1] || explicitRankMatch[2]);
    }

    // Explicit Cutoff Match
    const explicitCutoffMatch = message.match(/(?:cutoff\s*is\s*|cutoff\s*|mark\s*is\s*|score\s*is\s*)(\d{2,3}(?:\.\d+)?)|(\d{2,3}(?:\.\d+)?)\s*(?:cutoff|mark|score)/i);
    if (explicitCutoffMatch) {
      detectedScore = parseFloat(explicitCutoffMatch[1] || explicitCutoffMatch[2]);
    }

    // Implicit Number Detection
    if (!detectedRank && !detectedScore) {
      const rawNumbers = message.match(/\b\d+(\.\d+)?\b/g);
      if (rawNumbers) {
        for (let numStr of rawNumbers) {
          const num = parseFloat(numStr);
          if (num > 200) detectedRank = parseInt(num);
          else if (num <= 200 && num >= 70) detectedScore = num;
        }
      }
    }

    // Require Category if score/rank is given for prediction
    if ((detectedRank || detectedScore) && !detectedCategory) {
      return res.json({ 
        reply: "To provide accurate college predictions from the database, please specify your **Community Category** (OC, BC, BCM, MBC, SC, SCA, or ST)." 
      });
    }

    const prefs = extractPreferences(message);
    let predictionContext = "";
    
    // Standard Disclaimer text to append to predictions
    const disclaimerText = "\n\n--- \n*Disclaimer: These predictions are estimates based on previous year data (Updated: August 2026). They are not guarantees of admission. Official TNEA counseling seat allotment rules apply.*";

    if (detectedRank && detectedCategory) {
      const recommendations = getRecommendationsByRank(detectedRank, detectedCategory, prefs);
      if (recommendations.length > 0) {
        predictionContext = `\n\n[DATABASE RESULTS FOR RANK ${detectedRank}, CATEGORY ${detectedCategory}]:\n` +
          JSON.stringify(recommendations, null, 2) +
          `\n\nFormat these into the recommended college table. Mention that selections fall within +/- 5000 rank range. AFTER the table, you MUST print this exact disclaimer verbatim: ${disclaimerText}`;
      } else {
        predictionContext = `\n\n[NO EXACT MATCHES FOUND IN DATABASE] State that no exact college branch matches were found for the requested filters within the +/- 5000 rank range.`;
      }
    } else if (detectedScore && detectedCategory) {
      const recommendations = getRecommendationsByCutoff(detectedScore, detectedCategory, prefs);
      if (recommendations.length > 0) {
        predictionContext = `\n\n[DATABASE RESULTS FOR CUTOFF ${detectedScore}, CATEGORY ${detectedCategory}]:\n` +
          JSON.stringify(recommendations, null, 2) +
          `\n\nFormat these into the recommended college table. Mention that selections fall within +/- 5.0 cutoff range. Remind candidate that General Rank is more accurate once rank lists release. AFTER the table, you MUST print this exact disclaimer verbatim: ${disclaimerText}`;
      } else {
        predictionContext = `\n\n[NO EXACT MATCHES FOUND IN DATABASE] State that no college branches matched the requested filters within the +/- 5 mark range.`;
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
app.listen(PORT, () => console.log(`TNEA 2026 Bot running on http://localhost:${PORT}`));
