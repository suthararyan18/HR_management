# OmniStaff - Office & Attendance Management Dashboard

An ultra-premium, interactive office management and attendance web application with employee check-in/out tracking, live status stopwatch, and a comprehensive HR Dashboard featuring monthly reporting matrixes.

---

## 📁 Codebase Directory Structure

```text
testing site/
├── backend/
│   ├── config/
│   │   └── db.js            # Sequelize database credentials connection
│   ├── middleware/
│   │   └── auth.js          # JWT & Role validation middleware
│   ├── models/
│   │   ├── User.js          # User (Employee/HR) database schema definition
│   │   └── Attendance.js    # Shift check-in/out database log schema
│   ├── routes/
│   │   ├── auth.js          # Sign-in / registration endpoints
│   │   ├── attendance.js    # Check-in / check-out / history logs
│   │   └── hr.js            # Admin analytics / monthly grid calculations
│   ├── .env                 # Port & MySQL configuration parameters
│   ├── package.json         # Backend dependencies registry
│   └── server.js            # Express server initialization entry
├── frontend/
│   ├── index.html           # SPA Dashboard structures
│   ├── style.css            # Dark glassmorphic stylesheet
│   └── app.js               # Frontend clock logic & API integrations
└── README.md                # Configuration & Quick-start instructions (This file)
```

---

## ⚡ Setup & Launch Instructions

Follow these quick steps to get the system running locally:

### 1. Database Setup (MySQL)
Make sure you have **MySQL server** running on your computer.
- Open the `.env` file in the `backend/` directory.
- Update your database connection variables:
  ```env
  DB_HOST=localhost
  DB_USER=root
  DB_PASSWORD=your_mysql_password
  DB_NAME=office_management
  ```
- *Note:* The backend script will **automatically create** the database named `office_management` on your MySQL server if it doesn't already exist.

### 2. Start the Backend Server
1. Open your terminal/command prompt and navigate into the backend folder:
   ```bash
   cd backend
   ```
2. Install the Node.js dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm start
   ```
   *(You should see `Database 'office_management' connected successfully via Sequelize` and `Server running on port 5000` logged to your terminal.)*

### 3. Open the Frontend Dashboard
Since the frontend is built as a Single Page Application (SPA), you don't need any complex installation:
- Open your file explorer and double-click the `frontend/index.html` file to open it in your browser.
- Alternatively, you can run it using a local server (like the VS Code **Live Server** extension).

---

## 💡 How to Test the Flow

1. **Create the First HR Account**:
   - The very first account registered through the signup form is **automatically** promoted to the **HR Manager** role.
   - Go to the signup view in `index.html` and register your admin account.
2. **Add Employees (HR View)**:
   - Once logged in as HR, go to the **Employees Roster** tab in the sidebar.
   - Fill out the form on the right to register employee accounts (e.g., standard staff).
3. **Log in as Employee**:
   - Open `index.html` in another browser window (or log out).
   - Sign in with the credentials of the employee you just created.
4. **Perform Check-in / Check-out**:
   - Click the green **Check In** button.
   - You will see a live **Active Shift Stopwatch** start ticking. Your status changes, and details log.
   - Click **Check Out** when you are done.
5. **View Roster & Matrix reports (HR View)**:
   - Switch back to the HR account.
   - View the active roster statistics.
   - Open **Monthly Reports** to view the color-coded visual spreadsheet grid indicating who was Present (P), Late (L), or Absent (A) for every day of the month.
