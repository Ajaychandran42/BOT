import streamlit as st
import pandas as pd

# 1. Page Configuration (Centered layout looks more like a real chat app)
st.set_page_config(page_title="TNEA Predictor Bot", page_icon="🎓", layout="centered")

# 2. Load the Dataset
@st.cache_data
def load_data():
    return pd.read_excel("TNEA FINAL DB.xlsx")

df = load_data()

st.title("🤖 TNEA College Predictor Chatbot")

# 3. Initialize Chat History and Steps in Session State
if "messages" not in st.session_state:
    st.session_state.messages = [
        {"role": "assistant", "content": "Hello! I am your TNEA Counseling Chatbot. Let's find the best colleges for you step-by-step."}
    ]
    st.session_state.step = "cutoff"
    st.session_state.user_data = {}

# 4. Display Previous Chat Messages
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        # If the message contains a table of results, render it
        if "table" in msg:
            st.dataframe(msg["table"], hide_index=True, use_container_width=True)

# 5. Chatbot Conversational Flow (State Machine)
# STEP A: Ask for Cutoff
if st.session_state.step == "cutoff":
    with st.chat_message("assistant"):
        st.markdown("First, please tell me your **Cutoff Mark** (e.g., 185.5):")
        cutoff_val = st.number_input("Enter Cutoff", min_value=70.0, max_value=200.0, step=0.5, value=185.0, label_visibility="collapsed")
        
        if st.button("Send Cutoff", type="primary"):
            st.session_state.user_data["cutoff"] = cutoff_val
            st.session_state.messages.append({"role": "user", "content": f"My cutoff is **{cutoff_val}**"})
            st.session_state.step = "category"
            st.rerun()

# STEP B: Ask for Community Category
elif st.session_state.step == "category":
    with st.chat_message("assistant"):
        st.markdown("Got it. Now, please select your **Community Category**:")
        cat_val = st.selectbox("Category", sorted(df['Category'].unique()), label_visibility="collapsed")
        
        if st.button("Send Category", type="primary"):
            st.session_state.user_data["category"] = cat_val
            st.session_state.messages.append({"role": "user", "content": f"I belong to **{cat_val}**"})
            st.session_state.step = "district"
            st.rerun()

# STEP C: Ask for District
elif st.session_state.step == "district":
    with st.chat_message("assistant"):
        st.markdown("Great! Which **District** are you looking to study in?")
        dist_val = st.selectbox("District", sorted(df['District'].unique()), label_visibility="collapsed")
        
        if st.button("Send District", type="primary"):
            st.session_state.user_data["district"] = dist_val
            st.session_state.messages.append({"role": "user", "content": f"I prefer colleges in **{dist_val}**"})
            st.session_state.step = "branch"
            st.rerun()

# STEP D: Ask for Branch
elif st.session_state.step == "branch":
    with st.chat_message("assistant"):
        st.markdown("Almost there! Select your preferred **Department / Branch**:")
        branch_val = st.selectbox("Branch", sorted(df['Branch'].unique()), label_visibility="collapsed")
        
        if st.button("Find Colleges", type="primary"):
            st.session_state.user_data["branch"] = branch_val
            st.session_state.messages.append({"role": "user", "content": f"I want to study **{branch_val}**"})
            st.session_state.step = "results"
            st.rerun()

# STEP E: Calculate and Show Results
elif st.session_state.step == "results":
    cutoff = st.session_state.user_data['cutoff']
    cat = st.session_state.user_data['category']
    dist = st.session_state.user_data['district']
    branch = st.session_state.user_data['branch']
    
    # Apply the logic (exact match + ±7 cutoff range)
    results = df[
        (df['Category'] == cat) &
        (df['Branch'] == branch) &
        (df['District'] == dist) &
        (df['Cutoff_Mark'] >= cutoff - 7.0) &
        (df['Cutoff_Mark'] <= cutoff + 7.0)
    ]
    results = results.sort_values(by='Cutoff_Mark', ascending=False)
    
    # Build the final bot response
    if len(results) > 0:
        resp = f"🎉 I found **{len(results)}** colleges in {dist} for {branch} ({cat}) within the cutoff range of **{cutoff-7} to {cutoff+7}**! Here they are:"
        # Keep only the relevant columns to display
        table = results[['Code', 'College_Name', 'Cutoff_Mark']]
        table.columns = ['College Code', 'College Name', 'Cutoff Mark']
        
        st.session_state.messages.append({"role": "assistant", "content": resp, "table": table})
    else:
        resp = f"I couldn't find any exact matches in **{dist}** for **{branch}** ({cat}) within the **{cutoff-7} to {cutoff+7}** range. Try searching again with a different district or branch!"
        st.session_state.messages.append({"role": "assistant", "content": resp})
        
    st.session_state.step = "done"
    st.rerun()

# STEP F: Allow User to Restart
elif st.session_state.step == "done":
    with st.chat_message("assistant"):
        st.markdown("Would you like to search again with different preferences?")
        if st.button("Start Over 🔄"):
            # Reset everything and start from step 1
            st.session_state.messages = [
                {"role": "assistant", "content": "Welcome back! Let's do another search. Please tell me your **Cutoff Mark**:"}
            ]
            st.session_state.step = "cutoff"
            st.session_state.user_data = {}
            st.rerun()