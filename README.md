# EditableTable
An unopinionated editable DataTable

I hadn't found a simple table editor that wasn't bloatware. So I made one with as little opinion as I could manage. It allows you to edit the cells through a `select -> press enter -> make changes -> press enter to save` workflow (or press escape to revert the cell back to its unedited value).

* Works on standard html tables.
* Cell editing with keyboard and mouse interactions.
* Navigation between cells using arrow keys, (tab and shift-tab also supported).
* Tracking changes to rows and cells.
* Adding and deleting rows.
* Synchronizing changes with the server using efficient payload (changes only).
* Reverting all changes to the original state.
* Supports text, number, color, textarea, select-one, date field editors
* Readonly cells
* Unopinionated styles (only adds 'focus' and 'dirty' classes)
* Clean, easy to read code

No libraries or modules. No React. No npm. Just a regular, modern class.

## Obligatory GIF
![editable-table](https://github.com/user-attachments/assets/d620326d-12a0-4fe4-ac3e-ce80e1070337)

## Example usage
```html
<table id="myTable"><thead>
  <tr>
    <th>Name</th><th>Age</th><th>Birthday</th><th>Fave color</th><th>Notes</th><th>Type</th>
  </tr>
</thead>
<tbody>
  <tr data-row-id="6268">
    <td>Lorinda Jones</td>
    <td data-type="number">27</td>
    <td data-type="date">13/07/1995</td>
    <td data-type="color">#ffcc33</td>
    <td data-type="longtext">Lorem ipsum dolor sit amet</td>
    <td readonly>Human</td>
  </tr>
</tbody>
</table>

<button id="saveButton">Save changes</button>
<button id="addRow">Add a new row</button>
<button id="revertButton">Discard changes</button>

<script src="EditableTable.js"></script>
```

```js
const table1 = new EditableTable('myTable', {
    ajaxEndpoint: '/api/subjects/save',
    saveButton: document.getElementById('saveButton'),
    revertButton: document.getElementById('revertButton'),
    addRowButton: document.getElementById('addRow'),
    keys: ['name', 'age', 'birthday', 'color', 'notes'], // Column keys
    source: {
        "stage": [
            { key: 1, value: `Stage 3` },
            { key: 2, value: `Stage 4` },
            { key: 3, value: `Stage 5 (unused)` },
        ]
    }
});
```

Payload on save
```json
{"updates":[{"id":"6268","changes":{"age":"26","name":"Jorissa Jones"}}],"deletions":[]}
```
## Licence
MIT
