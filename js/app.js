// When a remote update arrives while someone is typing a count, wait until they
// leave the field instead of re-rendering the table out from under them.
let pendingRemoteRender = false;

function isEditingCount() {
    const el = document.activeElement;
    return !!(el && el.classList && el.classList.contains('count-input'));
}

document.addEventListener('focusout', () => {
    if (!pendingRemoteRender) return;
    setTimeout(() => {
        if (pendingRemoteRender && !isEditingCount()) {
            pendingRemoteRender = false;
            refreshView();
        }
    }, 0);
});

window.onload = function() {
    initStorageAndSync();

    if (isGlobalSync && db) {
        db.ref('inventory_data').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.headers && data.items) {
                rawHeaders = data.headers;
                inventoryData = Array.isArray(data.items) ? data.items : Object.values(data.items);
                entityWorkflowMap = data.workflows || {};
                detectColumnIndexes();

                if (isEditingCount()) {
                    pendingRemoteRender = true;
                } else {
                    refreshView();
                }
            } else {
                inventoryData = [];
                rawHeaders = [];
                entityWorkflowMap = {};
                activeUnlockedEntity = "";
                isApprovalMode = false;

                const entitySelect = document.getElementById('entityFilter');
                if (entitySelect) entitySelect.value = "";

                document.getElementById('filterCard').style.display = 'none';
                document.getElementById('entityPromptBanner').style.display = 'none';
                document.getElementById('dataCard').style.display = 'none';
            }
        }, (error) => {
            console.error("Firebase read failed:", error);
            setSyncStatus("Sync Error: cannot read shared database", "sync-local");
            alert("Could not load the shared inventory database.\n\n" + (error && error.message));
        });
    } else {
        try {
            const savedData = localStorage.getItem("inventory_data");
            const savedHeaders = localStorage.getItem("inventory_headers");
            const savedWorkflows = localStorage.getItem("entity_workflows");
            if (savedData && savedHeaders) {
                inventoryData = JSON.parse(savedData);
                rawHeaders = JSON.parse(savedHeaders);
                entityWorkflowMap = savedWorkflows ? JSON.parse(savedWorkflows) : {};
                detectColumnIndexes();
                refreshView();
            }
        } catch (e) {
            console.error("Could not load saved data:", e);
        }
    }
};

// Re-render everything from the current data, keeping the user's entity,
// warehouse, product-line, sort and search selections.
function refreshView() {
    if (!inventoryData.length) return;
    renderFilters();
    document.getElementById('filterCard').style.display = 'block';

    // If the unlocked entity no longer exists (e.g. a new CSV was imported), lock again.
    if (activeUnlockedEntity && !getEntityList().includes(activeUnlockedEntity)) {
        activeUnlockedEntity = "";
        isApprovalMode = false;
        document.getElementById('entityFilter').value = "";
    }

    if (activeUnlockedEntity) {
        renderWarehouseFilter();
        renderProductLineFilter();
        applyFilters();
        document.getElementById('entityPromptBanner').style.display = 'none';
        document.getElementById('dataCard').style.display = 'block';
    } else {
        document.getElementById('entityPromptBanner').style.display = 'block';
        document.getElementById('dataCard').style.display = 'none';
    }
}

function getEntityList() {
    const entities = new Set();
    inventoryData.forEach(item => {
        if (entityColIndex !== -1 && item.row[entityColIndex]) entities.add(item.row[entityColIndex].trim());
    });
    return Array.from(entities).sort((a, b) => a.localeCompare(b));
}

// Rebuild a <select> safely (no innerHTML with CSV text) and keep the selection if it still exists.
function fillSelect(select, placeholderText, entries, preferredValue) {
    select.innerHTML = "";
    const placeholder = document.createElement('option');
    placeholder.value = "";
    placeholder.textContent = placeholderText;
    select.appendChild(placeholder);

    entries.forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        select.appendChild(opt);
    });

    select.value = entries.some(([v]) => v === preferredValue) ? preferredValue : "";
}

function renderFilters() {
    const entitySelect = document.getElementById('entityFilter');
    const selectedVal = activeUnlockedEntity || entitySelect.value;
    fillSelect(entitySelect, "Select Entity...", getEntityList().map(e => [e, e]), selectedVal);
}

function onEntityFilterChange() {
    const selectedEntity = document.getElementById('entityFilter').value;
    isApprovalMode = false;

    if (!selectedEntity) {
        activeUnlockedEntity = "";
        document.getElementById('entityPromptBanner').style.display = 'block';
        document.getElementById('dataCard').style.display = 'none';
        return;
    }

    if (selectedEntity !== activeUnlockedEntity) {
        promptProtectedAction('unlock_entity', selectedEntity);
    } else {
        renderWarehouseFilter();
        renderProductLineFilter();
        applyFilters();
        document.getElementById('entityPromptBanner').style.display = 'none';
        document.getElementById('dataCard').style.display = 'block';
    }
}

function itemBelongsToActiveEntity(item) {
    if (entityColIndex === -1) return true;
    const selected = activeUnlockedEntity.trim().toLowerCase();
    return (item.row[entityColIndex] || "").trim().toLowerCase() === selected;
}

function renderWarehouseFilter() {
    const warehouseSelect = document.getElementById('warehouseFilter');
    const previous = warehouseSelect.value;
    const warehouseMap = new Map();

    inventoryData.forEach(item => {
        if (!itemBelongsToActiveEntity(item)) return;

        let key = "", label = "";
        if (warehouseIdColIndex !== -1 && warehouseNameColIndex !== -1) {
            const id = item.row[warehouseIdColIndex] || "";
            const name = item.row[warehouseNameColIndex] || "";
            if (id || name) { key = `${id}___${name}`; label = (id && name) ? `${id} - ${name}` : (id || name); }
        } else {
            const idx = warehouseColIndex !== -1 ? warehouseColIndex : (warehouseIdColIndex !== -1 ? warehouseIdColIndex : warehouseNameColIndex);
            if (idx !== -1 && item.row[idx]) { key = item.row[idx]; label = item.row[idx]; }
        }
        if (key && !warehouseMap.has(key)) warehouseMap.set(key, label);
    });

    fillSelect(warehouseSelect, "All Warehouses", Array.from(warehouseMap.entries()), previous);
}

function renderProductLineFilter() {
    const plSelect = document.getElementById('productLineFilter');
    const previous = plSelect.value;
    const productLines = new Set();

    inventoryData.forEach(item => {
        if (!itemBelongsToActiveEntity(item)) return;
        if (productLineColIndex !== -1 && item.row[productLineColIndex]) {
            productLines.add(item.row[productLineColIndex].trim());
        }
    });

    const entries = Array.from(productLines).sort((a, b) => a.localeCompare(b)).map(pl => [pl, pl]);
    fillSelect(plSelect, "All Product Lines", entries, previous);
}

function applyFilters() {
    if (!activeUnlockedEntity) return;

    const selectedWhKey = document.getElementById('warehouseFilter').value.toLowerCase();
    const selectedPL = document.getElementById('productLineFilter').value.toLowerCase();
    const sortBy = document.getElementById('sortBySelect').value;
    const searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();

    let filtered = inventoryData.filter(item => {
        if (!itemBelongsToActiveEntity(item)) return false;

        let matchesWh = true;
        if (selectedWhKey) {
            if (warehouseIdColIndex !== -1 && warehouseNameColIndex !== -1) {
                const id = item.row[warehouseIdColIndex] || "";
                const name = item.row[warehouseNameColIndex] || "";
                matchesWh = (`${id}___${name}`.toLowerCase() === selectedWhKey);
            } else {
                const idx = warehouseColIndex !== -1 ? warehouseColIndex : (warehouseIdColIndex !== -1 ? warehouseIdColIndex : warehouseNameColIndex);
                matchesWh = (idx !== -1 && (item.row[idx] || "").toLowerCase() === selectedWhKey);
            }
        }

        const matchesPL = productLineColIndex === -1 || !selectedPL || ((item.row[productLineColIndex] || "").trim().toLowerCase() === selectedPL);

        // Don't let counters search on the hidden On Hand column outside approval mode
        const matchesSearch = !searchQuery || item.row.some((val, i) =>
            (isApprovalMode || i !== startCountColIndex) && String(val ?? "").toLowerCase().includes(searchQuery));

        return matchesWh && matchesPL && matchesSearch;
    });

    const nameIdx = itemNameColIndex !== -1 ? itemNameColIndex : 0;
    const byName = (a, b) => String(a.row[nameIdx] || "").localeCompare(String(b.row[nameIdx] || ""), undefined, { numeric: true });

    filtered.sort((a, b) => {
        if (sortBy === 'productLine' && productLineColIndex !== -1) {
            return String(a.row[productLineColIndex] || "").localeCompare(String(b.row[productLineColIndex] || "")) || byName(a, b);
        } else if (sortBy === 'count') {
            return (parseFloat(a.row[countColIndex]) || 0) - (parseFloat(b.row[countColIndex]) || 0) || byName(a, b);
        } else if (sortBy === 'countDesc') {
            return (parseFloat(b.row[countColIndex]) || 0) - (parseFloat(a.row[countColIndex]) || 0) || byName(a, b);
        }
        return byName(a, b);
    });

    renderWorkflowHeader();
    renderTable(filtered);
    renderMobileCards(filtered);
}

function renderWorkflowHeader() {
    const badge = document.getElementById('entityStatusBadge');
    const buttonsContainer = document.getElementById('workflowActionButtons');
    const entityState = getWorkflowState(activeUnlockedEntity);

    badge.textContent = entityState.status;
    badge.className = `status-badge status-${entityState.status.toLowerCase()}`;

    buttonsContainer.innerHTML = "";

    if (entityState.status === 'Draft') {
        buttonsContainer.innerHTML = `<button class="btn btn-warning" onclick="confirmSubmitEntity()">Submit Entity Count</button>`;
    } else if (entityState.status === 'Submitted') {
        if (!isApprovalMode) {
            buttonsContainer.innerHTML = `<button class="btn btn-outline" onclick="promptProtectedAction('approve_entity')">Unlock Manager Approval Mode</button>`;
        } else {
            buttonsContainer.innerHTML = `
                <button class="btn btn-secondary" onclick="setEntityStatus('Approved')">Approve Count</button>
                <button class="btn btn-outline" onclick="setEntityStatus('Draft')">Reopen Draft</button>
            `;
        }
    } else if (entityState.status === 'Approved') {
        if (!isApprovalMode) {
            buttonsContainer.innerHTML = `<button class="btn btn-outline" onclick="promptProtectedAction('approve_entity')">Manager Access (Approved)</button>`;
        } else {
            // Previously there was no way back once approved
            buttonsContainer.innerHTML = `<button class="btn btn-outline" onclick="confirmReopenApproved()">Reopen Draft</button>`;
        }
    }
}

function confirmSubmitEntity() {
    const entityItems = inventoryData.filter(itemBelongsToActiveEntity);
    const uncounted = entityItems.filter(i => !isCounted(i)).length;
    const msg = uncounted > 0
        ? `${uncounted} of ${entityItems.length} items for ${activeUnlockedEntity} have no count yet.\n\nSubmit anyway? The count sheet will be locked until a manager reopens it.`
        : `Submit the count for ${activeUnlockedEntity}? The count sheet will be locked until a manager reopens it.`;
    if (confirm(msg)) setEntityStatus('Submitted');
}

function confirmReopenApproved() {
    if (confirm(`Reopen the APPROVED count for ${activeUnlockedEntity} as a draft?`)) setEntityStatus('Draft');
}

function setEntityStatus(status) {
    entityWorkflowMap[workflowKey(activeUnlockedEntity)] = { status: status, updatedAt: new Date().toISOString() };
    if (status === 'Draft') {
        isApprovalMode = false;
    }
    saveWorkflow(activeUnlockedEntity);
    applyFilters();
}

function isCounted(item) {
    const v = item.row[countColIndex];
    return v !== "" && v !== null && v !== undefined && !isNaN(parseFloat(v));
}

function isSheetLocked() {
    const entityState = getWorkflowState(activeUnlockedEntity);
    return entityState.status === 'Submitted' || entityState.status === 'Approved' || isApprovalMode;
}

function countControlsHTML(item, isLocked) {
    const countVal = item.row[countColIndex] ?? "";
    const dis = isLocked ? 'disabled' : '';
    return `
        <div class="count-controls">
            <button class="step-btn" ${dis} onclick="adjustCount('${item.id}', -1)" aria-label="Decrease">-</button>
            <input type="number" inputmode="decimal" min="0" step="any" class="count-input" value="${escapeHtml(countVal)}" ${dis} onchange="updateCount('${item.id}', this.value)" aria-label="Physical count" />
            <button class="step-btn" ${dis} onclick="adjustCount('${item.id}', 1)" aria-label="Increase">+</button>
        </div>
    `;
}

function varianceFor(item) {
    const startVal = parseFloat(item.row[startCountColIndex]) || 0;
    const countVal = parseFloat(item.row[countColIndex]) || 0;
    return Math.round((countVal - startVal) * 1000) / 1000;
}

function renderTable(data) {
    const headerRow = document.getElementById('tableHeader');
    const tbody = document.getElementById('tableBody');
    headerRow.innerHTML = '';
    tbody.innerHTML = '';

    const isLocked = isSheetLocked();
    const showVariance = isApprovalMode && startCountColIndex !== -1;

    rawHeaders.forEach((h, index) => {
        if (index === entityColIndex) return;
        if (index === startCountColIndex && !isApprovalMode) return;
        const th = document.createElement('th');
        th.textContent = h;
        headerRow.appendChild(th);
    });

    if (showVariance) {
        const thVar = document.createElement('th');
        thVar.textContent = "Variance";
        headerRow.appendChild(thVar);
    }

    const fragment = document.createDocumentFragment();
    data.forEach(item => {
        const tr = document.createElement('tr');

        rawHeaders.forEach((_, colIdx) => {
            if (colIdx === entityColIndex) return;
            if (colIdx === startCountColIndex && !isApprovalMode) return;

            const td = document.createElement('td');
            if (colIdx === countColIndex) {
                td.innerHTML = countControlsHTML(item, isLocked);
            } else {
                td.textContent = item.row[colIdx] ?? "";
            }
            tr.appendChild(td);
        });

        if (showVariance) {
            const tdVar = document.createElement('td');
            const variance = varianceFor(item);
            tdVar.textContent = variance > 0 ? `+${variance}` : variance;
            tdVar.style.fontWeight = "bold";
            tdVar.style.color = variance === 0 ? "var(--success-color)" : "var(--danger-color)";
            tr.appendChild(tdVar);
        }

        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);

    updateStats(data);
}

function renderMobileCards(data) {
    const container = document.getElementById('mobileCardList');
    container.innerHTML = '';

    const isLocked = isSheetLocked();
    const fragment = document.createDocumentFragment();

    data.forEach(item => {
        const itemName = (itemNameColIndex !== -1 && item.row[itemNameColIndex]) ? item.row[itemNameColIndex] : "Item Record";
        const productLine = (productLineColIndex !== -1 && item.row[productLineColIndex]) ? item.row[productLineColIndex] : "";
        const startVal = (startCountColIndex !== -1 && item.row[startCountColIndex]) ? item.row[startCountColIndex] : "0";

        const card = document.createElement('div');
        card.className = "inventory-card";

        let startCountHTML = "";
        if (isApprovalMode && startCountColIndex !== -1) {
            const variance = varianceFor(item);
            startCountHTML = `
                <div class="card-start-count">
                    On Hand: <strong>${escapeHtml(startVal)}</strong> | Var: <span style="color: ${variance === 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${variance > 0 ? '+' + variance : variance}</span>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="card-item-name">${escapeHtml(itemName)}</div>
            <div class="card-meta-row">
                ${productLine ? `<span class="card-meta-tag">🏷️ ${escapeHtml(productLine)}</span>` : ''}
            </div>
            <div class="card-count-bar">
                ${startCountHTML || '<div class="count-title">Physical Count:</div>'}
                ${countControlsHTML(item, isLocked)}
            </div>
        `;
        fragment.appendChild(card);
    });
    container.appendChild(fragment);
}

function updateStats(data) {
    document.getElementById('recordCount').textContent = `Total Items: ${data.length}`;
    document.getElementById('countedCount').textContent = `Items Counted: ${data.filter(isCounted).length}`;
}
