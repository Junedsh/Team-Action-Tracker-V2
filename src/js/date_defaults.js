
// Default Date Filters to Current Month
const setDefaultDates = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    // Format YYYY-MM-DD
    const formatDateInput = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const startDateInput = document.getElementById('filter-date-start');
    const endDateInput = document.getElementById('filter-date-end');

    if (startDateInput) startDateInput.value = formatDateInput(firstDay);
    if (endDateInput) endDateInput.value = formatDateInput(today);
};

// Call on init
setDefaultDates();
