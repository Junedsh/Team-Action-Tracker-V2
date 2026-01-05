
import supabase from './supabaseClient.js';
import * as UI from './ui.js';
import * as Auth from './auth.js';
import { formatDate, isOverdue, calculatePromiseDifference } from './utils.js';

// --- DATA STORE ---
let teamMembers = [];
let tasks = [];
let projects = [];

// --- CHART & CALENDAR REFS ---
const statusChart = { current: null };
const priorityChart = { current: null };
const ownerChart = { current: null };
const calendar = { current: null };

// --- STATE MANAGEMENT ---
let currentFilters = { search: '', owner: 'all', status: 'all', dateStart: null, dateEnd: null, project: 'all', priority: 'all' };
let currentSort = { key: 'promise_date', order: 'asc' };
let currentUser = null;
let currentDepartment = null;

// --- ELEMENT SELECTORS ---
const mainContent = document.getElementById('main-content');
const navBar = document.querySelector('nav');
const authOverlay = document.getElementById('auth-overlay');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authName = document.getElementById('auth-name');
const authErrorBox = document.getElementById('auth-error-box');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleAuthModeBtn = document.getElementById('toggle-auth-mode-btn');

// V2 Auth Selectors
const signupFields = document.getElementById('signup-fields');
const btnModeJoin = document.getElementById('btn-mode-join');
const btnModeCreate = document.getElementById('btn-mode-create');
const fieldTeamCode = document.getElementById('field-team-code');
const fieldTeamName = document.getElementById('field-team-name');
const authTeamCode = document.getElementById('auth-team-code');
const authTeamName = document.getElementById('auth-team-name');
const signupType = document.getElementById('signup-type');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

const filterOwner = document.getElementById('filter-owner');
const filterStatus = document.getElementById('filter-status');
const filterProject = document.getElementById('filter-project');
const filterPriority = document.getElementById('filter-priority');
const filterDateStart = document.getElementById('filter-date-start');
const filterDateEnd = document.getElementById('filter-date-end');
const searchInput = document.getElementById('search-input');
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const teamModal = document.getElementById('team-modal');
const teamForm = document.getElementById('team-form');
const projectModal = document.getElementById('project-modal');
const projectForm = document.getElementById('project-form');
const modalTitle = document.getElementById('modal-title');
const modalSubmitBtn = document.getElementById('modal-submit-btn');
const ownerSelect = document.getElementById('task-owner');
const ownerHelperText = document.getElementById('owner-helper-text');
const calendarEl = document.getElementById('calendar');

// --- DATA FETCHING ---

// --- AUTH LOGIC (V2) ---
let isSignUpMode = false;

const toggleAuthMode = () => {
    isSignUpMode = !isSignUpMode;
    // UI Updates
    authTitle.textContent = isSignUpMode ? 'Create Account' : 'Welcome Back';
    authSubtitle.textContent = isSignUpMode ? 'Join or create a team to get started' : 'Sign in to access your team\'s dashboard';
    authSubmitBtn.textContent = isSignUpMode ? 'Sign Up' : 'Sign In';
    toggleAuthModeBtn.textContent = isSignUpMode ? 'Already have an account? Sign In' : 'Need an account? Sign Up';
    signupFields.classList.toggle('hidden', !isSignUpMode);
    authErrorBox.classList.add('hidden');
};

const setSignupType = (type) => {
    signupType.value = type;
    // Update Button Styles
    if (type === 'join') {
        btnModeJoin.classList.add('bg-indigo-50', 'text-indigo-700', 'border-indigo-200');
        btnModeJoin.classList.remove('bg-white', 'text-gray-700', 'border-gray-300');
        btnModeCreate.classList.add('bg-white', 'text-gray-700', 'border-gray-300');
        btnModeCreate.classList.remove('bg-indigo-50', 'text-indigo-700', 'border-indigo-200');
        fieldTeamCode.classList.remove('hidden');
        fieldTeamName.classList.add('hidden');
    } else {
        btnModeCreate.classList.add('bg-indigo-50', 'text-indigo-700', 'border-indigo-200');
        btnModeCreate.classList.remove('bg-white', 'text-gray-700', 'border-gray-300');
        btnModeJoin.classList.add('bg-white', 'text-gray-700', 'border-gray-300');
        btnModeJoin.classList.remove('bg-indigo-50', 'text-indigo-700', 'border-indigo-200');
        fieldTeamName.classList.remove('hidden');
        fieldTeamCode.classList.add('hidden');
    }
};

const handleAuth = async (e) => {
    e.preventDefault();
    authErrorBox.classList.add('hidden');

    const email = authEmail.value;
    const password = authPassword.value;

    try {
        if (isSignUpMode) {
            // Validate V2 Fields
            const fullName = authName.value.trim();
            if (!fullName) throw new Error("Full Name is required.");

            if (signupType.value === 'join' && !authTeamCode.value.trim()) throw new Error("Team Code is required.");
            if (signupType.value === 'create' && !authTeamName.value.trim()) throw new Error("Team Name is required.");

            // 1. Sign Up User
            const { data: { user }, error: signUpError } = await Auth.signUp(email, password);
            if (signUpError) throw signUpError;
            if (!user) throw new Error("Signup failed.");

            // 2. Handle Team Logic
            if (signupType.value === 'create') {
                // Create Department
                const deptName = authTeamName.value.trim();
                const accessCode = deptName.substring(0, 3).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

                const { data: dept, error: deptError } = await supabase.from('departments').insert([
                    { name: deptName, access_code: accessCode }
                ]).select().single();

                if (deptError) throw deptError;

                // Create Profile (Admin)
                const { error: profileError } = await supabase.from('profiles').insert([
                    { id: user.id, full_name: fullName, department_id: dept.id, role: 'Admin' }
                ]);
                if (profileError) throw profileError;

                alert(`Team Created! Your Code is: ${accessCode}\nShare this with your team.`);

            } else {
                // Join Team
                const code = authTeamCode.value.trim().toUpperCase();

                // Find Dept
                const { data: dept, error: findError } = await supabase.from('departments').select('id, name')
                    .eq('access_code', code).single();

                if (findError || !dept) throw new Error("Invalid Team Code. Please ask your manager.");

                // Create Profile (Member)
                const { error: profileError } = await supabase.from('profiles').insert([
                    { id: user.id, full_name: fullName, department_id: dept.id, role: 'Member' }
                ]);
                if (profileError) throw profileError;
            }

            isSignUpMode = false;
            toggleAuthModeBtn.click(); // Reset UI
            alert("Account created successfully! You are now logged in.");

        } else {
            // Sign In
            const { error } = await Auth.signIn(email, password);
            if (error) throw error;
        }

    } catch (err) {
        authErrorBox.textContent = err.message;
        authErrorBox.classList.remove('hidden');
    }
};

const handleLogout = async () => {
    await Auth.signOut();
    window.location.reload();
};

const updateAuthUI = async (user) => {
    if (user) {
        currentUser = user;
        // Fetch Profile & Department
        const { data: profile } = await supabase.from('profiles').select('*, departments(name, access_code)').eq('id', user.id).single();

        if (profile) {
            currentDepartment = profile.departments;
            authOverlay.classList.add('hidden');
            mainContent.classList.remove('blur-sm', 'pointer-events-none'); // Unlock Main

            // Update Header
            userDisplay.textContent = `${profile.full_name} (${currentDepartment.name})`;
            userDisplay.classList.remove('hidden');
            logoutBtn.classList.remove('hidden');

            // Initial Fetch
            fetchData();
        } else {
            console.error("User has no profile!");
            alert("Profile not found. Please contact support.");
            await Auth.signOut();
            window.location.reload();
        }
    } else {
        authOverlay.classList.remove('hidden');
        mainContent.classList.add('blur-sm', 'pointer-events-none');
        userDisplay.classList.add('hidden');
        logoutBtn.classList.add('hidden');
    }
};

const checkSession = async () => {
    const user = await Auth.getUser();
    updateAuthUI(user);
};

// --- DATA FETCHING ---
const fetchData = async () => {
    // Enable Realtime Subscriptions
    supabase.channel('public:all')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
            handleRealtimeUpdate('tasks', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, payload => {
            handleRealtimeUpdate('team_members', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, payload => {
            handleRealtimeUpdate('projects', payload);
        })
        .subscribe();

    // Initial Fetch
    const { data: tasksData, error: taskError } = await supabase.from('tasks').select('*');
    if (taskError) console.error('Error fetching tasks:', taskError);
    else tasks = tasksData || [];

    const { data: teamData, error: teamError } = await supabase.from('team_members').select('*');
    if (teamError) console.error('Error fetching team:', teamError);
    else teamMembers = teamData || [];

    const { data: projectsData, error: projectError } = await supabase.from('projects').select('*');
    if (projectError) console.error('Error fetching projects:', projectError);
    else projects = projectsData || [];

    rerenderAll();
};

const handleRealtimeUpdate = (table, payload) => {
    console.log(`Realtime update on ${table}:`, payload);
    const { eventType, new: newRecord, old: oldRecord } = payload;
    let collection;

    if (table === 'tasks') collection = tasks;
    if (table === 'team_members') collection = teamMembers;
    if (table === 'projects') collection = projects;

    if (eventType === 'INSERT') {
        collection.push(newRecord);
    } else if (eventType === 'UPDATE') {
        const index = collection.findIndex(item => item.id === newRecord.id);
        if (index !== -1) collection[index] = newRecord;
    } else if (eventType === 'DELETE') {
        const index = collection.findIndex(item => item.id === oldRecord.id);
        if (index !== -1) collection.splice(index, 1);
    }

    // Update local references
    if (table === 'tasks') tasks = collection;
    if (table === 'team_members') teamMembers = collection;
    if (table === 'projects') projects = collection;

    rerenderAll();
};

// --- FILTERING & SORTING LOGIC ---
const getFilteredTasks = () => {
    return tasks.filter(task => {
        const searchMatch = task.description.toLowerCase().includes(currentFilters.search.toLowerCase()) ||
            (task.project && task.project.toLowerCase().includes(currentFilters.search.toLowerCase())) ||
            task.owner.toLowerCase().includes(currentFilters.search.toLowerCase());
        const ownerMatch = currentFilters.owner === 'all' || task.owner === currentFilters.owner;
        const statusMatch = currentFilters.status === 'all' || (currentFilters.status === 'Overdue' ? isOverdue(task) : (task.status === currentFilters.status && !isOverdue(task)));
        const projectMatch = currentFilters.project === 'all' || task.project === currentFilters.project;
        const priorityMatch = currentFilters.priority === 'all' || task.priority === currentFilters.priority;

        const taskDate = new Date(task.assigned_date + 'T00:00:00');
        const startDate = currentFilters.dateStart ? new Date(currentFilters.dateStart + 'T00:00:00') : null;
        const endDate = currentFilters.dateEnd ? new Date(currentFilters.dateEnd + 'T00:00:00') : null;
        const dateMatch = (!startDate || taskDate >= startDate) && (!endDate || taskDate <= endDate);

        return searchMatch && ownerMatch && statusMatch && dateMatch && projectMatch && priorityMatch;
    });
};

const sortTasks = (filteredTasks) => {
    filteredTasks.sort((a, b) => {
        let valA = a[currentSort.key];
        let valB = b[currentSort.key];

        if (currentSort.key === 'promise_date' || currentSort.key === 'assigned_date') {
            valA = new Date(valA);
            valB = new Date(valB);
        }

        if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
        return 0;
    });
    return filteredTasks;
};

// --- RENDER FUNCTION ---
const rerenderAll = () => {
    UI.populateDropdowns(teamMembers, projects, currentFilters);

    let filteredTasks = getFilteredTasks();

    const relevantTasks = filteredTasks; // For summary cards
    const totalTasks = relevantTasks.length;
    const pendingTasks = relevantTasks.filter(t => t.status === 'Pending' && !isOverdue(t)).length;
    const inProgressTasks = relevantTasks.filter(t => t.status === 'In Progress' && !isOverdue(t)).length;
    const overdueTasks = relevantTasks.filter(isOverdue).length;

    UI.renderSummaryCards(totalTasks, pendingTasks, inProgressTasks, overdueTasks);

    filteredTasks = sortTasks(filteredTasks);
    UI.renderTasks(filteredTasks, currentSort, attachActionListeners, updateSortIcons);
    UI.renderTeamMembers(teamMembers, deleteTeamMember);
    UI.renderProjects(projects, deleteProject);
    UI.renderCharts(filteredTasks, statusChart, priorityChart, ownerChart);
    UI.renderCalendar(filteredTasks, calendar);
    UI.renderProjectView(filteredTasks);
};

const updateSortIcons = () => {
    document.querySelectorAll('.sortable .sort-icon').forEach(i => i.textContent = '');
    const activeIcon = document.querySelector(`.sortable[data-sort="${currentSort.key}"] .sort-icon`);
    if (activeIcon) activeIcon.textContent = currentSort.order === 'asc' ? ' ▲' : ' ▼';
};

// --- ACTIONS ---
const deleteTask = async (id) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) alert('Error deleting task: ' + error.message);
};

const deleteTeamMember = async (id) => {
    if (!confirm('Are you sure?')) return;
    const { error } = await supabase.from('team_members').delete().eq('id', id);
    if (error) alert('Error deleting member: ' + error.message);
};

const deleteProject = async (id) => {
    if (!confirm('Are you sure?')) return;
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) alert('Error deleting project: ' + error.message);
};

const addTeamMember = async (name, designation) => {
    if (!currentDepartment) return;
    const { error } = await supabase.from('team_members').insert([{ name, designation, department_id: currentDepartment.id }]);
    if (error) alert('Error adding member: ' + error.message);
};

const addProject = async (name) => {
    if (!currentDepartment) return;
    const { error } = await supabase.from('projects').insert([{ name, department_id: currentDepartment.id }]);
    if (error) alert('Error adding project: ' + error.message);
};

const attachActionListeners = () => {
    document.querySelectorAll('.delete-btn').forEach(b => b.onclick = e => deleteTask(e.currentTarget.dataset.id));
    document.querySelectorAll('.edit-btn').forEach(b => b.onclick = e => openEditModal(e.currentTarget.dataset.id));
};

// --- MODAL & FORM HANDLERS ---
const openAddTaskModal = () => {
    taskForm.reset();
    const promiseDateInput = document.getElementById('promise-date');
    const today = new Date();
    today.setDate(today.getDate() + 2);
    promiseDateInput.value = formatDate(today);
    modalTitle.textContent = 'Add New Task';
    modalSubmitBtn.textContent = 'Add Task';
    document.getElementById('task-id').value = '';
    ownerSelect.multiple = true;
    ownerSelect.classList.add('h-24');
    ownerHelperText.classList.remove('hidden');
    taskModal.classList.remove('hidden');
};

const openEditModal = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    ownerSelect.multiple = false;
    ownerSelect.classList.remove('h-24');
    ownerHelperText.classList.add('hidden');
    modalTitle.textContent = 'Edit Task';
    modalSubmitBtn.textContent = 'Save Changes';
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-project').value = task.project || '';
    document.getElementById('task-description').value = task.description;
    document.getElementById('task-owner').value = task.owner;
    document.getElementById('task-priority').value = task.priority || 'Medium';
    document.getElementById('promise-date').value = task.promise_date;
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-comments').value = task.comments || '';
    taskModal.classList.remove('hidden');
};

taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = e.target['task-id'].value;
    const project = e.target['task-project'].value.trim();
    const description = e.target['task-description'].value.trim();
    const priority = e.target['task-priority'].value;
    const promiseDate = e.target['promise-date'].value;
    const status = e.target['task-status'].value;
    const comments = e.target['task-comments'].value.trim();

    if (id) {
        // Edit mode
        const owner = ownerSelect.value;
        if (!description || !owner || !promiseDate) return;

        const taskData = tasks.find(t => t.id === id);
        const wasDone = taskData.status === 'Done';
        const completedDate = status === 'Done' && !wasDone ? new Date().toISOString().split('T')[0] : (status !== 'Done' && wasDone ? null : taskData.completed_date);

        const { error } = await supabase.from('tasks').update({
            project, description, owner, priority,
            promise_date: promiseDate,
            status, comments,
            completed_date: completedDate
        }).eq('id', id);

        if (error) alert(error.message);

    } else {
        // Add mode (possibly multiple owners)
        const selectedOwners = Array.from(ownerSelect.selectedOptions).map(opt => opt.value);
        if (!description || selectedOwners.length === 0 || !promiseDate) return;

        const assignedDate = new Date().toISOString().split('T')[0];
        const rows = selectedOwners.map(owner => ({
            department_id: currentDepartment.id,
            project, description, owner, priority,
            assigned_date: assignedDate,
            promise_date: promiseDate,
            status, comments,
            completed_date: status === 'Done' ? assignedDate : null
        }));

        const { error } = await supabase.from('tasks').insert(rows);
        if (error) alert(error.message);
    }
    taskModal.classList.add('hidden');
});

teamForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = e.target['member-name'].value.trim();
    const designation = e.target['member-designation'].value.trim();
    if (name && designation) addTeamMember(name, designation);
    e.target.reset();
});

projectForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = e.target['project-name'].value.trim();
    if (name) addProject(name);
    e.target.reset();
});

// --- AUTH EVENT LISTENERS ---
if (authForm) authForm.addEventListener('submit', handleAuth);
if (toggleAuthModeBtn) toggleAuthModeBtn.addEventListener('click', toggleAuthMode);
if (btnModeJoin) btnModeJoin.addEventListener('click', () => setSignupType('join'));
if (btnModeCreate) btnModeCreate.addEventListener('click', () => setSignupType('create'));
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

Auth.onAuthStateChange((event, session) => {
    checkSession();
});

// --- GENERAL EVENT LISTENERS ---
searchInput.addEventListener('input', e => { currentFilters.search = e.target.value; rerenderAll(); });
filterOwner.addEventListener('change', e => { currentFilters.owner = e.target.value; rerenderAll(); });
filterStatus.addEventListener('change', e => { currentFilters.status = e.target.value; rerenderAll(); });
filterProject.addEventListener('change', e => { currentFilters.project = e.target.value; rerenderAll(); });
filterPriority.addEventListener('change', e => { currentFilters.priority = e.target.value; rerenderAll(); });

const setupDateInput = (input) => {
    input.addEventListener('change', (e) => {
        const dateVal = e.target.value;
        const label = e.target.nextElementSibling;
        if (label) label.style.display = dateVal ? 'none' : 'block';
        e.target.classList.toggle('text-gray-900', !!dateVal);
        if (e.target.id === 'filter-date-start') currentFilters.dateStart = dateVal || null;
        else if (e.target.id === 'filter-date-end') currentFilters.dateEnd = dateVal || null;
        rerenderAll();
    });
};
setupDateInput(filterDateStart);
setupDateInput(filterDateEnd);

document.querySelectorAll('.sortable').forEach(header => {
    header.addEventListener('click', () => {
        const sortKey = header.dataset.sort;
        // Transform camelCase keys to snake_case for Supabase compatibility in frontend state
        let mappedKey = sortKey;
        if (sortKey === 'promiseDate') mappedKey = 'promise_date';
        if (sortKey === 'assignedDate') mappedKey = 'assigned_date';

        if (currentSort.key === mappedKey) {
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.key = mappedKey;
            currentSort.order = 'asc';
        }
        rerenderAll();
    });
});

// Tab Event Listeners
const tabList = document.getElementById('tab-list');
const tabDashboard = document.getElementById('tab-dashboard');
const tabCalendar = document.getElementById('tab-calendar');
const tabProjectView = document.getElementById('tab-project-view');
const tabPanelList = document.getElementById('tab-panel-list');
const tabPanelDashboard = document.getElementById('tab-panel-dashboard');
const tabPanelCalendar = document.getElementById('tab-panel-calendar');
const tabPanelProjectView = document.getElementById('tab-panel-project-view');

const switchTab = (activeTab) => {
    const tabs = { list: tabList, dashboard: tabDashboard, calendar: tabCalendar, projectView: tabProjectView };
    const panels = { list: tabPanelList, dashboard: tabPanelDashboard, calendar: tabPanelCalendar, projectView: tabPanelProjectView };
    Object.keys(tabs).forEach(key => {
        const isActive = key === activeTab;
        tabs[key].classList.toggle('active', isActive);
        panels[key].classList.toggle('hidden', !isActive);
    });
    if (activeTab === 'calendar' && calendar.current) calendar.current.render();
};

tabList.addEventListener('click', () => switchTab('list'));
tabDashboard.addEventListener('click', () => switchTab('dashboard'));
tabCalendar.addEventListener('click', () => switchTab('calendar'));
tabProjectView.addEventListener('click', () => switchTab('projectView'));

// Modal listeners
const openTaskModalBtn = document.getElementById('open-add-task-modal-btn');
const closeTaskModalBtn = document.getElementById('close-task-modal-btn');
const manageTeamBtn = document.getElementById('manage-team-btn');
const closeTeamModalBtn = document.getElementById('close-team-modal-btn');
const manageProjectBtn = document.getElementById('manage-project-btn');
const closeProjectModalBtn = document.getElementById('close-project-modal-btn');

openTaskModalBtn.addEventListener('click', openAddTaskModal);
closeTaskModalBtn.addEventListener('click', () => taskModal.classList.add('hidden'));
taskModal.addEventListener('click', (e) => { if (e.target === taskModal) taskModal.classList.add('hidden'); });

manageTeamBtn.addEventListener('click', () => teamModal.classList.remove('hidden'));
closeTeamModalBtn.addEventListener('click', () => teamModal.classList.add('hidden'));
teamModal.addEventListener('click', (e) => { if (e.target === teamModal) teamModal.classList.add('hidden'); });

manageProjectBtn.addEventListener('click', () => projectModal.classList.remove('hidden'));
closeProjectModalBtn.addEventListener('click', () => projectModal.classList.add('hidden'));
projectModal.addEventListener('click', (e) => { if (e.target === projectModal) projectModal.classList.add('hidden'); });

// Initialize
const setDefaultDateFilters = () => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startDate = formatDate(firstDayOfMonth);
    const endDate = formatDate(lastDayOfMonth);
    filterDateStart.value = startDate;
    filterDateEnd.value = endDate;
    currentFilters.dateStart = startDate;
    currentFilters.dateEnd = endDate;
    if (filterDateStart.nextElementSibling) filterDateStart.nextElementSibling.style.display = 'none';
    filterDateStart.classList.add('text-gray-900');
    if (filterDateEnd.nextElementSibling) filterDateEnd.nextElementSibling.style.display = 'none';
    filterDateEnd.classList.add('text-gray-900');
};

const initializeCalendar = () => {
    calendar.current = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek,listWeek' },
        events: [],
        height: 'auto',
        views: { dayGridMonth: { dayMaxEvents: true }, dayGridWeek: { dayMaxEvents: false } },
        viewDidMount: function (info) {
            if (info.view.type === 'dayGridWeek') {
                calendarEl.classList.add('week-view-active');
            } else {
                calendarEl.classList.remove('week-view-active');
            }
        },
        eventClick: function (info) {
            const taskId = info.event.extendedProps.task.id;
            openEditModal(taskId);
        },
        eventDidMount: function (info) {
            const task = info.event.extendedProps.task;
            if (!task) return;
            const promiseDiff = calculatePromiseDifference(task);
            tippy(info.el, {
                content: `<div class="text-left p-1"><p class="font-bold mb-1">${info.event.title}</p><p class="text-xs"><span class="font-semibold">Assigned:</span> ${task.assigned_date}</p><p class="text-xs"><span class="font-semibold">Promise:</span> ${task.promise_date}</p><p class="text-xs"><span class="font-semibold">Duration:</span> ${promiseDiff}</p></div>`,
                allowHTML: true,
                theme: 'light',
            });
        }
    });
    calendar.current.render();
};

setDefaultDateFilters();
initializeCalendar();
switchTab('list');
checkSession();
