
import {
    formatDate,
    isOverdue,
    getStatusColors,
    getPriorityColors,
    calculateDaysTaken,
    calculatePromiseDifference
} from './utils.js';

// DOM Elements
const taskTableBody = document.getElementById('task-table-body');
const summaryCardsContainer = document.getElementById('summary-cards');
const filterProject = document.getElementById('filter-project');
const filterOwner = document.getElementById('filter-owner');
const ownerSelect = document.getElementById('task-owner');
const teamListBody = document.getElementById('team-list-body');
const projectListBody = document.getElementById('project-list-body');

export const renderSummaryCards = (totalTasks, pendingTasks, inProgressTasks, overdueTasks) => {
    summaryCardsContainer.innerHTML = `
        <div class="bg-gray-100 p-4 rounded-lg text-center"><p class="text-2xl font-bold text-gray-800">${totalTasks}</p><p class="text-sm text-gray-500">Total Tasks</p></div>
        <div class="bg-yellow-100 p-4 rounded-lg text-center"><p class="text-2xl font-bold text-yellow-800">${pendingTasks}</p><p class="text-sm text-yellow-600">Pending</p></div>
        <div class="bg-blue-100 p-4 rounded-lg text-center"><p class="text-2xl font-bold text-blue-800">${inProgressTasks}</p><p class="text-sm text-blue-600">In Progress</p></div>
        <div class="bg-red-100 p-4 rounded-lg text-center"><p class="text-2xl font-bold text-red-800">${overdueTasks}</p><p class="text-sm text-red-600">Overdue</p></div>`;
};

export const renderTasks = (tasks, currentSort, attachActionListeners, updateSortIcons) => {
    taskTableBody.innerHTML = '';
    if (tasks.length === 0) {
        taskTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-4">No tasks match the current filters.</td></tr>`;
        return;
    }
    tasks.forEach(task => {
        const { bg, text, label } = getStatusColors(task);
        const priorityColor = getPriorityColors(task.priority);
        const daysTaken = calculateDaysTaken(task);
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition-colors';
        const tooltipAttr = task.comments ? `data-tooltip-text="${task.comments.replace(/"/g, '&quot;')}"` : '';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 relative" ${tooltipAttr}>
                ${task.description}
                <div class="text-xs text-gray-500">${task.project || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${task.owner}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${priorityColor}">${task.priority || 'Medium'}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${task.assigned_date}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${task.promise_date}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">${daysTaken}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bg} ${text}">${label}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2 flex items-center">
                <button class="edit-btn text-indigo-600 hover:text-indigo-900" data-id="${task.id}">Edit</button>
                <button class="delete-btn text-red-600 hover:text-red-900" data-id="${task.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h--3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" />
                    </svg>
                </button>
            </td>`;
        taskTableBody.appendChild(row);
    });
    attachActionListeners();
    updateSortIcons();
};
export const renderTaskList = renderTasks; // Alias

export const renderTeamMembers = (teamMembers, deleteTeamMember) => {
    teamListBody.innerHTML = '';
    teamMembers.sort((a, b) => a.name.localeCompare(b.name)).forEach(member => {
        teamListBody.innerHTML += `
            <tr>
                <td class="px-4 py-2 text-sm text-gray-800">${member.name}</td>
                <td class="px-4 py-2 text-sm text-gray-500">${member.designation}</td>
                <td class="px-4 py-2"><button class="delete-member-btn text-red-600 hover:text-red-900 text-sm" data-id="${member.id}">Delete</button></td>
            </tr>`;
    });
    document.querySelectorAll('.delete-member-btn').forEach(b => b.onclick = e => deleteTeamMember(e.currentTarget.dataset.id));
};

export const renderProjects = (projects, deleteProject) => {
    projectListBody.innerHTML = '';
    projects.sort((a, b) => a.name.localeCompare(b.name)).forEach(project => {
        projectListBody.innerHTML += `
            <tr>
                <td class="px-4 py-2 text-sm text-gray-800">${project.name}</td>
                <td class="px-4 py-2"><button class="delete-project-btn text-red-600 hover:text-red-900 text-sm" data-id="${project.id}">Delete</button></td>
            </tr>`;
    });
    document.querySelectorAll('.delete-project-btn').forEach(b => b.onclick = e => deleteProject(e.currentTarget.dataset.id));
};

export const populateDropdowns = (teamMembers, projects, currentFilters) => {
    // Projects
    const currentProjectFilterValue = filterProject.value;
    filterProject.innerHTML = '<option value="all">Filter by Project (All)</option>';
    projects.sort((a, b) => a.name.localeCompare(b.name)).forEach(project => {
        filterProject.innerHTML += `<option value="${project.name}">${project.name}</option>`;
    });
    filterProject.value = currentProjectFilterValue;

    const taskProjectSelect = document.getElementById('task-project');
    taskProjectSelect.innerHTML = '<option value="">-- Select a Project --</option>';
    projects.sort((a, b) => a.name.localeCompare(b.name)).forEach(project => {
        taskProjectSelect.innerHTML += `<option value="${project.name}">${project.name}</option>`;
    });

    // Owners
    const currentOwnerFilterValue = filterOwner.value;
    filterOwner.innerHTML = '<option value="all">Filter by Owner (All)</option>';
    ownerSelect.innerHTML = '';
    teamMembers.sort((a, b) => a.name.localeCompare(b.name)).forEach(member => {
        filterOwner.innerHTML += `<option value="${member.name}">${member.name}</option>`;
        ownerSelect.innerHTML += `<option value="${member.name}">${member.name}</option>`;
    });
    filterOwner.value = currentOwnerFilterValue;
    filterOwner.value = currentOwnerFilterValue;
};

// Alias for app.js compatibility
export const populateSelect = (selectElement, items, defaultText) => {
    // Since app.js calls this generically, we implement a simple version or redirect if specific
    // Note: app.js calls UI.populateSelect(element, array, default)
    selectElement.innerHTML = '';
    if (defaultText) {
        selectElement.innerHTML += `<option value="">${defaultText}</option>`;
    }
    items.forEach(item => {
        selectElement.innerHTML += `<option value="${item}">${item}</option>`;
    });
};

export const renderProjectView = (tasks) => {
    const container = document.getElementById('tab-panel-project-view');
    if (tasks.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-8">No tasks to display based on current filters.</p>`;
        return;
    }
    const tasksByProject = tasks.reduce((acc, task) => {
        const project = task.project || 'Uncategorized';
        const date = task.assigned_date;
        if (!acc[project]) acc[project] = {};
        if (!acc[project][date]) acc[project][date] = [];
        acc[project][date].push(task);
        return acc;
    }, {});

    let html = '<div class="space-y-8">';
    const sortedProjects = Object.keys(tasksByProject).sort();
    for (const project of sortedProjects) {
        html += `<div class="bg-gray-50 rounded-lg p-4 sm:p-6"><h3 class="text-lg font-bold text-indigo-700 mb-4 border-b border-gray-200 pb-2">${project}</h3><div class="space-y-4">`;
        const tasksByDate = tasksByProject[project];
        const sortedDates = Object.keys(tasksByDate).sort();
        for (const date of sortedDates) {
            html += `<div class="pl-2"><h4 class="font-semibold text-gray-700 mb-2">${new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h4>`;
            html += '<ul class="divide-y divide-gray-200 bg-white rounded-md shadow-sm">';
            tasksByDate[date].forEach(task => {
                const { bg, text, label } = getStatusColors(task);
                html += `
                    <li class="px-4 py-2 flex items-center justify-between hover:bg-gray-50 text-sm">
                        <div class="flex-grow truncate pr-4">
                            <span class="font-medium text-gray-900">${task.description}</span>
                            <span class="ml-2 text-gray-500 text-xs">(Owner: ${task.owner} &bull; Due: ${task.promise_date})</span>
                        </div>
                        <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${bg} ${text} flex-shrink-0">${label}</span>
                    </li>`;
            });
            html += '</ul></div>';
        }
        html += `</div></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
};

export const renderCharts = (tasks, statusChart, priorityChart, ownerChart) => {
    // Calculate stats
    const totalTasks = tasks.length;
    const statusCounts = { Pending: 0, 'In Progress': 0, Done: 0, Overdue: 0 };
    tasks.forEach(task => { if (isOverdue(task)) statusCounts.Overdue++; else statusCounts[task.status]++; });

    const priorityCounts = { Low: 0, Medium: 0, High: 0, Urgent: 0 };
    tasks.forEach(task => priorityCounts[task.priority || 'Medium']++);

    const ownerCounts = {};
    tasks.forEach(task => { ownerCounts[task.owner] = (ownerCounts[task.owner] || 0) + 1; });

    // Status Chart
    if (statusChart.current) statusChart.current.destroy();
    statusChart.current = new Chart(document.getElementById('statusChart'), {
        type: 'pie',
        data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#FBBF24', '#3B82F6', '#10B981', '#EF4444'] }] },
        options: { plugins: { datalabels: { formatter: (value) => { if (value === 0) return ''; let percentage = totalTasks > 0 ? (value / totalTasks * 100).toFixed(1) + '%' : '0.0%'; return `${value} (${percentage})`; }, color: '#fff', font: { weight: 'bold' } } } }
    });

    // Priority Chart
    if (priorityChart.current) priorityChart.current.destroy();
    priorityChart.current = new Chart(document.getElementById('priorityChart'), {
        type: 'pie',
        data: { labels: Object.keys(priorityCounts), datasets: [{ data: Object.values(priorityCounts), backgroundColor: ['#6B7280', '#3B82F6', '#F97316', '#EF4444'] }] },
        options: { plugins: { datalabels: { formatter: (value) => { if (value === 0) return ''; let percentage = totalTasks > 0 ? (value / totalTasks * 100).toFixed(1) + '%' : '0.0%'; return `${value} (${percentage})`; }, color: '#fff', font: { weight: 'bold' } } } }
    });

    // Owner Chart
    if (ownerChart.current) ownerChart.current.destroy();
    ownerChart.current = new Chart(document.getElementById('ownerChart'), {
        type: 'bar',
        data: { labels: Object.keys(ownerCounts), datasets: [{ label: 'Tasks', data: Object.values(ownerCounts), backgroundColor: '#3B82F6' }] },
        options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'top', font: { weight: 'bold' } } } }
    });
};

export const renderCalendar = (tasks, calendar) => {
    const events = tasks.map(task => ({
        id: task.id,
        title: `${task.owner}: ${task.description}`,
        start: task.promise_date,
        allDay: true,
        color: getStatusColors(task).calendarColor,
        extendedProps: { task: task }
    }));
    if (calendar.current) {
        calendar.current.removeAllEvents();
        calendar.current.addEventSource(events);
    }
};
