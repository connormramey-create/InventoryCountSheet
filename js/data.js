// --- HELPERS ---
const LOCAL_STORAGE_KEYS = ["inventory_data", "inventory_headers", "entity_workflows"];

// Escape text before inserting it into innerHTML (CSV values can contain <, >, &, quotes).
function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Firebase keys cannot contain . # $ / [ ]  — encode them so entity names like
// "St. Louis" don't make every save fail. Names without those characters are
// unchanged, so existing workflow records keep working.
function workflowKey(entityName) {
    return (entityName || "").trim().replace(/[.#$\/\[\]]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function getWorkflowState(entityName) {
    return entityWorkflowMap[workflowKey(entityName)] || { status: "Draft" };
}

function setSyncStatus(text, cssClass) {
    const badge = document.getElementById('syncStatus');
    if (!badge) return;
    badge.textContent = text;
    badge.className = "sync-badge " + cssClass;
}

let lastSyncErrorAlert = 0;
function reportSyncError(err) {
    console.error("Firebase write failed:", err);
    setSyncStatus("Sync Error: last change NOT saved", "sync-local");
    // Throttle alerts so a permissions problem doesn't spam the user on every tap.
    if (Date.now() - lastSyncErrorAlert > 30000) {
        lastSyncErrorAlert = Date.now();
        alert("Could not save to the shared database.\n\n" + ((err && err.message) || err));
    }
}

// --- STORAGE & SYNC INITIALIZATION ---
function initStorageAndSync() {
    if (!firebaseConfig.databaseURL) {
        setSyncStatus("Mode: Local Storage", "sync-local");
        return;
    }
    if (typeof firebase === "undefined") {
        console.warn("Firebase SDK failed to load; using Local Storage.");
        setSyncStatus("Mode: Local Storage (Firebase unavailable)", "sync-local");
        return;
    }
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        isGlobalSync = true;
        setSyncStatus("Mode: Global Sync (Connecting...)", "sync-local");

        // Show the real connection state instead of assuming we're online.
        let hasConnected = false;
        db.ref('.info/connected').on('value', snap => {
            if (snap.val() === true) {
                hasConnected = true;
                setSyncStatus("Mode: Global Sync (Realtime)", "sync-online");
            } else if (hasConnected) {
                setSyncStatus("Offline: changes will sync when reconnected", "sync-local");
            }
        });
    } catch (e) {
        console.warn("Firebase fallback to LocalStorage.", e);
        db = null;
        isGlobalSync = false;
        setSyncStatus("Mode: Local Storage (Firebase error)", "sync-local");
    }
}

// --- CSV IMPORT ---
function handleFileSelect(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = ""; // allow re-importing a file with the same name
    if (!file) return;

    if (inventoryData.length > 0 &&
        !confirm("Importing will REPLACE all current inventory records, counts and approval statuses for every entity. Continue?")) {
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        if (!parseCSV(e.target.result)) {
            alert("That CSV file appears to be empty or has no data rows.");
            return;
        }
        entityWorkflowMap = {};
        activeUnlockedEntity = "";
        isApprovalMode = false;
        saveData();
        renderFilters();
        document.getElementById('entityFilter').value = "";
        document.getElementById('filterCard').style.display = 'block';
        document.getElementById('entityPromptBanner').style.display = 'block';
        document.getElementById('dataCard').style.display = 'none';
    };
    reader.onerror = function() {
        alert("Could not read that file.");
    };
    reader.readAsText(file);
}

// RFC 4180-style parser: handles quoted commas, quoted line breaks, escaped "" quotes and a UTF-8 BOM.
function parseCSVRows(text) {
    text = (text || "").replace(/^﻿/, "");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            row.push(field.trim());
            field = "";
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field.trim());
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += c;
        }
    }
    if (field !== "" || row.length > 0) {
        row.push(field.trim());
        rows.push(row);
    }
    // Drop blank lines (including lines that are only commas)
    return rows.filter(r => r.some(v => v !== ""));
}

// Returns true if data rows were loaded.
function parseCSV(text) {
    const parsedRows = parseCSVRows(text);
    if (parsedRows.length < 2) return false;

    const headers = parsedRows[0];
    const stamp = Date.now();
    const items = parsedRows.slice(1).map((row, idx) => {
        while (row.length < headers.length) row.push("");
        return { id: "item_" + idx + "_" + stamp, row: row };
    });

    rawHeaders = headers;
    inventoryData = items;
    detectColumnIndexes();

    if (countColIndex === -1) {
        rawHeaders.push("Physical Count");
        countColIndex = rawHeaders.length - 1;
        inventoryData.forEach(item => item.row.push(""));
    }
    return true;
}

// --- COLUMN DETECTION ---
// Tries each pattern in priority order across all unassigned columns, so a strong
// match (e.g. "Product Line") wins over a weak one (e.g. "Unit Type") regardless
// of which column comes first.
function findColumn(patterns, assigned) {
    for (const pattern of patterns) {
        const idx = rawHeaders.findIndex((h, i) => !assigned.has(i) && pattern.test((h || "").trim()));
        if (idx !== -1) {
            assigned.add(idx);
            return idx;
        }
    }
    return -1;
}

function detectColumnIndexes() {
    const assigned = new Set();

    // 1. Entity / Brand
    entityColIndex = findColumn([/entity/i, /brand/i], assigned);

    // 2. Warehouse ID
    warehouseIdColIndex = findColumn([/warehouse.*id/i, /\bwh.*id/i, /location.*id/i], assigned);

    // 3. Warehouse Name
    warehouseNameColIndex = findColumn([/warehouse.*name/i, /\bwh.*name/i, /location.*name/i], assigned);
    if (warehouseNameColIndex === -1 && warehouseIdColIndex !== -1 && warehouseIdColIndex + 1 < rawHeaders.length) {
        const nextIdx = warehouseIdColIndex + 1;
        if (/^name$/i.test((rawHeaders[nextIdx] || "").trim()) && !assigned.has(nextIdx)) {
            warehouseNameColIndex = nextIdx;
            assigned.add(nextIdx);
        }
    }

    warehouseColIndex = -1;
    if (warehouseIdColIndex === -1 && warehouseNameColIndex === -1) {
        warehouseColIndex = findColumn([/warehouse/i, /\bwh\b/i, /location/i], assigned);
    }

    // 4. Product Line / Category / Type
    productLineColIndex = findColumn([
        /prod(uct)?.*line/i,
        /prod(uct)?.*type/i,
        /category/i,
        /\btype\b/i,
        /\bline\b/i
    ], assigned);

    // 5. Start of Count / On Hand / System Qty
    startCountColIndex = findColumn([
        /start.*count/i,
        /on[\s-]*hand/i,
        /system.*qty/i,
        /beginning/i,
        /start/i
    ], assigned);

    // 6. Physical Count
    countColIndex = findColumn([/^count$/i, /physical\s*count/i, /counted/i], assigned);

    // 7. Item Name / Description (exact names first, then fuzzy, then SKU, then first free column)
    itemNameColIndex = findColumn([
        /^(name|item\s*name|product\s*name|description)$/i,
        /item.*name|product.*name/i,
        /item.*desc|product.*desc|description|desc/i,
        /name/i,
        /item|sku|part/i
    ], assigned);
    if (itemNameColIndex === -1) {
        itemNameColIndex = rawHeaders.findIndex((_, idx) => !assigned.has(idx));
    }
}

// --- PERSISTENCE ---
function saveLocal() {
    try {
        localStorage.setItem("inventory_data", JSON.stringify(inventoryData));
        localStorage.setItem("inventory_headers", JSON.stringify(rawHeaders));
        localStorage.setItem("entity_workflows", JSON.stringify(entityWorkflowMap));
    } catch (e) {
        console.error(e);
        alert("Could not save to this browser's storage (it may be full or disabled).");
    }
}

// Full write: only used for CSV imports. Normal edits write just the changed path
// so two people counting at the same time don't overwrite each other.
function saveData() {
    if (isGlobalSync && db) {
        db.ref('inventory_data').set({
            headers: rawHeaders,
            items: inventoryData,
            workflows: entityWorkflowMap
        }).catch(reportSyncError);
    } else {
        saveLocal();
    }
}

function saveWorkflow(entityName) {
    const key = workflowKey(entityName);
    if (isGlobalSync && db) {
        db.ref('inventory_data/workflows/' + key).set(entityWorkflowMap[key]).catch(reportSyncError);
    } else {
        saveLocal();
    }
}

// Atomically update one item's count in Firebase. Aborts if the item at that
// position is no longer the same record (e.g. an admin re-imported the CSV).
function writeItemCount(item, computeNewValue) {
    if (!(isGlobalSync && db)) {
        saveLocal();
        return;
    }
    const idx = inventoryData.indexOf(item);
    if (idx === -1) return;
    const colIdx = countColIndex;

    db.ref('inventory_data/items/' + idx).transaction(current => {
        if (current === null) return null; // cache not loaded yet; Firebase retries with the real value
        if (!current.row || current.id !== item.id) return; // abort: record changed underneath us
        current.row[colIdx] = computeNewValue(current.row[colIdx]);
        return current;
    }).then(result => {
        if (!result.committed) {
            alert("This item was changed or the inventory was re-imported by someone else. Please re-check the count.");
        }
    }).catch(reportSyncError);
}

function sanitizeCount(value) {
    if (value === "" || value === null || value === undefined) return "";
    const num = parseFloat(value);
    if (isNaN(num)) return "";
    return String(Math.max(0, num));
}

function addToCount(currentValue, delta) {
    let current = parseFloat(currentValue);
    if (isNaN(current) || current < 0) current = 0;
    return String(Math.max(0, Math.round((current + delta) * 1000) / 1000));
}

function updateCount(id, value) {
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;
    const valStr = sanitizeCount(value);
    item.row[countColIndex] = valStr;
    writeItemCount(item, () => valStr);
    applyFilters();
}

function adjustCount(id, delta) {
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;
    item.row[countColIndex] = addToCount(item.row[countColIndex], delta); // optimistic local update
    // In Firebase mode the delta is applied to the server's latest value, so
    // simultaneous +1 taps from two devices both count.
    writeItemCount(item, current => addToCount(current, delta));
    applyFilters();
}

// --- EXPORT ---
// Default export: only the unlocked entity, and the On Hand / Start of Count
// column only in Manager Approval Mode (keeps counts "blind" for counters).
// Admin export (password protected) includes every entity and column.
function exportToCSV(includeAll = false) {
    if (!inventoryData || inventoryData.length === 0) return;

    const showStart = includeAll || isApprovalMode;
    const colIndexes = rawHeaders.map((_, i) => i).filter(i => showStart || i !== startCountColIndex);

    let items = inventoryData;
    if (!includeAll) {
        const selected = (activeUnlockedEntity || "").trim().toLowerCase();
        if (!selected) return;
        items = inventoryData.filter(item =>
            entityColIndex === -1 || (item.row[entityColIndex] || "").trim().toLowerCase() === selected);
    }

    const formatRow = (arr) => colIndexes.map(i => `"${(arr[i] ?? '').toString().replace(/"/g, '""')}"`).join(',');
    const rows = [formatRow(rawHeaders)];
    items.forEach(item => rows.push(formatRow(item.row)));

    // BOM so Excel opens UTF-8 characters correctly
    const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const label = includeAll ? "ALL" : activeUnlockedEntity.replace(/[^a-z0-9]+/gi, "_");

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_export_${label}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// --- CLEAR ---
function executeClearData() {
    if (isGlobalSync && db) {
        db.ref('inventory_data').remove().catch(reportSyncError);
    } else {
        // Only remove this app's keys; localStorage.clear() would also wipe other
        // apps hosted on the same github.io origin.
        LOCAL_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    }
    inventoryData = [];
    rawHeaders = [];
    entityWorkflowMap = {};
    activeUnlockedEntity = "";
    isApprovalMode = false;
    document.getElementById('entityFilter').value = "";
    document.getElementById('filterCard').style.display = 'none';
    document.getElementById('entityPromptBanner').style.display = 'none';
    document.getElementById('dataCard').style.display = 'none';
    alert("Inventory database cleared successfully.");
}
