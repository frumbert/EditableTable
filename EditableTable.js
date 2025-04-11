/**
 * Editable Table Script
 * 
 * This script provides functionality for managing an editable table. It includes:
 * - Cell editing with keyboard and mouse interactions.
 * - Navigation between cells using arrow keys, (tab and shift-tab also supported).
 * - Tracking changes to rows and cells.
 * - Adding and deleting rows.
 * - Synchronizing changes with the server using efficient (changes only) payload.
 * - Reverting all changes to the original state.
 * - appropriate field types
 * - support for readonly cells
 * - unopinionated styles
 * 
 * Global Variables:
 * - `table`: The table element (`<table>`) id.
 * - `editingCell`: Tracks the currently editable cell.
 * - `originalValue`: Stores the original value of a cell before editing.
 * - `deletedRows`: A `Set` that tracks rows marked for deletion.
 * - `modifiedRows`: An object that tracks changes to rows, indexed by `rowId`.
 * - `originalData`: An object that stores the original values of rows for reverting changes.
 * - `text`: strings for various prompts/interface elements.
 *
 * Constructor options:
 * - `nextRowId`: Counter for generating unique IDs for new rows.
 * - `ajaxEndpoint`: endpoint for ajax postbacks during save.
 * - `saveButton`: Reference to the save button dom object.
 * - `revertButton`: Reference to the revert button dom object.
 * - `addRowButton`: Reference to the add button dom object.
 * - `keys`: array of column names for postback.
 * - `actionHeader`: text label for actions column.
 * - `source`: array of names of data sources for select columns.
 * - `colours`: object containing cell colours
 */

class EditableTable {
    constructor(tableId, options = {}) {
        this.table = document.getElementById(tableId);
        this.editingCell = null;
        this.originalValue = '';
        this.deletedRows = new Set();
        this.modifiedRows = {};
        this.originalData = {}; // To revert changes
        this.text = {
            delete: 'Are you sure you want to remove this row?', // delete confirmation
            saved: 'Changes synced!', // json success
            failed: 'Error syncing changes.', // json error 
            remove: '🗑' // delete button
        }

        // Options
        this.nextRowId = options.newRowIndex || 1000; // Arbitrary start for new rows
        this.ajaxEndpoint = options.ajaxEndpoint || '/your/api/update-rows'; // Default endpoint
        this.saveButton = options.saveButton || null;
        this.revertButton = options.revertButton || null;
        this.addRowButton = options.addRowButton || null;
        this.keys = options.keys || []; // Column keys for changes
        this.actionHeader = options.actionHeader || 'Actions';
        this.source = options.source || {}; // Data sources for select dropdowns
        this.colours = options.colours || {dirty:"#fff3cd7f !important", focus: "#4A90E2"}; // cell selection colours

        // Add delete button column to the table
        this.addDeleteColumn();

        // Extend styles
        this.addStyles();

        // ensure cells are editable
        this.enableEdit();

        // Initialize event listeners
        this.initEventListeners();
    }

    /**
     * Adds a delete button column to the table.
     */
    addDeleteColumn() {
        // Add a header cell for the delete column if the table has a <thead>
        const thead = this.table.querySelector('thead');
        if (thead) {
            const headerRow = thead.querySelector('tr');
            const deleteHeader = document.createElement('th');
            deleteHeader.textContent = this.actionHeader;
            headerRow.appendChild(deleteHeader);
        }

        // Add a delete button cell to each row in the <tbody>
        const tbody = this.table.querySelector('tbody');
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row) => {
            const deleteCell = document.createElement('td');
            deleteCell.setAttribute('readonly','');
            deleteCell.innerHTML = `<button class="delete-row">${this.text.remove}</button>`;
            row.appendChild(deleteCell);
        });
    }

    /**
     * Initializes event listeners for the table and external buttons.
     */
    initEventListeners() {
        // Table cell click listener
        this.table.addEventListener('click', (event) => {
            const target = event.target;

            // Handle delete button clicks
            if (target.tagName === 'BUTTON' && target.classList.contains('delete-row')) {
                this.deleteRow(target);
                return;
            }

            // Handle cell selection
            const cell = target.closest('td');
            if (cell && !cell.hasAttribute('readonly')) {
                this.selectCell(cell);
            }
        });

        // Table keyboard navigation and editing listener
        this.table.addEventListener('keydown', (event) => {
            const { key, shiftKey, target } = event;
            const cell = target.closest('td');

            if (!cell) return;

            if (this.editingCell) {
                // Handle keys during editing
                switch (key) {
                    case 'Enter':
                        if (shiftKey) {
                            this.insertLineBreak(this.editingCell);
                        } else {
                            this.saveEdit(this.editingCell);
                        }
                        event.preventDefault();
                        break;
                    case 'Escape':
                        this.cancelEdit(this.editingCell);
                        event.preventDefault();
                        break;
                }
            } else {
                // Handle keys for navigation and editing initiation
                switch (key) {
                    case 'Enter':
                        this.makeCellEditable(cell);
                        event.preventDefault();
                        break;
                    case 'ArrowUp':
                    case 'ArrowDown':
                    case 'ArrowLeft':
                    case 'ArrowRight':
                        this.navigateCells(cell, key);
                        event.preventDefault();
                        break;
                }
            }
        });

        // External button listeners
        this.saveButton?.addEventListener('click', () => this.sendUpdatedRows());
        this.revertButton?.addEventListener('click', () => this.revertAllChanges());
        this.addRowButton?.addEventListener('click', () => this.addRow());
    }

    /**
     * Highlights and focuses on a specific table cell.
     */
    selectCell(cell) {
        if (this.editingCell) return;
        const previouslySelected = this.table.querySelector('td[tabindex="0"][aria-selected="true"]');
        previouslySelected?.removeAttribute('aria-selected');
        cell.setAttribute('aria-selected', 'true');
        cell.focus();
    }

    /**
     * Converts a table cell into an editable state using the appropriate input control.
     * @param {HTMLElement} cell - The table cell (`<td>`) element to make editable.
     */
    makeCellEditable(cell) {
        if (this.editingCell) return;
        this.editingCell = cell;
        this.originalValue = cell.textContent.trim();

        // Determine the input type based on the `data-type` attribute
        const dataType = cell.dataset.type || 'text'; // Default to "text"
        let input;

        if (dataType === 'select') {
            // Create a <select> dropdown for select-type cells
            const sourceName = cell.dataset.sourceName;
            const source = this.source[sourceName] || [];
            input = document.createElement('select');

            // Populate the dropdown with options
            source.forEach(({ key, value }) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = value;
                if (value === this.originalValue) {
                    option.selected = true;
                }
                input.appendChild(option);
            });

            // Add an event listener to handle Enter key for saving
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    this.saveEdit(cell);
                    event.preventDefault();
                }
            });
        } else if (dataType === 'longtext') {
            // Use a <textarea> for longtext
            input = document.createElement('textarea');
            input.value = this.originalValue;
        } else {
            // Use an <input> for other types
            input = document.createElement('input');
            input.type = dataType; // Set the input type (e.g., text, number, date, etc.)
            input.value = this.originalValue;
        }

        // Replace cell content with the input control
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
    }

    /**
     * Cancels editing of a cell and restores its original value.
     * @param {HTMLElement} cell - The table cell (`<td>`) element being edited.
     */
    cancelEdit(cell) {
        cell.textContent = this.originalValue;
        this.editingCell = null;
        this.selectCell(cell);
    }

    /**
     * Inserts a line break (`\n`) into the `<textarea>` of an editable cell.
     * @param {HTMLElement} cell - The table cell (`<td>`) element containing the `<textarea>`.
     */
    insertLineBreak(cell) {
        const textarea = cell.querySelector('textarea');
        if (textarea) {
            textarea.value += '\n';
            textarea.scrollTop = textarea.scrollHeight;
        }
    }

    /**
     * Moves focus to a neighboring cell based on the arrow key direction.
     */
    navigateCells(currentCell, direction) {
        if (this.editingCell) return;
        const currentRow = currentCell.parentElement;
        let targetCell;

        switch (direction) {
            case 'ArrowUp':
                targetCell = currentRow.previousElementSibling?.cells[currentCell.cellIndex];
                break;
            case 'ArrowDown':
                targetCell = currentRow.nextElementSibling?.cells[currentCell.cellIndex];
                break;
            case 'ArrowLeft':
                targetCell = currentCell.previousElementSibling;
                break;
            case 'ArrowRight':
                targetCell = currentCell.nextElementSibling;
                break;
        }

        if (targetCell && !targetCell.classList.contains('hidden')) {
            this.selectCell(targetCell);
        }
    }

    /**
     * Saves the edited value of a cell and tracks changes.
     * @param {HTMLElement} cell - The table cell (`<td>`) element being edited.
     */
    saveEdit(cell) {
        const input = cell.querySelector('input, textarea, select');
        if (!input) return;

        const newValue = input.tagName === 'SELECT' ? input.options[input.selectedIndex].text : input.value.trim();
        const newKey = input.tagName === 'SELECT' ? input.value : null;
        const row = cell.parentElement;
        const rowId = row.dataset.rowId;
        const colIndex = cell.cellIndex;

        if (!this.originalData[rowId]) {
            // Save original row values on first edit
            const cells = row.querySelectorAll('td');
            this.originalData[rowId] = Array.from(cells).map(c => c.textContent.trim());
        }

        const originalValue = this.originalData[rowId][colIndex];
        cell.textContent = newValue; // Revert to plain text with the selected value
        this.editingCell = null;
        this.selectCell(cell);

        if (newValue !== originalValue) {
            cell.classList.add('dirty');
            if (!this.modifiedRows[rowId]) {
                this.modifiedRows[rowId] = { id: rowId, changes: {} };
            }

            // Use the key name if available, otherwise fallback to column index
            const key = this.keys[colIndex] || colIndex;
            this.modifiedRows[rowId].changes[key] = newKey || newValue;
        } else {
            // Clean if reverted to original
            cell.classList.remove('dirty');
            if (this.modifiedRows[rowId]) {
                const key = this.keys[colIndex] || colIndex;
                delete this.modifiedRows[rowId].changes[key];
                if (Object.keys(this.modifiedRows[rowId].changes).length === 0) {
                    delete this.modifiedRows[rowId];
                }
            }
        }
    }

    /**
     * Sends all modified and deleted rows to the server for synchronization.
     */
    sendUpdatedRows() {
        const updates = Object.values(this.modifiedRows);
        const deletions = Array.from(this.deletedRows);

        if (updates.length === 0 && deletions.length === 0) {
            alert('No changes to sync.');
            return;
        }

        fetch(this.ajaxEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates, deletions })
        })
            .then(res => res.json())
            .then(() => {
                alert(this.text.saved);
                // Clear state
                Object.keys(this.modifiedRows).forEach(k => delete this.modifiedRows[k]);
                Object.keys(this.originalData).forEach(k => delete this.originalData[k]);
                this.deletedRows.clear();
            })
            .catch(err => {
                console.error('Sync failed:', err);
                alert(this.text.failed);
            });
    }

    /**
     * Reverts all changes made to the table and restores the original data.
     */
    revertAllChanges() {
        for (const rowId in this.originalData) {
            const row = this.table.querySelector(`tr[data-row-id="${rowId}"]`);
            if (!row) continue;
            const cells = row.querySelectorAll('td:not([readonly])');
            this.originalData[rowId].forEach((val, i) => {
                cells[i].textContent = val;
                cells[i].classList.remove('dirty');
            });
        }
        Object.keys(this.modifiedRows).forEach(k => delete this.modifiedRows[k]);
        Object.keys(this.originalData).forEach(k => delete this.originalData[k]);
    }

    /**
     * Adds a new row to the table with editable cells.
     */
    addRow() {
        const tbody = this.table.querySelector('tbody');
        const lastRow = tbody.querySelector('tr:last-child');
        const newRow = lastRow ? lastRow.cloneNode(true) : document.createElement('tr');
        const rowId = `new-${this.nextRowId++}`;

        newRow.setAttribute('data-row-id', rowId);

        // Clear the values of all cells except the last one
        // TODO: decide how to handle readonly cells
        const cells = newRow.querySelectorAll('td:not(:last-of-type)');
        cells.forEach((cell) => {
            if (cell.hasAttribute('data-type')) {
                // Handle select cells
                if (cell.dataset.type === 'select') {
                    const sourceName = cell.dataset.sourceName;
                    const source = this.source[sourceName] || [];
                    const firstOption = source.length > 0 ? source[0].value : '';
                    cell.textContent = firstOption;
                } else {
                    // Handle other input types
                    cell.textContent = '';
                }
            } else {
                // For cells without a data-type, just clear the content
                cell.textContent = '';
            }
        });

        tbody.appendChild(newRow);

        // Track the new row in modifiedRows
        this.modifiedRows[rowId] = {
            id: rowId,
            changes: {}
        };
    }

    /**
     * Deletes a row from the table.
     * @param {HTMLElement} button - The delete button (`<button>`) inside the row to be deleted.
     */
    deleteRow(button) {
        if (!window.confirm(this.text.delete)) return;
        const row = button.closest('tr');
        const rowId = row.dataset.rowId;

        // If it's a new row, just remove it entirely
        if (rowId.startsWith('new-')) {
            delete this.modifiedRows[rowId];
        } else {
            this.deletedRows.add(rowId);
        }

        row.remove();
    }

    /**
    * Extend page css to support table cell highlighting
    */
    addStyles() {
        this.table.setAttribute('data-tabler','');
        if (!document.querySelector('tabler-css')) {
            const style = document.createElement('style');
            style.textContent = `
table[data-tabler] {
    td:focus {
        outline: 2px solid ${this.colours.focus}
    }
    .dirty {
       background-color: ${this.colours.dirty}; /* light yellow */
    }
}`;
            style.setAttribute('id','tabler-css');
            document.head.appendChild(style);
        }
    }

    /**
    * Editable cells are identified by having a tabindex
    * run this last.
    */
    enableEdit() {
        for (let td of [...this.table.querySelectorAll('tbody td:not([readonly])')]) {
            td.setAttribute("tabindex",0);
        }
    }
}

// Example usage
// const table1 = new EditableTable('editableTable', {
//     ajaxEndpoint: '/api/subjects/save',
//     saveButton: document.getElementById('savebutton'),
//     revertButton: document.getElementById('revertbutton'),
//     addRowButton: document.getElementById('addrow'),
//     keys: ['stage_id', 'name', 'focusarea', 'outcome', 'code'], // Column keys
//     source: {
//         "stage": [
//             { key: 1, value: `Stage 3` },
//             { key: 2, value: `Stage 4` },
//             { key: 3, value: `Stage 5 (unused)` },
//         ]
//     }
// });
