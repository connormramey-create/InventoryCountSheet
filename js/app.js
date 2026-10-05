window.onload = function() {
    initStorageAndSync();

    if (isGlobalSync && db) {
        // Realtime listener for Firebase synchronization
        db.ref('inventory_data').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.headers && data.items) {
                rawHeaders = data.headers;
                inventoryData = data.items;
                entityWorkflowMap = data.workflows || {};
                detectColumnIndexes();
                renderFilters();
                document.getElementById('filterCard').style.display = 'block';

                // Re-render active list if an entity is currently unlocked
                if (activeUnlockedEntity) {
                    applyFilters();
                    document.getElementById('dataCard').style.display = 'block';
                }
            } else {
                // DATA CLEARED OR EMPTY: Reset UI state completely
                inventoryData = [];
                rawHeaders = [];
                entityWorkflowMap = {};
                activeUnlockedEntity = "";
                isApprovalMode = false;

                const entitySelect = document.getElementById('entityFilter');
                if (entitySelect) entitySelect.value = "";

                document.getElementById('filterCard').style.display = 'none';
                document.getElementById('dataCard').style.display = 'none';
            }
        });
    } else {
        // LocalStorage fallback
        const savedData = localStorage.getItem("inventory_data");
        const savedHeaders = localStorage.getItem("inventory_headers");
        const savedWorkflows = localStorage.getItem("entity_workflows");
        if (savedData && savedHeaders) {
            inventoryData = JSON.parse(savedData);
            rawHeaders = JSON.parse(savedHeaders);
            entityWorkflowMap = savedWorkflows ? JSON.parse(savedWorkflows) : {};
            detectColumnIndexes();
            renderFilters();
            document.getElementById('filterCard').style.display = 'block';
        }
    }
};

function renderFilters() {
    const entitySelect = document.getElementById('entityFilter');
    const entities = new Set();
    inventoryData.forEach(item => {
        if (entityColIndex !== -1 && item.row[entityColIndex]) entities.add(item.row[entityColIndex]);
    });

    entitySelect.innerHTML = '<option value="">Select Entity...</option>';
    entities.forEach(e => {
        entitySelect.innerHTML += `<option value="${e}">${e}</option>`;
    });
}

function onEntityFilterChange() {
    const selectedEntity = document.getElementById('entityFilter').value;
    isApprovalMode = false;
    
    if (!selectedEntity) {
        activeUnlockedEntity = "";
        document.getElementById('dataCard').style.display = 'none';
        return;
    }

    if (selectedEntity !== activeUnlockedEntity) {
        promptProtectedAction('unlock_entity', selectedEntity);
    } else {
        renderWarehouseFilter();
        renderProductLineFilter();
        applyFilters();
    }
}

function renderWarehouseFilter() {
    const warehouseSelect = document.getElementById('warehouseFilter');
    const selectedEntity = activeUnlockedEntity.toLowerCase();
    const warehouseMap = new Map();

    inventoryData.forEach(item => {
        const itemEntity = (entityColIndex !== -1 && item.row[entityColIndex]) ? item.row[entityColIndex] : "";
        if (selectedEntity && itemEntity.toLowerCase() !== selectedEntity) return;

        let key = "", label = "";
        if (warehouseIdColIndex !== -1 && warehouseNameColIndex !== -1) {
            const id = item.row[warehouseIdColIndex] || "";
            const name = item.row[warehouseNameColIndex] || "";
            if (id || name) { key = `${id}___${name}`; label = (id && name) ? `${id} - ${name}` : (id || name); }
        } else {
            const idx = warehouseColIndex !== -1 ? warehouseColIndex : warehouseIdColIndex;
            if (idx !== -1 && item.row[idx]) { key = item.row[idx]; label = item.row[idx]; }
        }
        if (key && !warehouseMap.has(key)) warehouseMap.set(key, label);
    });

    warehouseSelect.innerHTML = '<option value="">All Warehouses</option>';
    warehouseMap.forEach((lbl, k) => warehouseSelect.innerHTML += `<option value="${k}">${lbl}</option>`);
}

function renderProductLineFilter() {
    const plSelect = document.getElementById('productLineFilter');
    const selectedEntity = activeUnlockedEntity.toLowerCase();
    const productLines = new Set();

    inventoryData.forEach(item => {
        const itemEntity = (entityColIndex !== -1 && item.row[entityColIndex]) ? item.row[entityColIndex] : "";
        if (selectedEntity && itemEntity.toLowerCase() !== selectedEntity) return;

        if (productLineColIndex !== -1 && item.row[productLineColIndex]) {
            productLines.add(item.row[productLineColIndex]);
        }
    });

    plSelect.innerHTML = '<option value="">All Product Lines</option>';
    productLines.forEach(pl => plSelect.innerHTML += `<option value="${pl}">${pl}</option>`);
}

function applyFilters() {
    if (!activeUnlockedEntity) return;

    const selectedEntity = activeUnlockedEntity.toLowerCase();
    const selectedWhKey = document.getElementById('warehouseFilter').value.toLowerCase();
    const selectedPL = document.getElementById('productLineFilter').value.toLowerCase();
    const sortBy = document.getElementById('sortBySelect').value;
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();

    let filtered = inventoryData.filter(item => {
        const matchesEntity = entityColIndex === -1 || (item.row[entityColIndex] && item.row[entityColIndex].toLowerCase() === selectedEntity);
        
        let matchesWh = true;
        if (selectedWhKey) {
            if (warehouseIdColIndex !== -1 && warehouseNameColIndex !== -1) {
                const id = item.row[warehouseIdColIndex] || "";
                const name = item.row[warehouseNameColIndex] || "";
                matchesWh = (`${id}___${name}`.toLowerCase() === selectedWhKey);
            } else {
                const idx = warehouseColIndex !== -1 ? warehouseColIndex : warehouseIdColIndex;
                matchesWh = (idx !== -1 && item.row[idx] && item.row[idx].toLowerCase() === selectedWhKey);
            }
        }

        const matchesPL = productLineColIndex === -1 || !selectedPL || (item.row[productLineColIndex] && item.row[productLineColIndex].toLowerCase() === selectedPL);
        const matchesSearch = !searchQuery || item.row.some(val => val.toLowerCase().includes(searchQuery));

        return matchesEntity && matchesWh && matchesPL && matchesSearch;
    });

    filtered.sort((a, b) => {
        if (sortBy === 'productLine' && productLineColIndex !== -1) {
            return (a.row[productLineColIndex] || "").localeCompare(b.row[productLineColIndex] || "");
        } else if (sortBy === 'count') {
            return (parseFloat(a.row[countColIndex]) || 0) - (parseFloat(b.row[countColIndex]) || 0);
        } else if (sortBy === 'countDesc') {
            return (parseFloat(b.row[countColIndex]) || 0) - (parseFloat(a.row[countColIndex]) || 0);
        } else {
            const idx = itemNameColIndex !== -1 ? itemNameColIndex : 0;
            return (a.row[idx] || "").localeCompare(b.row[idx] || "");
        }
    });

    renderWorkflowHeader();
    renderTable(filtered);
    renderMobileCards(filtered);
}

function renderWorkflowHeader() {
    const badge = document.getElementById('entityStatusBadge');
    const buttonsContainer = document.getElementById('workflowActionButtons');
    const entityState = entityWorkflowMap[activeUnlockedEntity] || { status: 'Draft' };

    badge.textContent = entityState.status;
    badge.className = `status-badge status-${entityState.status.toLowerCase()}`;

    buttonsContainer.innerHTML = "";

    if (entityState.status === 'Draft') {
        buttonsContainer.innerHTML = `<button class="btn btn-warning" onclick="setEntityStatus('Submitted')">Submit Entity Count</button>`;
    } else if (entityState.status === 'Submitted') {
        if (!isApprovalMode) {
            buttonsContainer.innerHTML = `
                <button class="btn btn-outline" onclick="promptProtectedAction('approve_entity')">Unlock Manager Approval Mode</button>
            `;
        } else {
            buttonsContainer.innerHTML = `
                <button class="btn btn-secondary" onclick="setEntityStatus('Approved')">Approve Count</button>
                <button class="btn btn-outline" onclick="setEntityStatus('Draft')">Reopen Draft</button>
            `;
        }
    } else if (entityState.status === 'Approved') {
        buttonsContainer.innerHTML = `<button class="btn btn-outline" onclick="promptProtectedAction('approve_entity')">Manager Access (Approved)</button>`;
    }
}

function setEntityStatus(status) {
    entityWorkflowMap[activeUnlockedEntity] = { status: status, updatedAt: new Date().toISOString() };
    saveData();
    applyFilters();
}

function renderTable(data) {
    const headerRow = document.getElementById('tableHeader');
    const tbody = document.getElementById('tableBody');
    headerRow.innerHTML = '';
    tbody.innerHTML = '';

    const entityState = entityWorkflowMap[activeUnlockedEntity] || { status: 'Draft' };
    const isLocked = (entityState.status === 'Submitted' || entityState.status === 'Approved') && !isApprovalMode;

    rawHeaders.forEach((h, index) => {
        if (index === entityColIndex) return;
        if (index === startCountColIndex && !isApprovalMode) return;

        const th = document.createElement('th');
        th.textContent = h;
        headerRow.appendChild(th);
    });

    if (isApprovalMode && startCountColIndex !== -1) {
        const thVar = document.createElement('th');
        thVar.textContent = "Variance";
        headerRow.appendChild(thVar);
    }

    data.forEach(item => {
        const tr = document.createElement('tr');

        item.row.forEach((val, colIdx) => {
            if (colIdx === entityColIndex) return;
            if (colIdx === startCountColIndex && !isApprovalMode) return;

            const td = document.createElement('td');
            if (colIdx === countColIndex) {
                const countVal = val !== undefined ? val : "";
                td.innerHTML = `
                    <div class="count-controls">
                        <button class="step-btn" ${isLocked ? 'disabled' : ''} onclick="adjustCount('${item.id}', -1)">-</button>
                        <input type="number" inputmode="numeric" class="count-input" value="${countVal}" ${isLocked ? 'disabled' : ''} onchange="updateCount('${item.id}', this.value)" />
                        <button class="step-btn" ${isLocked ? 'disabled' : ''} onclick="adjustCount('${item.id}', 1)">+</button>
                    </div>
                `;
            } else {
                td.textContent = val;
            }
            tr.appendChild(td);
        });

        if (isApprovalMode && startCountColIndex !== -1) {
            const tdVar = document.createElement('td');
            const startVal = parseFloat(item.row[startCountColIndex]) || 0;
            const countVal = parseFloat(item.row[countColIndex]) || 0;
            const variance = countVal - startVal;
            tdVar.textContent = variance > 0 ? `+${variance}` : variance;
            tdVar.style.fontWeight = "bold";
            tdVar.style.color = variance === 0 ? "var(--success-color)" : "var(--danger-color)";
            tr.appendChild(tdVar);
        }

        tbody.appendChild(tr);
    });

    updateStats(data);
}

function renderMobileCards(data) {
    const container = document.getElementById('mobileCardList');
    container.innerHTML = '';

    const entityState = entityWorkflowMap[activeUnlockedEntity] || { status: 'Draft' };
    const isLocked = (entityState.status === 'Submitted' || entityState.status === 'Approved') && !isApprovalMode;

    data.forEach(item => {
        const itemName = (itemNameColIndex !== -1 && item.row[itemNameColIndex]) ? item.row[itemNameColIndex] : "Item Record";
        const productLine = (productLineColIndex !== -1 && item.row[productLineColIndex]) ? item.row[productLineColIndex] : "";
        const countVal = item.row[countColIndex] !== undefined ? item.row[countColIndex] : "";
        const startVal = (startCountColIndex !== -1 && item.row[startCountColIndex]) ? item.row[startCountColIndex] : "0";

        const card = document.createElement('div');
        card.className = "inventory-card";

        let startCountHTML = "";
        if (isApprovalMode && startCountColIndex !== -1) {
            const variance = (parseFloat(countVal) || 0) - (parseFloat(startVal) || 0);
            startCountHTML = `
                <div class="card-start-count">
                    Start Qty: <strong>${startVal}</strong> | Var: <span style="color: ${variance === 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${variance > 0 ? '+' + variance : variance}</span>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="card-item-name">${itemName}</div>
            <div class="card-meta-row">
                ${productLine ? `<span class="card-meta-tag">🏷 ${productLine}</span>` : ''}
            </div>
            <div class="card-count-bar">
                ${startCountHTML || '<div>Count Input:</div>'}
                <div class="count-controls">
                    <button class="step-btn" ${isLocked ? 'disabled' : ''} onclick="adjustCount('${item.id}', -1)">-</button>
                    <input type="number" inputmode="numeric" class="count-input" value="${countVal}" ${isLocked ? 'disabled' : ''} onchange="updateCount('${item.id}', this.value)" />
                    <button class="step-btn" ${isLocked ? 'disabled' : ''} onclick="adjustCount('${item.id}', 1)">+</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function updateStats(data) {
    document.getElementById('recordCount').textContent = `Total Items: ${data.length}`;
    const counted = data.filter(i => i.row[countColIndex] !== "" && i.row[countColIndex] !== null && !isNaN(i.row[countColIndex])).length;
    document.getElementById('countedCount').textContent = `Items Counted: ${counted}`;
}

function updateCount(id, value) {
    const item = inventoryData.find(i => i.id === id);
    if (item) {
        item.row[countColIndex] = value;
        saveData();
        applyFilters();
    }
}

function adjustCount(id, delta) {
    const item = inventoryData.find(i => i.id === id);
    if (item) {
        let current = parseInt(item.row[countColIndex], 10);
        if (isNaN(current)) current = 0;
        item.row[countColIndex] = Math.max(0, current + delta).toString();
        saveData();
        applyFilters();
    }
}
