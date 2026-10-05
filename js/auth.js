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
    const inputPass = document.getElementById('modalPasswordInput').value;
    if (!pendingAction) return;

    if (pendingAction.type === 'upload' || pendingAction.type === 'clear') {
        if (inputPass === ADMIN_PASSWORD) {
            closeModal();
            if (pendingAction.type === 'upload') document.getElementById('csvFileInput').click();
            if (pendingAction.type === 'clear') executeClearData();
        } else {
            alert("Incorrect Admin Password.");
        }
    } else if (pendingAction.type === 'unlock_entity') {
        const requiredPass = ENTITY_PASSWORDS[pendingAction.entity] || ENTITY_PASSWORDS["default"];
        if (inputPass === requiredPass || inputPass === ADMIN_PASSWORD) {
            activeUnlockedEntity = pendingAction.entity;
            closeModal();
            renderWarehouseFilter();
            renderProductLineFilter();
            applyFilters();
            document.getElementById('dataCard').style.display = 'block';
        } else {
            alert("Incorrect Entity Password.");
        }
    } else if (pendingAction.type === 'approve_entity') {
        if (inputPass === ADMIN_PASSWORD) {
            isApprovalMode = true;
            closeModal();
            applyFilters();
        } else {
            alert("Incorrect Manager Password.");
        }
    }
}
