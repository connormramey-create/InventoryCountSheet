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
        document.getElementById('dataCard').style.display = 'none';
        event.target.value = ""; // Reset file input
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
    entityColIndex = rawHeaders.findIndex(h => /entity|brand/i.test(h));
    warehouseIdColIndex = rawHeaders.findIndex(h => /warehouse.*id|wh.*id/i.test(h));
    warehouseNameColIndex = rawHeaders.findIndex(h => /warehouse.*name|wh.*name/i.test(h));
    if (warehouseIdColIndex === -1 && warehouseNameColIndex === -1) {
        warehouseColIndex = rawHeaders.findIndex(h => /warehouse|wh|location/i.test(h));
    }
    productLineColIndex = rawHeaders.findIndex(h => /product.*line|prod.*line|category|type/i.test(h));
    itemNameColIndex = rawHeaders.findIndex(h => /name|description|item|sku/i.test(h));
    startCountColIndex = rawHeaders.findIndex(h => /start.*count|system.*qty|qty.*on.*hand|beginning/i.test(h));
    countColIndex = rawHeaders.findIndex(h => /^count$|physical count|counted/i.test(h));
}

function saveData() {
    // Save to LocalStorage as fallback
    localStorage.setItem("inventory_data", JSON.stringify(inventoryData));
    localStorage.setItem("inventory_headers", JSON.stringify(rawHeaders));
    localStorage.setItem("entity_workflows", JSON.stringify(entityWorkflowMap));

    if (isGlobalSync && db) {
        db.ref('inventory_data').set({
            headers: rawHeaders,
            items: inventoryData,
            workflows: entityWorkflowMap
        }).catch((error) => {
            console.error("Firebase save error:", error);
            alert("Firebase Warning: Could not save to cloud database (" + error.message + "). Check Firebase Rules.");
        });
    }
}

function exportToCSV() {
    if (inventoryData.length === 0) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    const formatRow = (arr) => arr.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',');

    csvContent += formatRow(rawHeaders) + "\r\n";
    inventoryData.forEach(item => { csvContent += formatRow(item.row) + "\r\n"; });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `inventory_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function executeClearData() {
    // Clear LocalStorage in all cases
    localStorage.removeItem("inventory_data");
    localStorage.removeItem("inventory_headers");
    localStorage.removeItem("entity_workflows");

    inventoryData = [];
    rawHeaders = [];
    entityWorkflowMap = {};
    activeUnlockedEntity = "";
    isApprovalMode = false;

    const entitySelect = document.getElementById('entityFilter');
    if (entitySelect) entitySelect.value = "";

    document.getElementById('filterCard').style.display = 'none';
    document.getElementById('dataCard').style.display = 'none';

    if (isGlobalSync && db) {
        db.ref('inventory_data').remove()
            .then(() => {
                alert("Inventory database cleared successfully across all devices.");
            })
            .catch((error) => {
                console.error("Firebase clear error:", error);
                alert("Database Error: " + error.message + "\n\nPlease check your Firebase Realtime Database Security Rules.");
            });
    } else {
        alert("Local inventory database cleared successfully.");
    }
}
