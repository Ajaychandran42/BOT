import streamlit as st
import pandas as pd

# 1. Page Configuration
st.set_page_config(page_title="TNEA Chatbot", page_icon="🎓", layout="centered")

# 2. Load the Dataset
@st.cache_data
def load_data():
    return pd.read_excel("TNEA FINAL DB.xlsx")

df = load_data()

st.title("🤖 TNEA Predictor Chatbot")

# 3. Initialize Chat History in Session State
if "messages" not in st.session_state:
    st.session_state.messages = [
        {"role": "assistant", "content": "👋 Hello! I am your TNEA Counseling Chatbot. Type **'Hi'** or **'Start'** below to begin."}
    ]
    st.session_state.show_form = False

# 4. Display all previous chat messages
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        # If the bot's message includes a table, display it
        if "table" in msg:
            st.dataframe(msg["table"], hide_index=True, use_container_width=True)

# 5. User Text Input (The real chat box at the bottom of the screen)
if prompt := st.chat_input("Type a message here (e.g., 'Hi')..."):
    
    # Show user's text on screen and save to history
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)
    
    # Bot's text response
    bot_reply = "Welcome! Let's find the best engineering colleges for you. Please select your preferences from the dropdown menus below:"
    st.session_state.messages.append({"role": "assistant", "content": bot_reply})
    with st.chat_message("assistant"):
        st.markdown(bot_reply)
    
    # Tell the app to show the dropdown menus next
    st.session_state.show_form = True
    st.rerun()

# 6. Display Dropdown Menus Inside the Chat
if st.session_state.show_form:
    with st.chat_message("assistant"):
        # Create a form card inside the chat bubble
        with st.form("tnea_form"):
            st.markdown("### 📋 **Enter your TNEA Details**")
            
            # Put dropdowns side-by-side using columns for a better look
            col1, col2 = st.columns(2)
            with col1:
                cutoff = st.number_input("Your Cutoff Mark:", min_value=70.0, max_value=200.0, value=185.0, step=0.5)
                category = st.selectbox("Community Category:", sorted(df['Category'].unique()))
            with col2:
                district = st.selectbox("Preferred District:", sorted(df['District'].unique()))
                branch = st.selectbox("Preferred Department:", sorted(df['Branch'].unique()))
            
            # Form submit button
            submitted = st.form_submit_button("Search Colleges 🔍", type="primary")
            
            if submitted:
                # Hide the form box once submitted
                st.session_state.show_form = False 
                
                # Add what the user selected into the chat as a text message
                user_summary = f"I am looking for **{branch}** in **{district}**. My cutoff is **{cutoff}** and I belong to the **{category}** community."
                st.session_state.messages.append({"role": "user", "content": user_summary})
                
                # Run the Data Logic (exact match + ±7 cutoff range)
                results = df[
                    (df['Category'] == category) &
                    (df['Branch'] == branch) &
                    (df['District'] == district) &
                    (df['Cutoff_Mark'] >= cutoff - 7.0) &
                    (df['Cutoff_Mark'] <= cutoff + 7.0)
                ].sort_values(by='Cutoff_Mark', ascending=False)
                
                # Generate Bot's final answer
                if len(results) > 0:
                    resp = f"🎉 I found **{len(results)}** colleges matching your criteria within the cutoff range of **{cutoff-7} to {cutoff+7}**! Here is your list:"
                    # Clean up the table columns for display
                    table = results[['Code', 'College_Name', 'Cutoff_Mark']]
                    table.columns = ['College Code', 'College Name', 'Cutoff Mark']
                    
                    st.session_state.messages.append({"role": "assistant", "content": resp, "table": table})
                else:
                    resp = f"I couldn't find any exact matches for those criteria within the **{cutoff-7} to {cutoff+7}** range. Type **'Hi'** again in the chat box below to start a new search!"
                    st.session_state.messages.append({"role": "assistant", "content": resp})
                
                # Refresh the screen to update the chat history
                st.rerun()
