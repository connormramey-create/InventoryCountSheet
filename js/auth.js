function getManagerPassword(entityName) {
    const cleanName = (entityName || "").trim().toLowerCase();
    const foundKey = Object.keys(MANAGER_PASSWORDS).find(k => k.trim().toLowerCase() === cleanName);
    return foundKey ? MANAGER_PASSWORDS[foundKey] : null;
}

function getEntityPassword(entityName) {
    if (!entityName) return ENTITY_PASSWORDS["default"] || "1234";
    const cleanName = entityName.trim();
    if (ENTITY_PASSWORDS[cleanName]) return ENTITY_PASSWORDS[cleanName];
    
    // Case-insensitive & whitespace-tolerant lookup
    const foundKey = Object.keys(ENTITY_PASSWORDS).find(k => k.trim().toLowerCase() === cleanName.toLowerCase());
    if (foundKey) return ENTITY_PASSWORDS[foundKey];
    
    return ENTITY_PASSWORDS["default"] || "1234";
}

function promptProtectedAction(actionType, entityName = "") {
    pendingAction = { type: actionType, entity: entityName };
    const modal = document.getElementById('passwordModal');
    const title = document.getElementById('modalTitle');
    const desc = document.getElementById('modalDescription');
    document.getElementById('modalPasswordInput').value = "";

    if (actionType === 'upload') {
        title.textContent = "CSV Import Authentication";
        desc.textContent = "Enter Master Admin Password to import a new CSV file.";
    } else if (actionType === 'clear') {
        title.textContent = "Clear Database Security Check";
        desc.textContent = "Enter Master Admin Password to erase all inventory records.";
    } else if (actionType === 'unlock_entity') {
        title.textContent = `Unlock Entity: ${entityName}`;
        desc.textContent = `Enter access password for entity list: ${entityName}.`;
    } else if (actionType === 'approve_entity') {
        title.textContent = "Manager Approval Authentication";
        desc.textContent = `Enter the ${activeUnlockedEntity} Manager Password to access Approval Mode & Start of Count values.`;
    } else if (actionType === 'export_all') {
        title.textContent = "Full Export Authentication";
        desc.textContent = "Enter Master Admin Password to export every entity, including On Hand values.";
    }

    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('modalPasswordInput').focus(), 50);
}

// isCancel defaults to true so the Cancel button (closeModal()) reverts the UI.
function closeModal(isCancel = true) {
    document.getElementById('passwordModal').style.display = 'none';
    const cancelled = pendingAction;
    pendingAction = null;

    // If an entity unlock was cancelled, put the dropdown back on the entity
    // that is actually displayed (previously it showed the wrong entity name).
    if (isCancel && cancelled && cancelled.type === 'unlock_entity') {
        document.getElementById('entityFilter').value = activeUnlockedEntity || "";
        if (activeUnlockedEntity) applyFilters();
    }
}

// Enter submits, Escape cancels
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('modalPasswordInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitModalPassword(); }
        else if (e.key === 'Escape') { closeModal(); }
    });
});

function submitModalPassword() {
    const inputPass = document.getElementById('modalPasswordInput').value.trim();
    if (!pendingAction) return;

    const currentAction = pendingAction.type;
    const currentEntity = pendingAction.entity;

    if (currentAction === 'upload' || currentAction === 'clear' || currentAction === 'export_all') {
        if (inputPass === ADMIN_PASSWORD) {
            closeModal(false);
            if (currentAction === 'upload') document.getElementById('csvFileInput').click();
            if (currentAction === 'clear') executeClearData();
            if (currentAction === 'export_all') exportToCSV(true);
        } else {
            alert("Incorrect Admin Password.");
        }
    } else if (currentAction === 'unlock_entity') {
        const requiredPass = getEntityPassword(currentEntity);
        if (inputPass === requiredPass || inputPass === ADMIN_PASSWORD) {
            activeUnlockedEntity = currentEntity;
            closeModal(false);
            renderWarehouseFilter();
            renderProductLineFilter();
            applyFilters();
            
            document.getElementById('entityPromptBanner').style.display = 'none';
            document.getElementById('dataCard').style.display = 'block';
        } else {
            alert("Incorrect Entity Password.");
        }
    } else if (currentAction === 'approve_entity') {
        const managerPass = getManagerPassword(activeUnlockedEntity);
        if ((managerPass && inputPass === managerPass) || inputPass === ADMIN_PASSWORD) {
            isApprovalMode = true;
            closeModal(false);
            applyFilters();
        } else {
            alert("Incorrect Manager Password.");
        }
    }
}
