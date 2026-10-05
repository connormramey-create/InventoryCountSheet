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
        desc.textContent = "Enter Manager Password to access Approval Mode & Start of Count values.";
    }

    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('passwordModal').style.display = 'none';
    pendingAction = null;
}

function submitModalPassword() {
    const inputPass = document.getElementById('modalPasswordInput').value.trim();
    if (!pendingAction) return;

    const currentAction = pendingAction.type;
    const currentEntity = pendingAction.entity;

    if (currentAction === 'upload' || currentAction === 'clear') {
        if (inputPass === ADMIN_PASSWORD) {
            closeModal();
            if (currentAction === 'upload') document.getElementById('csvFileInput').click();
            if (currentAction === 'clear') executeClearData();
        } else {
            alert("Incorrect Admin Password.");
        }
    } else if (currentAction === 'unlock_entity') {
        const requiredPass = getEntityPassword(currentEntity);
        if (inputPass === requiredPass || inputPass === ADMIN_PASSWORD) {
            activeUnlockedEntity = currentEntity;
            closeModal();
            renderWarehouseFilter();
            renderProductLineFilter();
            applyFilters();
            
            document.getElementById('entityPromptBanner').style.display = 'none';
            document.getElementById('dataCard').style.display = 'block';
        } else {
            alert("Incorrect Entity Password.");
        }
    } else if (currentAction === 'approve_entity') {
        if (inputPass === ADMIN_PASSWORD) {
            isApprovalMode = true;
            closeModal();
            applyFilters();
        } else {
            alert("Incorrect Manager Password.");
        }
    }
}
