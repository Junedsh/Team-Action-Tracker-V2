import supabase from './supabaseClient.js';
import * as Auth from './auth.js';
import * as UI from './ui.js';
import { formatDate, getStatusColors, getPriorityColors, calculatePromiseDifference } from './utils.js';

// --- STATE ---
let currentUser = null;
let currentDepartment = null; // The ACTIVE department
let myTeams = []; // List of all teams the user belongs to

let tasks = [];
let teamMembers = [];
let projects = [];

// Filters
let currentFilters = { status: 'All', priority: 'All', owner: 'All', project: 'All', search: '' };
let currentView = 'list'; // 'list', 'kanban', 'calendar', 'projects'

// --- DOM ELEMENTS ---
// Auth
const authOverlay = document.getElementById('auth-overlay');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authErrorBox = document.getElementById('auth-error');
const toggleAuthModeBtn = document.getElementById('toggle-auth-mode-btn');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');

// Signup Specifics
const signupFields = document.getElementById('signup-fields');
const authName = document.getElementById('auth-name');
const signupType = document.getElementById('signup-type'); // Hidden input
const startButtons = document.getElementById('start-buttons'); // Container for Join/Create buttons
const btnModeJoin = document.getElementById('btn-mode-join');
const btnModeCreate = document.getElementById('btn-mode-create');
const fieldTeamCode = document.getElementById('field-team-code');
const fieldTeamName = document.getElementById('field-team-name');
const authTeamCode = document.getElementById('auth-team-code');
const authTeamName = document.getElementById('auth-team-name');

// Header & Navigation
const userDisplay = document.getElementById('user-display');
const userNameDisplay = document.getElementById('user-name-display');
const currentTeamDisplay = document.getElementById('current-team-display');
const teamMenuBtn = document.getElementById('team-menu-btn');
const teamDropdown = document.getElementById('team-dropdown');
const teamListContainer = document.getElementById('team-list-container');
const btnCreateAnotherTeam = document.getElementById('btn-create-another-team');
const logoutBtn = document.getElementById('logout-btn');

const mainContent = document.getElementById('main-content');
const tabButtons = document.querySelectorAll('.nav-btn');

// Task Modal
const addTaskBtn = document.getElementById('add-task-btn');
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const cancelTaskBtn = document.getElementById('cancel-task-btn');
const modalTitle = document.getElementById('modal-title');

// Settings Forms
const teamForm = document.getElementById('team-form');
const projectForm = document.getElementById('project-form');

// Filters
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const filterPriority = document.getElementById('filter-priority');
const filterOwner = document.getElementById('filter-owner'); // Dynamic
const filterProject = document.getElementById('filter-project'); // Dynamic

// --- AUTH LOGIC (V3 MULTI-TEAM) ---

let isSignUpMode = false;

const toggleAuthMode = () => {
    isSignUpMode = !isSignUpMode;
    authErrorBox.classList.add('hidden');

    if (isSignUpMode) {
        authTitle.textContent = "Join or create a team";
        authSubtitle.textContent = "Get started with Action Tracker V3";
        authSubmitBtn.textContent = "Sign Up";
        toggleAuthModeBtn.textContent = "Already have an account? Sign In";
        signupFields.classList.remove('hidden');
        setSignupType('join'); // Default
    } else {
        authTitle.textContent = "Welcome Back";
        authSubtitle.textContent = "Sign in to access your dashboard";
        authSubmitBtn.textContent = "Sign In";
        toggleAuthModeBtn.textContent = "Need an account? Sign Up";
        signupFields.classList.add('hidden');
    }
};

const setSignupType = (type) => {
    signupType.value = type;
    // Reset styles
    btnModeJoin.className = "flex-1 py-2 text-sm font-medium border rounded transition bg-white text-gray-600 border-gray-200 hover:bg-gray-50";
    btnModeCreate.className = "flex-1 py-2 text-sm font-medium border rounded transition bg-white text-gray-600 border-gray-200 hover:bg-gray-50";

    if (type === 'join') {
        btnModeJoin.className = "flex-1 py-2 text-sm font-medium border rounded transition bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm";
        fieldTeamCode.classList.remove('hidden');
        fieldTeamName.classList.add('hidden');
    } else {
        btnModeCreate.className = "flex-1 py-2 text-sm font-medium border rounded transition bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm";
        fieldTeamName.classList.remove('hidden');
        fieldTeamCode.classList.add('hidden');
    }
};

// Open the Modal specifically for Adding a NEW team while logged in
const openAddTeamModal = () => {
    authOverlay.classList.remove('hidden');
    // Force into Signup->Create/Join Mode but hide email/pass since we are auth'd
    isSignUpMode = true;
    authTitle.textContent = "Add Another Team";
    authSubtitle.textContent = "Join an existing team or create a new one.";
    authSubmitBtn.textContent = "Join / Create";
    signupFields.classList.remove('hidden');

    // Hide Auth Credentials
    authEmail.parentElement.style.display = 'none';
    authPassword.parentElement.style.display = 'none';
    toggleAuthModeBtn.style.display = 'none';

    setSignupType('join');
};

const handleAuth = async (e) => {
    e.preventDefault();
    authErrorBox.classList.add('hidden');

    const email = authEmail.value;
    const password = authPassword.value;

    try {
        let userForSetup = currentUser; // Use existing user if logged in

        if (isSignUpMode || currentUser) {
            // Validate V2 Fields
            const fullName = authName.value.trim();
            // Name required only if we don't have a profile yet (checking visibility is a proxy)
            if (!currentUser && !fullName) throw new Error("Full Name is required.");

            if (signupType.value === 'join' && !authTeamCode.value.trim()) throw new Error("Team Code is required.");
            if (signupType.value === 'create' && !authTeamName.value.trim()) throw new Error("Team Name is required.");

            // 1. Sign Up User (Only if not already logged in)
            if (!userForSetup) {
                const { data: { user }, error: signUpError } = await Auth.signUp(email, password);
                if (signUpError) throw signUpError;
                if (!user) throw new Error("Signup failed.");
                userForSetup = user;

                // Create Base Profile
                const { error: profileError } = await supabase.from('profiles').upsert([
                    { id: user.id, full_name: fullName }
                ]);
                if (profileError) throw profileError;
            }

            // 2. Handle Team Membership Logic (Junction Table)
            if (signupType.value === 'create') {
                // Create Department
                const deptName = authTeamName.value.trim();
                const accessCode = deptName.substring(0, 3).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

                const { data: dept, error: deptError } = await supabase.from('departments').insert([
                    { name: deptName, access_code: accessCode }
                ]).select().single();

                if (deptError) throw deptError;

                // Add to Department Members (Admin)
                const { error: joinError } = await supabase.from('department_members').insert([
                    { user_id: userForSetup.id, department_id: dept.id, role: 'Admin' }
                ]);
                if (joinError) throw joinError;

                alert(`Team Created! Your Code is: ${accessCode}\nShare this with your team.`);
                setActiveTeam(dept.id); // Set as active

            } else {
                // Join Team
                const code = authTeamCode.value.trim().toUpperCase();

                // Find Dept
                const { data: dept, error: findError } = await supabase.from('departments').select('id, name')
                    .eq('access_code', code).single();

                if (findError || !dept) throw new Error("Invalid Team Code.");

                // Check if already member
                const { data: existing } = await supabase.from('department_members')
                    .select('id').eq('user_id', userForSetup.id).eq('department_id', dept.id).single();

                if (existing) throw new Error("You are already in this team!");

                // Add to Department Members (Member)
                const { error: joinError } = await supabase.from('department_members').insert([
                    { user_id: userForSetup.id, department_id: dept.id, role: 'Member' }
                ]);
                if (joinError) throw joinError;

                alert(`Joined team: ${dept.name}`);
                setActiveTeam(dept.id);
            }

            // Cleanup
            authEmail.parentElement.style.display = 'block';
            authPassword.parentElement.style.display = 'block';
            toggleAuthModeBtn.style.display = 'block';
            isSignUpMode = false;

            await checkSession();

        } else {
            // Sign In
            const { error } = await Auth.signIn(email, password);
            if (error) throw error;
        }

    } catch (err) {
        console.error(err);
        authErrorBox.textContent = err.message;
        authErrorBox.classList.remove('hidden');
    }
};

const handleLogout = async () => {
    localStorage.removeItem('active_department_id');
    await Auth.signOut();
    window.location.reload();
};

const setActiveTeam = (deptId) => {
    localStorage.setItem('active_department_id', deptId);
    // Reload state with new active team
    const team = myTeams.find(t => t.department_id === deptId);
    if (team) {
        currentDepartment = { id: team.department_id, name: team.departments.name, access_code: team.departments.access_code };
        currentTeamDisplay.textContent = currentDepartment.name;
        // Fetch new data
        fetchData();
        // Close dropdown
        teamDropdown.classList.add('hidden');
    }
};

const updateAuthUI = async (user) => {
    if (user) {
        currentUser = user;

        // 1. Fetch Profile
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (!profile) {
            // Zombie User Fix
            console.log("No profile found, triggering setup");
            openAddTeamModal();
            authTitle.textContent = "Complete Profile";
            authEmail.value = user.email;
            authEmail.readOnly = true;
            return;
        }

        // 2. Fetch Teams (Memberships)
        const { data: teams, error } = await supabase.from('department_members')
            .select('department_id, role, departments(name, access_code)')
            .eq('user_id', user.id);

        myTeams = teams || [];

        if (myTeams.length === 0) {
            // Valid User, No Teams -> Force Add Team
            openAddTeamModal();
            return;
        }

        // 3. Determine Active Team
        const lastActiveId = localStorage.getItem('active_department_id');
        let activeTeam = myTeams.find(t => t.department_id === lastActiveId);

        // Default to first if not found
        if (!activeTeam) activeTeam = myTeams[0];

        // Set Active
        currentDepartment = {
            id: activeTeam.department_id,
            name: activeTeam.departments.name,
            access_code: activeTeam.departments.access_code
        };

        // Render UI
        authOverlay.classList.add('hidden');
        mainContent.classList.remove('blur-sm', 'pointer-events-none');
        userDisplay.classList.remove('hidden');

        userNameDisplay.textContent = profile.full_name;
        currentTeamDisplay.textContent = currentDepartment.name;

        // Render Dropdown
        teamListContainer.innerHTML = myTeams.map(t => `
            <button onclick="window.switchTeam('${t.department_id}')" class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex justify-between items-center">
                <span>${t.departments.name}</span>
                ${t.department_id === currentDepartment.id ? '<span class="text-green-500 font-bold">✓</span>' : ''}
            </button>
        `).join('');

        fetchData();

    } else {
        authOverlay.classList.remove('hidden');
        mainContent.classList.add('blur-sm', 'pointer-events-none');
        userDisplay.classList.add('hidden');
    }
};

// Expose switch function to window for HTML click handlers
window.switchTeam = (id) => setActiveTeam(id);


// --- PREVIOUS FETCH LOGIC (Updated filters to use department_id) ---

const fetchData = async () => {
    if (!currentDepartment) return;

    // 1. Fetch Tasks
    const { data: tData, error: tError } = await supabase.from('tasks')
        .select('*').eq('department_id', currentDepartment.id);
    if (tError) { console.error(tError); return; }
    tasks = tData;

    // 2. Fetch Team
    const { data: mData } = await supabase.from('team_members')
        .select('*').eq('department_id', currentDepartment.id);
    teamMembers = mData || [];

    // 3. Fetch Projects
    const { data: pData } = await supabase.from('projects')
        .select('*').eq('department_id', currentDepartment.id);
    projects = pData || [];

    rerenderAll();
};

const rerenderAll = () => {
    // Populate Filters
    const owners = [...new Set(teamMembers.map(m => m.name))];
    const projNames = [...new Set(projects.map(p => p.name))];
    UI.populateSelect(filterOwner, owners, "All Owners", currentFilters.owner);
    UI.populateSelect(filterProject, projNames, "All Projects", currentFilters.project);

    // Filter Data
    let filtered = tasks.filter(t => {
        return (currentFilters.status === 'All' || t.status === currentFilters.status) &&
            (currentFilters.priority === 'All' || t.priority === currentFilters.priority) &&
            (currentFilters.owner === 'All' || t.owner === currentFilters.owner) &&
            (currentFilters.project === 'All' || t.project === currentFilters.project) &&
            (currentFilters.search === '' || t.description.toLowerCase().includes(currentFilters.search.toLowerCase()) || (t.owner && t.owner.toLowerCase().includes(currentFilters.search.toLowerCase())));
    });

    UI.renderSummaryCards(filtered);

    if (currentView === 'list') UI.renderTaskList(filtered, tasks, openEditModal); // tasks passed for global stats if needed
    if (currentView === 'kanban') UI.renderKanbanBoard(filtered, tasks, openEditModal);
    if (currentView === 'projects') UI.renderProjectView(projects, tasks);
};

// ... (Keep existing UI helper functions like switchTab, openEditModal unchanged mostly, just ensure Add calls use currentDepartment) ...

const addTeamMember = async (name, emailRaw, designation) => {
    if (!currentDepartment) return;
    const email = emailRaw ? emailRaw : null;
    const { error } = await supabase.from('team_members').insert([
        { department_id: currentDepartment.id, name, email, designation }
    ]);
    if (error) alert(error.message);
    else fetchData();
};

const addProject = async (name) => {
    if (!currentDepartment) return;
    const { error } = await supabase.from('projects').insert([
        { department_id: currentDepartment.id, name }
    ]);
    if (error) alert(error.message);
    else fetchData();
};

const addTask = async (e) => {
    e.preventDefault();
    const formData = new FormData(taskForm);
    const description = formData.get('task-desc');
    const project = formData.get('task-project');
    const priority = formData.get('task-priority');
    const assignedDate = formData.get('task-assigned-date');
    const promiseDate = formData.get('task-promise-date');
    const status = formData.get('task-status');
    const comments = formData.get('task-comments');

    // Multi-select owners
    const selectedOwners = Array.from(document.getElementById('task-owner').selectedOptions).map(opt => opt.value);

    // Edit Mode or Create
    const taskId = taskForm.dataset.editingId;

    if (taskId) {
        // Update
        const updates = {
            description, project,
            owner: selectedOwners.join(', '), // Simple join for now
            priority, assigned_date: assignedDate, promise_date: promiseDate, status, comments,
            completed_date: status === 'Done' ? new Date().toISOString() : null
        };
        const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
        if (error) alert(error.message);

    } else {
        // Create (Handle multiple owners -> multiple tasks)
        const rows = selectedOwners.map(owner => ({
            department_id: currentDepartment.id,
            description, project, owner, priority,
            assigned_date: assignedDate, promise_date: promiseDate, status, comments,
            completed_date: status === 'Done' ? assignedDate : null
        }));

        const { error } = await supabase.from('tasks').insert(rows);
        if (error) alert(error.message);
    }
    taskModal.classList.add('hidden');
    fetchData(); // Triggers Re-render
};


// --- INITIALIZATION ---

const checkSession = async () => {
    const { data: { user } } = await Auth.getUser();
    updateAuthUI(user);
};

// Wiring Events
if (authForm) authForm.addEventListener('submit', handleAuth);
if (toggleAuthModeBtn) toggleAuthModeBtn.addEventListener('click', toggleAuthMode);
if (btnModeJoin) btnModeJoin.addEventListener('click', () => setSignupType('join'));
if (btnModeCreate) btnModeCreate.addEventListener('click', () => setSignupType('create'));
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
if (btnCreateAnotherTeam) btnCreateAnotherTeam.addEventListener('click', () => {
    teamDropdown.classList.add('hidden'); // close menu
    openAddTeamModal();
});
if (teamMenuBtn) teamMenuBtn.addEventListener('click', () => teamDropdown.classList.toggle('hidden'));

// Close dropdown if clicking outside
document.addEventListener('click', (e) => {
    if (!teamMenuBtn.contains(e.target) && !teamDropdown.contains(e.target)) {
        teamDropdown.classList.add('hidden');
    }
});


// ... Rest of listeners from previous app.js ...
taskForm.addEventListener('submit', addTask);
cancelTaskBtn.addEventListener('click', () => taskModal.classList.add('hidden'));
addTaskBtn.addEventListener('click', () => {
    taskForm.reset();
    delete taskForm.dataset.editingId;
    modalTitle.textContent = "New Task";

    // Populate Modal Selects
    const owners = [...new Set(teamMembers.map(m => m.name))];
    const projNames = [...new Set(projects.map(p => p.name))];
    UI.populateSelect(document.getElementById('task-owner'), owners, null); // Multi-select
    UI.populateSelect(document.getElementById('task-project'), projNames, "No Project");

    taskModal.classList.remove('hidden');
});

// Settings forms
teamForm.addEventListener('submit', e => {
    e.preventDefault();
    addTeamMember(e.target['member-name'].value, e.target['member-email'].value, e.target['member-designation'].value);
    e.target.reset();
});
projectForm.addEventListener('submit', e => {
    e.preventDefault();
    addProject(e.target['project-name'].value);
    e.target.reset();
});

// View Switching
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('border-indigo-600', 'text-indigo-600'));
        btn.classList.add('border-indigo-600', 'text-indigo-600');
        currentView = btn.dataset.view;
        rerenderAll();
    });
});
const openEditModal = (task) => {
    taskForm.dataset.editingId = task.id;
    modalTitle.textContent = "Edit Task";

    document.getElementById('task-desc').value = task.description;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-assigned-date').value = task.assigned_date;
    document.getElementById('task-promise-date').value = task.promise_date || '';
    document.getElementById('task-comments').value = task.comments || '';

    // Project & Owner selects need current data
    const owners = [...new Set(teamMembers.map(m => m.name))];
    const projNames = [...new Set(projects.map(p => p.name))];
    UI.populateSelect(document.getElementById('task-owner'), owners, null);
    UI.populateSelect(document.getElementById('task-project'), projNames, "No Project");

    document.getElementById('task-project').value = task.project || "No Project";

    // Handle Multi-Owner select
    const taskOwnerSelect = document.getElementById('task-owner');
    Array.from(taskOwnerSelect.options).forEach(opt => opt.selected = false);
    if (task.owner) {
        const currentOwners = task.owner.split(', ');
        Array.from(taskOwnerSelect.options).forEach(opt => {
            if (currentOwners.includes(opt.value)) opt.selected = true;
        });
    }

    taskModal.classList.remove('hidden');
};


// Start
checkSession();
UI.initializeCalendar(() => tasks); // Pass getter
