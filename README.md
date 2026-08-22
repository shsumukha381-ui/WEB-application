# WEB-application
# 🚀 WealthOne: All Your Investments, One Dashboard

## 🎯 Theme & Problem Statement
Financial literacy in India is growing, but financial confidence is not. 
* **Students** begin SIPs without understanding risk.
* **Professionals** struggle to manage investments spread across multiple platforms.
* **First-time investors** rely on social media hype instead of data-driven decisions.

**The Goal:** Design an innovative, user-centric platform that transforms complex financial and market data into clear, personalized, and actionable insights to empower users to make informed financial decisions with confidence.

---

## 💡 Our Solution
WealthOne is a premium portfolio consolidation dashboard that unifies your entire net worth—every broker, mutual fund, and asset class—into one place[cite: 2].

### ✨ Key Features
* **🔗 Multi-Platform Linking:** Consolidate investments across Zerodha, Groww, Coin, CAS statements, and Account Aggregators[cite: 2, 3].
* **📈 True XIRR Calculation:** See your actual money-weighted annualized returns, not just misleading CAGR[cite: 3].
* **🛡️ Risk Radar:** Automatically detect hidden mutual fund overlaps and concentration risks in your portfolio[cite: 3].
* **🎯 Goal-Based Planning:** Map your holdings to life goals (e.g., Retirement, Home) and calculate the exact monthly SIP needed to reach them[cite: 3].
* **🧠 AI Financial Assistant:** Chat with a Grok-powered AI to ask about investments, taxes, and budgeting strategies[cite: 3].
* **📚 Built-In Education:** Contextual tooltips explain complex jargon like "Rebalancing" and "Diversification" simply[cite: 3].

---

## 🛠️ Tech Stack
* **Frontend:** HTML, CSS (Custom Glassmorphism Design), Vanilla JavaScript[cite: 2, 3, 6]
* **Backend:** Python, FastAPI[cite: 4]
* **Database/ORM:** SQLAlchemy[cite: 5]
* **Data Processing:** SciPy (for precise XIRR calculations)[cite: 5]
* **Authentication:** Google Identity Services[cite: 2]

---

## 🚀 How to Run Locally

### 1. Backend Setup
Make sure you have Python installed, then run:
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
