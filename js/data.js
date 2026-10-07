// --- STORAGE & SYNC INITIALIZATION ---
function initStorageAndSync() {
    if (firebaseConfig.databaseURL && firebaseConfig.databaseURL !== "") {
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            isGlobalSync = true;
            document.getElementById('syncStatus').textContent = "Mode: Global Sync (Realtime)";
            document.getElementById('syncStatus').className = "sync-badge sync-online";
        } catch (e) {
            console.warn("Firebase fallback to LocalStorage.", e);
        }
    }
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;

    inventoryData = [];
    rawHeaders = [];
    entityWorkflowMap = {};

    const reader = new FileReader();
    reader.onload = function(e) {
        parseCSV(e.target.result);
        saveData();
        renderFilters();
        document.getElementById('filterCard').style.display = 'block';
    };
    reader.readAsText(files[0]);
}

function parseCSV(text) {
    const lines = text.split(/\r\n|\n/);
    if (lines.length === 0) return;

    const parseLine = (line) => {
        const row = [];
        let insideQuotes = false;
        let entry = '';
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') insideQuotes = !insideQuotes;
            else if (char === ',' && !insideQuotes) { row.push(entry.trim()); entry = ''; }
            else entry += char;
        }
        row.push(entry.trim());
        return row;
    };

    const parsedRows = lines.map(l => l.trim()).filter(l => l.length > 0).map(parseLine);
    if (parsedRows.length === 0) return;

    rawHeaders = parsedRows[0];
    detectColumnIndexes();

    if (countColIndex === -1) {
        rawHeaders.push("Physical Count");
        countColIndex = rawHeaders.length - 1;
    }

    parsedRows.slice(1).forEach((row, idx) => {
        while (row.length < rawHeaders.length) row.push("");
        inventoryData.push({ id: "item_" + idx + "_" + Date.now(), row: row });
    });
}

function detectColumnIndexes() {
    const assigned = new Set();

    // 1. Detect Entity / Brand
    entityColIndex = rawHeaders.findIndex((h, idx) => !assigned.has(idx) && /entity|brand/i.test(h));
    if (entityColIndex !== -1) assigned.add(entityColIndex);

    // 2. Detect Warehouse ID
    warehouseIdColIndex = rawHeaders.findIndex((h, idx) => !assigned.has(idx) && /warehouse.*id|wh.*id|location.*id/i.test(h));
    if (warehouseIdColIndex !== -1) assigned.add(warehouseIdColIndex);

    // 3. Detect Warehouse Name
    warehouseNameColIndex = rawHeaders.findIndex((h, idx) => 
        !assigned.has(idx) && /warehouse.*name|wh.*name|location.*name/i.test(h)
    );

    if (warehouseNameColIndex === -1 && warehouseIdColIndex !== -1 && warehouseIdColIndex + 1 < rawHeaders.length) {
        const nextHeader = rawHeaders[warehouseIdColIndex + 1].trim();
        if (/^name$/i.test(nextHeader) && !assigned.has(warehouseIdColIndex + 1)) {
            warehouseNameColIndex = warehouseIdColIndex + 1;
        }
    }
    if (warehouseNameColIndex !== -1) assigned.add(warehouseNameColIndex);

    if (warehouseIdColIndex === -1 && warehouseNameColIndex === -1) {
        warehouseColIndex = rawHeaders.findIndex((h, idx) => !assigned.has(idx) && /warehouse|wh|location/i.test(h));
        if (warehouseColIndex !== -1) assigned.add(warehouseColIndex);
    } else {
        warehouseColIndex = -1;
    }

    // 4. Detect Product Line / Category / Type
    productLineColIndex = rawHeaders.findIndex((h, idx) => 
        !assigned.has(idx) && /product.*line|prod.*line|product.*type|prod.*type|category|type|line/i.test(h)
    );
    if (productLineColIndex !== -1) assigned.add(productLineColIndex);

    // 5. Detect Start of Count / On Hand / System Qty
    startCountColIndex = rawHeaders.findIndex((h, idx) => 
        !assigned.has(idx) && /on\s*hand|on-hand|qty.*on.*hand|start.*count|system.*qty|beginning|start/i.test(h)
    );
    if (startCountColIndex !== -1) assigned.add(startCountColIndex);

    // 6. Detect Physical Count
    countColIndex = rawHeaders.findIndex((h, idx) => 
        !assigned.has(idx) && /^count$|physical count|counted/i.test(h)
    );
    if (countColIndex !== -1) assigned.add(countColIndex);

    // 7. Detect Item Name / Description from remaining unassigned columns
    itemNameColIndex = rawHeaders.findIndex((h, idx) => 
        !assigned.has(idx) && /^name$\vert{}^item\s*name$|^product\s*name$\vert{}^description$/i.test(h.trim())
    );

    if (itemNameColIndex === -1) {
        itemNameColIndex = rawHeaders.findIndex((h, idx) => 
            !assigned.has(idx) && /item.*name|product.*name|item.*desc|product.*desc|description|desc|name/i.test(h.trim())
        );
    }

    if (itemNameColIndex === -1) {
        itemNameColIndex = rawHeaders.findIndex((h, idx) => 
            !assigned.has(idx) && /item|sku|part/i.test(h.trim())
        );
    }

    if (itemNameColIndex === -1) {
        itemNameColIndex = rawHeaders.findIndex((_, idx) => !assigned.has(idx));
    }
}

function saveData() {
    if (isGlobalSync && db) {
        db.ref('inventory_data').set({
            headers: rawHeaders,
            items: inventoryData,
            workflows: entityWorkflowMap
        });
    } else {
        localStorage.setItem("inventory_data", JSON.stringify(inventoryData));
        localStorage.setItem("inventory_headers", JSON.stringify(rawHeaders));
        localStorage.setItem("entity_workflows", JSON.stringify(entityWorkflowMap));
    }
}

function updateCount(id, value) {
    const item = inventoryData.find(i => i.id === id);
    if (item) {
        let valStr = value;
        if (valStr !== "" && valStr !== null && valStr !== undefined) {
            let num = parseFloat(valStr);
            if (!isNaN(num) && num < 0) {
                valStr = "0";
            }
        }
        item.row[countColIndex] = valStr;
        saveData();
        applyFilters();
    }
}

function adjustCount(id, delta) {
    const item = inventoryData.find(i => i.id === id);
    if (item) {
        let current = parseInt(item.row[countColIndex], 10);
        if (isNaN(current) || current < 0) current = 0;
        item.row[countColIndex] = Math.max(0, current + delta).toString();
        saveData();
        applyFilters();
    }
}

function exportToCSV() {
    if (!inventoryData || inventoryData.length === 0) return;

    const formatRow = (arr) => arr.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',');

    let rows = [];
    rows.push(formatRow(rawHeaders));
    inventoryData.forEach(item => {
        rows.push(formatRow(item.row));
    });

    const csvContent = rows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function executeClearData() {
    if (isGlobalSync && db) {
        db.ref('inventory_data').remove();
    } else {
        localStorage.clear();
    }
    inventoryData = [];
    rawHeaders = [];
    entityWorkflowMap = {};
    activeUnlockedEntity = "";
    isApprovalMode = false;
    document.getElementById('filterCard').style.display = 'none';
    document.getElementById('entityPromptBanner').style.display = 'none';
    document.getElementById('dataCard').style.display = 'none';
    alert("Inventory database cleared successfully.");
}
