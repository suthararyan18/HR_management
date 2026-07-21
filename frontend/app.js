// ==========================================
// CONFIGURATION & STATE
// ==========================================
const API_BASE = window.location.protocol === 'file:' ?
    'http://127.0.0.1:5000/api' :
    `${window.location.origin}/api`;

let currentUser = null;
let currentToken = localStorage.getItem('token') || null;
let shiftInterval = null; // for the active stopwatch
let monthlyReportsData = null; // cache payload for exports

// Load application configuration from database
async function loadAppConfig() {
    try {
        const res = await fetch(`${API_BASE}/config`);
        const data = await res.json();
        if (data.success) {
            if (data.appName) {
                updateBrandName(data.appName);
            }

            // If HR account already exists, hide the registration link to prevent misuse
            const authToggle = document.querySelector('.auth-toggle');
            if (authToggle) {
                if (data.hasHR) {
                    authToggle.style.display = 'none';
                } else {
                    authToggle.style.display = 'block';
                }
            }
        }
    } catch (err) {
        console.error('Failed to load app config from database:', err);
    }
}

// On page load
document.addEventListener('DOMContentLoaded', async() => {
    // 1. Immediately load local storage brand name to prevent visual flicker
    const savedBrand = localStorage.getItem('appName') || 'OmniStaff';
    updateBrandName(savedBrand);

    // 2. Fetch fresh brand name from backend database
    await loadAppConfig();

    initApp();
    startClock();
    setupEventListeners();
});

// ==========================================
// APPLICATION INITIALIZATION
// ==========================================
async function initApp() {
    if (currentToken) {
        try {
            // Validate token and fetch user details
            const response = await fetch(`${API_BASE}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });
            const data = await response.json();

            if (data.success) {
                currentUser = data.user;
                setupDashboardView();
            } else {
                // Token invalid/expired
                clearAuth();
            }
        } catch (err) {
            console.error('Initial auth fetch failed:', err);
            // Fallback: stay on login or load local offline UI if server not up yet
            showToast('Could not connect to server. Running in offline/cached mode.', 'error');
            clearAuth();
        }
    } else {
        showAuthView();
    }
}

function showAuthView() {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
}

function setupDashboardView() {
    document.documentElement.classList.remove('user-logged-in');
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');

    // Set Profile UI details
    document.getElementById('user-display-name').innerText = currentUser.name;
    document.getElementById('user-display-role').innerText = currentUser.role === 'hr' ? 'HR Manager' : 'Employee';

    // Show / Hide HR elements
    const hrElements = document.querySelectorAll('.hr-only');
    if (currentUser.role === 'hr') {
        hrElements.forEach(el => el.classList.remove('hidden'));
    } else {
        hrElements.forEach(el => el.classList.add('hidden'));
    }

    // Set active tab to Portal on launch
    switchTab('portal-tab');
    loadPortalData();
}

function clearAuth() {
    localStorage.removeItem('token');
    currentToken = null;
    currentUser = null;
    if (shiftInterval) clearInterval(shiftInterval);
    document.documentElement.classList.remove('user-logged-in');
    showAuthView();
}

// ==========================================
// REAL-TIME CLOCK & TIMERS
// ==========================================
function startClock() {
    setInterval(() => {
        const now = new Date();
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

        const timeEl = document.getElementById('live-time');
        const dateEl = document.getElementById('live-date');

        if (timeEl) timeEl.innerText = now.toLocaleTimeString('en-US', timeOptions);
        if (dateEl) dateEl.innerText = now.toLocaleDateString('en-US', dateOptions);
    }, 1000);
}

function startShiftTimer(checkInTimeStr) {
    if (shiftInterval) clearInterval(shiftInterval);

    const checkInDate = new Date(checkInTimeStr);
    const durationContainer = document.getElementById('duration-container');
    const timerEl = document.getElementById('shift-timer');

    if (durationContainer) durationContainer.classList.remove('hidden');

    shiftInterval = setInterval(() => {
        const now = new Date();
        const diffMs = now - checkInDate;

        if (diffMs < 0) return;

        const diffHours = Math.floor(diffMs / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);
        const diffSecs = Math.floor((diffMs % 60000) / 1000);

        const pad = (num) => String(num).padStart(2, '0');
        if (timerEl) {
            timerEl.innerText = `${pad(diffHours)}h ${pad(diffMins)}m ${pad(diffSecs)}s`;
        }
    }, 1000);
}

function stopShiftTimer() {
    if (shiftInterval) {
        clearInterval(shiftInterval);
        shiftInterval = null;
    }
    const durationContainer = document.getElementById('duration-container');
    if (durationContainer) durationContainer.classList.add('hidden');
}

// ==========================================
// VIEW NAVIGATION CONTROL
// ==========================================
function switchTab(tabId) {
    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Show selected panel
    const targetPanel = document.getElementById(tabId);
    if (targetPanel) targetPanel.classList.add('active');

    // Update Nav Active State
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-target') === tabId) {
            link.classList.add('active');
            // Update breadcrumbs
            const parentName = currentUser.role === 'hr' && link.closest('.hr-only') ? 'HR Operations' : 'Dashboard';
            document.getElementById('breadcrumb-parent').innerText = parentName;
            document.getElementById('breadcrumb-current').innerText = link.querySelector('span').innerText;
        }
    });

    // Load specific tab data on active selection
    if (tabId === 'portal-tab') loadPortalData();
    else if (tabId === 'history-tab') loadPersonalHistory();
    else if (tabId === 'leaves-tab') loadMyLeaves();
    else if (tabId === 'hr-analytics-tab') loadHRAnalytics();
    else if (tabId === 'hr-employees-tab') loadEmployeesRoster();
    else if (tabId === 'hr-leaves-tab') loadHRLeaves();
    else if (tabId === 'hr-reports-tab') loadMonthlyReports();
    else if (tabId === 'settings-tab') loadSettingsForm();
}

// ==========================================
// DATA RETRIEVAL & ACTIONS (API DRIVEN)
// ==========================================

// Portal Check-in / Out Loader
async function loadPortalData() {
    try {
        const res = await fetch(`${API_BASE}/attendance/status`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();

        if (!data.success) {
            showToast('Error loading attendance logs.', 'error');
            return;
        }

        const checkinBtn = document.getElementById('checkin-btn');
        const breakBtn = document.getElementById('break-btn');
        const statusIcon = document.getElementById('current-status-icon');
        const statusText = document.getElementById('current-status-text');
        const logCheckin = document.getElementById('log-checkin-time');
        const logCheckout = document.getElementById('log-checkout-time');
        const logBreak = document.getElementById('log-break-time');
        const logIp = document.getElementById('log-ip');
        const logBadge = document.getElementById('log-arrival-badge');

        // Reset notes input
        document.getElementById('checkin-notes').value = '';

        if (!data.hasCheckedIn) {
            // Off duty / Ready to check-in
            stopShiftTimer();
            checkinBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Check In`;
            checkinBtn.className = "btn btn-action btn-checkin";
            checkinBtn.disabled = false;
            breakBtn.classList.add('hidden');
            breakBtn.setAttribute('data-on-break', 'false');

            statusIcon.className = "status-circle";
            statusIcon.innerHTML = `<i class="fa-solid fa-moon"></i>`;
            statusText.innerText = "OFF SHIFT";
            statusText.style.color = "var(--text-secondary)";

            logCheckin.innerText = "-- : --";
            logCheckout.innerText = "-- : --";
            logBreak.innerText = "0 mins";
            logIp.innerText = "--.--.--.--";
            logBadge.innerText = "N/A";
            logBadge.className = "badge badge-grey";

        } else if (data.hasCheckedIn && !data.hasCheckedOut) {
            // Active Shift / Checked in
            const checkInTime = new Date(data.record.checkIn);
            startShiftTimer(data.record.checkIn);

            checkinBtn.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i> Check Out`;
            checkinBtn.className = "btn btn-action btn-checkout";
            checkinBtn.disabled = false;
            breakBtn.classList.remove('hidden');

            const breakSeconds = data.record.totalBreakTime || 0;
            const breakMins = Math.floor(breakSeconds / 60);
            const breakSecs = breakSeconds % 60;
            logBreak.innerText = `${breakMins}m ${breakSecs}s`;

            const isOnBreak = !!data.record.breakStart;
            if (isOnBreak) {
                statusIcon.className = "status-circle active-yellow";
                statusIcon.innerHTML = `<i class="fa-solid fa-mug-hot"></i>`;
                statusText.innerText = "ON BREAK";
                statusText.style.color = "var(--accent-yellow)";

                breakBtn.innerHTML = `<i class="fa-solid fa-play"></i> End Break`;
                breakBtn.style.background = "var(--accent-yellow)";
                breakBtn.style.color = "#fff";
                breakBtn.style.boxShadow = "0 0 15px rgba(245, 158, 11, 0.4)";
                breakBtn.setAttribute('data-on-break', 'true');
            } else {
                const isLate = data.record.status === 'Late';
                statusIcon.className = isLate ? "status-circle active-yellow" : "status-circle active-green";
                statusIcon.innerHTML = isLate ? `<i class="fa-solid fa-clock-pulse"></i>` : `<i class="fa-solid fa-user-check"></i>`;
                statusText.innerText = isLate ? "ACTIVE (LATE)" : "ACTIVE / ON DUTY";
                statusText.style.color = isLate ? "var(--accent-yellow)" : "var(--accent-green)";

                breakBtn.innerHTML = `<i class="fa-solid fa-mug-hot"></i> Break`;
                breakBtn.style.background = "rgba(245, 158, 11, 0.15)";
                breakBtn.style.color = "var(--accent-yellow)";
                breakBtn.style.boxShadow = "none";
                breakBtn.setAttribute('data-on-break', 'false');
            }

            logCheckin.innerText = formatTime(checkInTime);
            logCheckout.innerText = "-- : --";
            logIp.innerText = data.record.checkInIp || '127.0.0.1';
            logBadge.innerText = data.record.status;
            logBadge.className = data.record.status === 'Late' ? "badge badge-late" : "badge badge-present";

        } else {
            // Completed Shift
            stopShiftTimer();
            checkinBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Shift Completed`;
            checkinBtn.className = "btn btn-action btn-logout";
            checkinBtn.disabled = true;
            breakBtn.classList.add('hidden');
            breakBtn.setAttribute('data-on-break', 'false');

            statusIcon.className = "status-circle active-red";
            statusIcon.innerHTML = `<i class="fa-solid fa-circle-minus"></i>`;
            statusText.innerText = "SHIFT FINISHED";
            statusText.style.color = "var(--accent-red)";

            const breakSeconds = data.record.totalBreakTime || 0;
            const breakMins = Math.floor(breakSeconds / 60);
            const breakSecs = breakSeconds % 60;
            logBreak.innerText = `${breakMins}m ${breakSecs}s`;

            logCheckin.innerText = formatTime(new Date(data.record.checkIn));
            logCheckout.innerText = formatTime(new Date(data.record.checkOut));
            logIp.innerText = data.record.checkInIp || '127.0.0.1';
            logBadge.innerText = data.record.status;
            logBadge.className = data.record.status === 'Late' ? "badge badge-late" : "badge badge-present";
        }
    } catch (err) {
        console.error('Error fetching portal stats:', err);
        showToast('Failed to load status details.', 'error');
    }
}

// Perform Check In / Out Call
async function handleCheckinAction() {
    const checkinBtn = document.getElementById('checkin-btn');
    const isCheckingOut = checkinBtn.classList.contains('btn-checkout');
    const notes = document.getElementById('checkin-notes').value;

    const endpoint = isCheckingOut ? 'check-out' : 'check-in';

    try {
        const res = await fetch(`${API_BASE}/attendance/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ notes })
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message, 'success');
            loadPortalData();
        } else {
            showToast(data.message || 'Action failed.', 'error');
        }
    } catch (err) {
        console.error('Checkin action error:', err);
        showToast('Network error while completing operation.', 'error');
    }
}

// Perform Break Toggle Call
async function handleBreakAction() {
    const breakBtn = document.getElementById('break-btn');
    const isOnBreak = breakBtn.getAttribute('data-on-break') === 'true';

    const endpoint = isOnBreak ? 'break/end' : 'break/start';

    try {
        const res = await fetch(`${API_BASE}/attendance/${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message, 'success');
            loadPortalData();
        } else {
            showToast(data.message || 'Break action failed.', 'error');
        }
    } catch (err) {
        console.error('Break action error:', err);
        showToast('Network error during break operation.', 'error');
    }
}

// Personal Logs Loader
async function loadPersonalHistory() {
    const tableBody = document.getElementById('personal-history-table');
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center">Fetching logs...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/attendance/history`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();

        if (data.success) {
            if (data.history.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center">No attendance logs logged yet.</td></tr>`;
                return;
            }

            tableBody.innerHTML = '';
            data.history.forEach(log => {
                const checkInTime = log.checkIn ? formatTime(new Date(log.checkIn)) : '--:--';
                const checkOutTime = log.checkOut ? formatTime(new Date(log.checkOut)) : '--:--';

                let statusBadge = '';
                if (log.status === 'Present') statusBadge = '<span class="badge badge-present">Present</span>';
                else if (log.status === 'Late') statusBadge = '<span class="badge badge-late">Late</span>';
                else statusBadge = '<span class="badge badge-absent">Absent</span>';

                const row = document.createElement('tr');
                row.innerHTML = `
          <td><strong>${formatDate(log.date)}</strong></td>
          <td>${checkInTime}</td>
          <td>${checkOutTime}</td>
          <td><code>${log.checkInIp || '-'}</code></td>
          <td>${log.notes || '<span class="text-muted">None</span>'}</td>
          <td>${statusBadge}</td>
        `;
                tableBody.appendChild(row);
            });
        } else {
            showToast('Failed to fetch personal logs.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to connect to backend.', 'error');
    }
}

// HR Analytics Loader
async function loadHRAnalytics() {
    try {
        const res = await fetch(`${API_BASE}/hr/analytics`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();

        if (data.success) {
            // Counter Stats
            document.getElementById('hr-stat-total').innerText = data.stats.totalEmployees;
            document.getElementById('hr-stat-present').innerText = data.stats.presentToday;
            document.getElementById('hr-stat-late').innerText = data.stats.lateToday;
            document.getElementById('hr-stat-absent').innerText = data.stats.absentToday;

            // Active Roster Table
            const activeTable = document.getElementById('hr-active-table');
            if (data.recentActivity.length === 0) {
                activeTable.innerHTML = `<tr><td colspan="7" class="text-center">No employees active today yet.</td></tr>`;
            } else {
                activeTable.innerHTML = '';
                data.recentActivity.forEach(log => {
                    const empName = log.User ? log.User.name : 'Unknown';
                    const dept = log.User ? log.User.department : '-';
                    const checkIn = log.checkIn ? formatTime(new Date(log.checkIn)) : '--:--';
                    const checkOut = log.checkOut ? formatTime(new Date(log.checkOut)) : '--:--';

                    let statusBadge = '';
                    if (log.breakStart) {
                        statusBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 600;"><i class="fa-solid fa-mug-hot"></i> On Break</span>';
                    } else if (log.status === 'Present') {
                        statusBadge = '<span class="badge badge-present">Present</span>';
                    } else if (log.status === 'Late') {
                        statusBadge = '<span class="badge badge-late">Late</span>';
                    } else {
                        statusBadge = '<span class="badge badge-absent">Absent</span>';
                    }

                    let displayCheckOut = checkOut;
                    if (log.totalBreakTime > 0) {
                        const breakMins = Math.floor(log.totalBreakTime / 60);
                        const breakSecs = log.totalBreakTime % 60;
                        displayCheckOut += ` <small class="text-muted" style="display: block;">(Break: ${breakMins}m ${breakSecs}s)</small>`;
                    }

                    const row = document.createElement('tr');
                    row.innerHTML = `
            <td><strong>${empName}</strong></td>
            <td>${dept}</td>
            <td>${checkIn}</td>
            <td>${displayCheckOut}</td>
            <td>${statusBadge}</td>
            <td><span class="text-muted" style="font-size: 0.85rem;">${log.notes || '-'}</span></td>
            <td><code>${log.checkInIp || '-'}</code></td>
          `;
                    activeTable.appendChild(row);
                });
            }

            // Populate Manual Override Employee List Dropdown
            loadEmployeeDropdown();
        } else {
            showToast('Error loading HR analytics.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to connect to HR endpoints.', 'error');
    }
}

// Load Employees dropdown for Manual adjustment selection
async function loadEmployeeDropdown() {
    const select = document.getElementById('manual-employee-select');
    try {
        const res = await fetch(`${API_BASE}/hr/employees`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();

        if (data.success) {
            select.innerHTML = '<option value="">-- Choose Employee --</option>';
            data.employees.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.id;
                option.innerText = `${emp.name} (${emp.department})`;
                select.appendChild(option);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

// HR Employee Roster Loader
async function loadEmployeesRoster() {
    const rosterTable = document.getElementById('hr-employees-table');
    rosterTable.innerHTML = `<tr><td colspan="7" class="text-center">Fetching workforce roster...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/hr/employees`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();

        if (data.success) {
            if (data.employees.length === 0) {
                rosterTable.innerHTML = `<tr><td colspan="7" class="text-center">No employee records found.</td></tr>`;
                return;
            }

            rosterTable.innerHTML = '';
            data.employees.forEach(emp => {
                const row = document.createElement('tr');

                let statusBadge = emp.isActive ?
                    `<span class="badge badge-present">Active</span>` :
                    `<span class="badge badge-absent">Inactive</span>`;

                let actionBtn = emp.isActive ?
                    `<button class="btn toggle-status-btn" data-id="${emp.id}" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-user-slash"></i> Deactivate</button>` :
                    `<button class="btn toggle-status-btn" data-id="${emp.id}" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); color: #22c55e; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-user-check"></i> Reactivate</button>`;

                row.innerHTML = `
          <td><strong>${emp.name}</strong></td>
          <td>${emp.email}</td>
          <td>${emp.department}</td>
          <td>${emp.designation}</td>
          <td>${formatDate(emp.joinedDate)}</td>
          <td>${statusBadge}</td>
          <td>${actionBtn}</td>
        `;
                rosterTable.appendChild(row);
            });

            // Bind toggle status action
            document.querySelectorAll('.toggle-status-btn').forEach(btn => {
                btn.addEventListener('click', async(e) => {
                    const empId = btn.getAttribute('data-id');
                    await toggleEmployeeStatus(empId);
                });
            });
        } else {
            showToast('Could not fetch workforce roster.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error loading roster database.', 'error');
    }
}

// HR Monthly Spreadsheet Grid Loader
async function loadMonthlyReports() {
    const gridHeader = document.getElementById('report-grid-header');
    const gridBody = document.getElementById('report-grid-body');

    gridHeader.innerHTML = '<tr><th>Employee Name</th></tr>';
    gridBody.innerHTML = '<tr><td class="text-center">Compiling monthly grid...</td></tr>';

    try {
        // 1. Fetch Roster, Logs & Approved Leaves
        const rosterRes = await fetch(`${API_BASE}/hr/employees`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const rosterData = await rosterRes.json();

        const logsRes = await fetch(`${API_BASE}/hr/reports`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const logsData = await logsRes.json();

        const leavesRes = await fetch(`${API_BASE}/leaves/admin/all`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const leavesData = await leavesRes.json();

        if (rosterData.success && logsData.success) {
            const employees = rosterData.employees;
            const logs = logsData.logs;
            const leaves = leavesData.success ? leavesData.requests : [];
            const approvedLeaves = leaves.filter(l => l.status === 'Approved');

            // Cache globally for exports
            monthlyReportsData = { employees, logs, approvedLeaves };

            // 2. Determine total days in current month
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth(); // 0-indexed
            const totalDays = new Date(year, month + 1, 0).getDate();

            // 3. Build Header columns for each day of the month
            const headerRow = gridHeader.querySelector('tr');
            for (let day = 1; day <= totalDays; day++) {
                const th = document.createElement('th');
                th.innerText = day;
                headerRow.appendChild(th);
            }

            if (employees.length === 0) {
                gridBody.innerHTML = `<tr><td colspan="${totalDays + 1}" class="text-center">No employee records in database.</td></tr>`;
                return;
            }

            // 4. Map logs and leaves for quick lookups
            const logsMap = {};
            logs.forEach(log => {
                if (!logsMap[log.userId]) logsMap[log.userId] = {};
                logsMap[log.userId][log.date] = log;
            });

            const leavesMap = {};
            approvedLeaves.forEach(lv => {
                if (!leavesMap[lv.userId]) leavesMap[lv.userId] = [];
                leavesMap[lv.userId].push(lv);
            });

            // 5. Generate grid rows
            gridBody.innerHTML = '';
            employees.forEach(emp => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td><strong>${emp.name}</strong><br><small class="text-muted">${emp.department}</small></td>`;

                for (let day = 1; day <= totalDays; day++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayDateObj = new Date(year, month, day);
                    const isFuture = dayDateObj > now;
                    const isSunday = dayDateObj.getDay() === 0;

                    const td = document.createElement('td');
                    const userDayLog = logsMap[emp.id] ? logsMap[emp.id][dateStr] : null;

                    // Check if user is on approved leave
                    const empLeaves = leavesMap[emp.id] || [];
                    const isOnLeave = empLeaves.some(lv => {
                        const s = new Date(lv.startDate + 'T00:00:00');
                        const e = new Date(lv.endDate + 'T00:00:00');
                        return dayDateObj >= s && dayDateObj <= e;
                    });

                    if (userDayLog) {
                        // Checked in status
                        const inTimeStr = userDayLog.checkIn ? formatTime(new Date(userDayLog.checkIn)) : 'Manual';
                        const statusClass = userDayLog.status === 'Present' ? 'cell-present' : 'cell-late';
                        const statusLetter = userDayLog.status === 'Present' ? 'P' : 'L';
                        const tooltip = `${userDayLog.status}: Checked-in at ${inTimeStr}`;

                        td.innerHTML = `<div class="cell-status ${statusClass}" title="${tooltip}">${statusLetter}</div>`;
                    } else if (isOnLeave) {
                        // Approved Leave
                        td.innerHTML = `<div class="cell-status" style="background: rgba(167, 139, 250, 0.25); border: 1px solid rgba(167, 139, 250, 0.4); color: #a78bfa;" title="Approved Leave (Off-duty)">LV</div>`;
                    } else if (isFuture) {
                        // Future dates
                        td.innerHTML = `<div class="cell-status cell-empty" title="Future date">-</div>`;
                    } else if (isSunday) {
                        // Weekend Sunday
                        td.innerHTML = `<div class="cell-status cell-empty" style="color: var(--text-muted);" title="Sunday / Weekend">W</div>`;
                    } else {
                        // Past workday without log (Absent)
                        td.innerHTML = `<div class="cell-status cell-absent" title="Absent/No check-in">A</div>`;
                    }

                    tr.appendChild(td);
                }

                gridBody.appendChild(tr);
            });
        } else {
            showToast('Error syncing roster grids.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to compile reports.', 'error');
    }
}

// ==========================================
// EVENT LISTENERS & FORMS HANDLING
// ==========================================
function setupEventListeners() {

    // Auth Form switching
    document.getElementById('show-signup').addEventListener('click', () => {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('signup-form').classList.remove('hidden');
        document.getElementById('auth-subtitle').innerText = 'Create your administrator HR account';
    });

    document.getElementById('show-login').addEventListener('click', () => {
        document.getElementById('signup-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('auth-subtitle').innerText = 'Sign in to your workplace dashboard';
    });

    // Login submission
    document.getElementById('login-form').addEventListener('submit', async(e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (data.success) {
                localStorage.setItem('token', data.token);
                currentToken = data.token;
                currentUser = data.user;
                showToast('Welcome back! Login successful.', 'success');
                setupDashboardView();
            } else {
                showToast(data.message || 'Login failed.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Connection to login API failed.', 'error');
        }
    });

    // Signup submission
    document.getElementById('signup-form').addEventListener('submit', async(e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const department = document.getElementById('signup-department').value;
        const designation = document.getElementById('signup-designation').value;

        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, department, designation })
            });
            const data = await res.json();

            if (data.success) {
                localStorage.setItem('token', data.token);
                currentToken = data.token;
                currentUser = data.user;
                showToast('Registration successful! Created HR Admin account.', 'success');
                setupDashboardView();
            } else {
                showToast(data.message || 'Registration failed.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Connection to registration API failed.', 'error');
        }
    });

    // Logout Click
    document.getElementById('logout-btn').addEventListener('click', () => {
        clearAuth();
        showToast('You have logged out.', 'info');
    });

    // Navigation click routing
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = link.getAttribute('data-target');
            switchTab(targetTab);
        });
    });

    // Checkin / Checkout button click
    document.getElementById('checkin-btn').addEventListener('click', () => {
        handleCheckinAction();
    });

    // Break toggle button click
    document.getElementById('break-btn').addEventListener('click', () => {
        handleBreakAction();
    });

    // Manual Adjustments Form Submit (HR)
    document.getElementById('hr-manual-form').addEventListener('submit', async(e) => {
        e.preventDefault();
        const userId = document.getElementById('manual-employee-select').value;
        const date = document.getElementById('manual-date').value;
        const checkInTime = document.getElementById('manual-checkin').value;
        const checkOutTime = document.getElementById('manual-checkout').value;
        const status = document.getElementById('manual-status').value;
        const notes = document.getElementById('manual-notes').value;

        // Convert time input (HH:MM) to date objects if present
        let checkIn = null;
        let checkOut = null;

        if (checkInTime) {
            checkIn = new Date(`${date}T${checkInTime}:00`);
        }
        if (checkOutTime) {
            checkOut = new Date(`${date}T${checkOutTime}:00`);
        }

        try {
            const res = await fetch(`${API_BASE}/hr/attendance/manual`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ userId, date, checkIn, checkOut, status, notes })
            });
            const data = await res.json();

            if (data.success) {
                showToast('Manual override saved successfully.', 'success');
                loadHRAnalytics();
                // Clear fields
                document.getElementById('hr-manual-form').reset();
            } else {
                showToast(data.message || 'Adjustment failed.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error during manual override.', 'error');
        }
    });

    // Add Employee Form Submit (HR)
    document.getElementById('hr-add-employee-form').addEventListener('submit', async(e) => {
        e.preventDefault();
        const name = document.getElementById('add-emp-name').value;
        const email = document.getElementById('add-emp-email').value;
        const password = document.getElementById('add-emp-password').value;
        const department = document.getElementById('add-emp-dept').value;
        const designation = document.getElementById('add-emp-desg').value;

        try {
            const res = await fetch(`${API_BASE}/hr/employees`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ name, email, password, department, designation })
            });
            const data = await res.json();

            if (data.success) {
                showToast(`Staff registered: ${data.employee.name}`, 'success');
                loadEmployeesRoster();
                document.getElementById('hr-add-employee-form').reset();
            } else {
                showToast(data.message || 'Registration failed.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error registering employee.', 'error');
        }
    });

    // Tab refresh clickers
    document.getElementById('refresh-history-btn').addEventListener('click', () => loadPersonalHistory());
    document.getElementById('refresh-analytics-btn').addEventListener('click', () => loadHRAnalytics());
    document.getElementById('refresh-roster-btn').addEventListener('click', () => loadEmployeesRoster());
    document.getElementById('refresh-reports-btn').addEventListener('click', () => loadMonthlyReports());
    document.getElementById('refresh-leaves-btn').addEventListener('click', () => loadMyLeaves());
    document.getElementById('refresh-hr-leaves-btn').addEventListener('click', () => loadHRLeaves());

    // Export Reports handlers
    document.getElementById('download-csv-btn').addEventListener('click', () => downloadCSV());
    document.getElementById('download-pdf-btn').addEventListener('click', () => printReport());

    // Apply Leave form submit
    document.getElementById('apply-leave-form').addEventListener('submit', async(e) => {
        e.preventDefault();
        const startDate = document.getElementById('leave-start-date').value;
        const endDate = document.getElementById('leave-end-date').value;
        const type = document.getElementById('leave-type').value;
        const reason = document.getElementById('leave-reason').value;

        try {
            const res = await fetch(`${API_BASE}/leaves/apply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ startDate, endDate, type, reason })
            });
            const data = await res.json();

            if (data.success) {
                showToast('Leave request submitted successfully!', 'success');
                document.getElementById('apply-leave-form').reset();
                loadMyLeaves();
            } else {
                showToast(data.message || 'Leave submission failed.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error submitting leave.', 'error');
        }
    });

    // Settings Form Submit
    document.getElementById('settings-form').addEventListener('submit', async(e) => {
        e.preventDefault();
        const name = document.getElementById('settings-name').value;
        const email = document.getElementById('settings-email').value;
        const password = document.getElementById('settings-password').value;
        const confirmPassword = document.getElementById('settings-confirm-password').value;
        const appNameVal = document.getElementById('settings-app-name').value;

        if (password && password !== confirmPassword) {
            showToast('Passwords do not match.', 'error');
            return;
        }

        // Save app branding settings locally
        updateBrandName(appNameVal);

        // If logged in user is HR, also save branding to database
        if (currentUser && currentUser.role === 'hr' && appNameVal) {
            try {
                await fetch(`${API_BASE}/hr/settings`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentToken}`
                    },
                    body: JSON.stringify({ appName: appNameVal })
                });
            } catch (err) {
                console.error('Failed to sync appName setting to database:', err);
            }
        }

        try {
            const res = await fetch(`${API_BASE}/auth/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ name, email, password })
            });
            const data = await res.json();

            if (data.success) {
                showToast(data.message || 'Settings updated successfully.', 'success');
                currentUser = data.user; // Update cached details
                // Update Sidebar user display name
                document.getElementById('user-display-name').innerText = currentUser.name;
                loadSettingsForm();
            } else {
                showToast(data.message || 'Update failed.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Connection to server failed.', 'error');
        }
    });
}

// ==========================================
// LEAVE MANAGEMENT SYSTEM FUNCTIONS
// ==========================================
async function loadMyLeaves() {
    const tableBody = document.getElementById('my-leaves-table');
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center">Fetching leave log history...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/leaves/my-requests`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();

        if (data.success) {
            if (data.requests.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="text-center">No leave requests logged yet.</td></tr>`;
                return;
            }

            tableBody.innerHTML = '';
            data.requests.forEach(req => {
                let statusBadge = '';
                if (req.status === 'Approved') statusBadge = '<span class="badge badge-present">Approved</span>';
                else if (req.status === 'Rejected') statusBadge = '<span class="badge badge-absent">Rejected</span>';
                else statusBadge = '<span class="badge badge-late">Pending</span>';

                const row = document.createElement('tr');
                row.innerHTML = `
          <td><strong>${formatDate(req.startDate)}</strong> to <strong>${formatDate(req.endDate)}</strong></td>
          <td>${req.type}</td>
          <td>${req.reason}</td>
          <td>${statusBadge}</td>
          <td>${req.hrNotes || '<span class="text-muted">-</span>'}</td>
        `;
                tableBody.appendChild(row);
            });
        } else {
            showToast('Failed to fetch leave request logs.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to connect to leaves API.', 'error');
    }
}

async function loadHRLeaves() {
    const tableBody = document.getElementById('hr-leaves-table');
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center">Fetching leave requests roster...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/leaves/admin/all`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();

        if (data.success) {
            if (data.requests.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center">No leave applications found.</td></tr>`;
                return;
            }

            tableBody.innerHTML = '';
            data.requests.forEach(req => {
                const empName = req.User ? req.User.name : 'Unknown';
                const dept = req.User ? req.User.department : 'General';

                let statusBadge = '';
                if (req.status === 'Approved') statusBadge = '<span class="badge badge-present">Approved</span>';
                else if (req.status === 'Rejected') statusBadge = '<span class="badge badge-absent">Rejected</span>';
                else statusBadge = '<span class="badge badge-late">Pending</span>';

                let actionCell = '';
                if (req.status === 'Pending') {
                    actionCell = `
            <div style="display: flex; flex-direction: column; gap: 8px; max-width: 250px;">
              <input type="text" id="hr-feedback-${req.id}" placeholder="HR response notes..." style="padding: 6px 10px; font-size: 0.85rem;">
              <div style="display: flex; gap: 8px;">
                <button onclick="handleLeaveAction(${req.id}, 'Approved')" class="btn btn-primary" style="padding: 6px 12px; font-size: 0.8rem;"><i class="fa-solid fa-check"></i> Approve</button>
                <button onclick="handleLeaveAction(${req.id}, 'Rejected')" class="btn btn-logout" style="padding: 6px 12px; font-size: 0.8rem;"><i class="fa-solid fa-xmark"></i> Reject</button>
              </div>
            </div>
          `;
                } else {
                    actionCell = req.hrNotes || '<span class="text-muted">No comments provided</span>';
                }

                const row = document.createElement('tr');
                row.innerHTML = `
          <td><strong>${empName}</strong><br><small class="text-muted">${dept}</small></td>
          <td><strong>${formatDate(req.startDate)}</strong> to <strong>${formatDate(req.endDate)}</strong></td>
          <td>${req.type}</td>
          <td>${req.reason}</td>
          <td>${statusBadge}</td>
          <td>${actionCell}</td>
        `;
                tableBody.appendChild(row);
            });
        } else {
            showToast('Error loading leave requests.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to connect to HR leaves API.', 'error');
    }
}

async function handleLeaveAction(requestId, status) {
    const hrNotesInput = document.getElementById(`hr-feedback-${requestId}`);
    const hrNotes = hrNotesInput ? hrNotesInput.value : '';

    try {
        const res = await fetch(`${API_BASE}/leaves/admin/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ requestId, status, hrNotes })
        });
        const data = await res.json();

        if (data.success) {
            showToast(`Leave application successfully ${status.toLowerCase()}`, 'success');
            loadHRLeaves();
        } else {
            showToast(data.message || 'Action failed.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error sending action status.', 'error');
    }
}

// ==========================================
// UTILITY DATE & TIME FORMATTERS
// ==========================================
function formatTime(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj)) return '--:--';
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatDate(dateString) {
    const d = new Date(dateString);
    if (isNaN(d)) return dateString;
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleDateString('en-US', options);
}

// ==========================================
// TOAST NOTIFICATIONS HELPER
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';

    toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <div class="toast-message">${message}</div>
    <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;

    // Append
    container.appendChild(toast);

    // Auto remove after 5 seconds
    const autoClose = setTimeout(() => {
        removeToast(toast);
    }, 5000);

    // Close button click
    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(autoClose);
        removeToast(toast);
    });
}

function removeToast(toast) {
    toast.style.animation = 'toast-slide-in 0.3s ease-out reverse forwards';
    toast.addEventListener('animationend', () => {
        toast.remove();
    });
}

// ==========================================
// EXPORT UTILITIES (CSV & PRINT REPORT)
// ==========================================
function downloadCSV() {
    if (!monthlyReportsData) {
        showToast('No monthly reports data available. Click Refresh to reload grid data.', 'error');
        return;
    }

    const { employees, logs, approvedLeaves } = monthlyReportsData;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Create Header Row
    let csvContent = "Employee Name,Department,Email,";
    for (let day = 1; day <= totalDays; day++) {
        csvContent += `Day ${day},`;
    }
    csvContent += "Present Count,Late Count,Absent Count,Leave Count\n";

    // Pre-map logs and leaves
    const logsMap = {};
    logs.forEach(log => {
        if (!logsMap[log.userId]) logsMap[log.userId] = {};
        logsMap[log.userId][log.date] = log;
    });

    const leavesMap = {};
    approvedLeaves.forEach(lv => {
        if (!leavesMap[lv.userId]) leavesMap[lv.userId] = [];
        leavesMap[lv.userId].push(lv);
    });

    // Loop through employees
    employees.forEach(emp => {
        let row = `"${emp.name}","${emp.department || 'N/A'}","${emp.email}",`;
        let presentCount = 0;
        let lateCount = 0;
        let absentCount = 0;
        let leaveCount = 0;

        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayDateObj = new Date(year, month, day);
            const isFuture = dayDateObj > now;
            const isSunday = dayDateObj.getDay() === 0;

            const userDayLog = logsMap[emp.id] ? logsMap[emp.id][dateStr] : null;
            const empLeaves = leavesMap[emp.id] || [];
            const isOnLeave = empLeaves.some(lv => {
                const s = new Date(lv.startDate + 'T00:00:00');
                const e = new Date(lv.endDate + 'T00:00:00');
                return dayDateObj >= s && dayDateObj <= e;
            });

            if (userDayLog) {
                if (userDayLog.status === 'Present') {
                    row += "P,";
                    presentCount++;
                } else {
                    row += "L,";
                    lateCount++;
                }
            } else if (isOnLeave) {
                row += "LV,";
                leaveCount++;
            } else if (isFuture) {
                row += "-,";
            } else if (isSunday) {
                row += "W,";
            } else {
                row += "A,";
                absentCount++;
            }
        }

        row += `${presentCount},${lateCount},${absentCount},${leaveCount}\n`;
        csvContent += row;
    });

    // Download trigger
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_Report_${month + 1}_${year}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV report downloaded successfully.', 'success');
}

function printReport() {
    if (!monthlyReportsData) {
        showToast('No monthly reports data available to print.', 'error');
        return;
    }

    const { employees, logs, approvedLeaves } = monthlyReportsData;
    const now = new Date();
    const year = now.getFullYear();
    const monthName = now.toLocaleString('default', { month: 'long' });
    const monthNum = now.getMonth();
    const totalDays = new Date(year, monthNum + 1, 0).getDate();

    const logsMap = {};
    logs.forEach(log => {
        if (!logsMap[log.userId]) logsMap[log.userId] = {};
        logsMap[log.userId][log.date] = log;
    });

    const leavesMap = {};
    approvedLeaves.forEach(lv => {
        if (!leavesMap[lv.userId]) leavesMap[lv.userId] = [];
        leavesMap[lv.userId].push(lv);
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocker prevented opening the print report window.', 'error');
        return;
    }

    let html = `
    <html>
      <head>
        <title>Attendance Report - ${monthName} ${year}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
          h2 { text-align: center; margin-bottom: 5px; color: #111827; }
          p.meta { text-align: center; margin-bottom: 20px; color: #6b7280; font-size: 0.9rem; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.75rem; }
          th, td { border: 1px solid #e5e7eb; padding: 8px 4px; text-align: center; }
          th { background: #f3f4f6; color: #374151; font-weight: bold; }
          td.emp-name { text-align: left; font-weight: bold; min-width: 120px; }
          .badge { display: inline-block; padding: 2px 4px; border-radius: 4px; font-weight: bold; font-size: 0.7rem; }
          .cell-p { background: #d1fae5; color: #065f46; }
          .cell-l { background: #fef3c7; color: #92400e; }
          .cell-a { background: #fee2e2; color: #991b1b; }
          .cell-lv { background: #ede9fe; color: #5b21b6; }
          .cell-w { color: #9ca3af; }
          @media print {
            button { display: none; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <h2>Attendance Spreadsheet Roster</h2>
        <p class="meta">Month: <strong>${monthName} ${year}</strong> | Exported on: ${new Date().toLocaleDateString()}</p>
        
        <table>
          <thead>
            <tr>
              <th>Employee (Dept)</th>
  `;

    for (let day = 1; day <= totalDays; day++) {
        html += `<th>${day}</th>`;
    }

    html += `
            </tr>
          </thead>
          <tbody>
  `;

    employees.forEach(emp => {
        html += `<tr><td class="emp-name">${emp.name} (${emp.department || 'Staff'})</td>`;

        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayDateObj = new Date(year, monthNum, day);
            const isFuture = dayDateObj > now;
            const isSunday = dayDateObj.getDay() === 0;

            const userDayLog = logsMap[emp.id] ? logsMap[emp.id][dateStr] : null;
            const empLeaves = leavesMap[emp.id] || [];
            const isOnLeave = empLeaves.some(lv => {
                const s = new Date(lv.startDate + 'T00:00:00');
                const e = new Date(lv.endDate + 'T00:00:00');
                return dayDateObj >= s && dayDateObj <= e;
            });

            if (userDayLog) {
                if (userDayLog.status === 'Present') {
                    html += `<td><span class="badge cell-p">P</span></td>`;
                } else {
                    html += `<td><span class="badge cell-l">L</span></td>`;
                }
            } else if (isOnLeave) {
                html += `<td><span class="badge cell-lv">LV</span></td>`;
            } else if (isFuture) {
                html += `<td>-</td>`;
            } else if (isSunday) {
                html += `<td class="cell-w">W</td>`;
            } else {
                html += `<td><span class="badge cell-a">A</span></td>`;
            }
        }
        html += `</tr>`;
    });

    html += `
          </tbody>
        </table>
        
        <div style="margin-top: 20px; font-size: 0.8rem; color: #6b7280;">
          <strong>Legend:</strong> P = Present | L = Late | A = Absent | LV = Approved Leave | W = Weekend | - = Future
        </div>
        
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        <\/script>
      </body>
    </html>
  `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
}

// ==========================================
// ADDITIONAL CONTROLLERS (STATUS & SETTINGS)
// ==========================================
async function toggleEmployeeStatus(empId) {
    try {
        const res = await fetch(`${API_BASE}/hr/employees/${empId}/toggle-status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            loadEmployeesRoster(); // Reload the roster grid
            loadHRAnalytics(); // Reload analytics counters
        } else {
            showToast(data.message || 'Failed to toggle status.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to connect to server.', 'error');
    }
}

function loadSettingsForm() {
    if (currentUser) {
        document.getElementById('settings-name').value = currentUser.name || '';
        document.getElementById('settings-email').value = currentUser.email || '';
        document.getElementById('settings-password').value = '';
        document.getElementById('settings-confirm-password').value = '';
        document.getElementById('settings-app-name').value = localStorage.getItem('appName') || 'OmniStaff';

        // Hide Web App Name setting for regular employees (Only HR can rename the workspace)
        const appNameInput = document.getElementById('settings-app-name');
        const appNameLabel = document.querySelector('label[for="settings-app-name"]');
        if (currentUser.role === 'hr') {
            if (appNameInput) appNameInput.style.display = 'block';
            if (appNameLabel) appNameLabel.style.display = 'block';
        } else {
            if (appNameInput) appNameInput.style.display = 'none';
            if (appNameLabel) appNameLabel.style.display = 'none';
        }
    }
}

function updateBrandName(name) {
    const brandName = name ? name.trim() : 'OmniStaff';
    localStorage.setItem('appName', brandName);

    // Update all instances of logo span text
    document.querySelectorAll('.logo span').forEach(el => {
        el.innerText = brandName;
    });

    // Update tab title
    document.title = `${brandName} - Office & Attendance Dashboard`;
}