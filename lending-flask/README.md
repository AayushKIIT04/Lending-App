# ₹ Lending Manager — Python/Flask Version

Same app as the original, rewritten in **Python (Flask)** + **vanilla HTML/CSS/JS** (no React, no Node.js required).

## Project Structure

```
lending-flask/
├── app.py              ← Flask backend (all API routes)
├── requirements.txt    ← Python dependencies
├── schema.sql          ← MySQL database schema (same as original)
├── .env.example        ← Copy to .env and fill in your DB credentials
├── templates/
│   └── index.html      ← Full frontend (single HTML page)
└── static/
    ├── css/style.css   ← All styles
    └── js/app.js       ← All frontend logic (vanilla JS)
```

## Setup

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 2. Set up MySQL database
```bash
mysql -u root -p < schema.sql
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

### 4. Run the app
```bash
python app.py
```

Open http://localhost:5000 in your browser.

## .env file
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=lending_db
PORT=5000
```

## Features (identical to original)
- Multiple funding slots (tabs)
- Monthly view selector
- Add customers with auto-calculated profit/commission/balance
- Inline double-click editing for funding, payment, date, name
- Active/Closed status toggle
- Delete entries
- Live summary sidebar with recovery progress bar
- Kothi capital display
