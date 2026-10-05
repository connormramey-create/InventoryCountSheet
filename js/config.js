// --- FIREBASE REALTIME CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAr4TWWOk730S44i5DZCC_HhZdG664poDo",
    authDomain: "inventory-tracker-61964.firebaseapp.com",
    databaseURL: "https://inventory-tracker-61964-default-rtdb.firebaseio.com",
    projectId: "inventory-tracker-61964",
    storageBucket: "inventory-tracker-61964.firebasestorage.app",
    messagingSenderId: "563347696662",
    appId: "1:563347696662:web:3d355a2062c44b8690d937",
    measurementId: "G-CL9645DXP0"
};

// System Passwords
const ADMIN_PASSWORD = "04052001";
const ENTITY_PASSWORDS = {
    "Native Grasses": "NG",
    "Brookside": "BRK",
    "Meehans": "MEE",
    "LawnRX": "LRX",
    "Gro-Masters": "GRO",
    "Seacoast Turf": "TURF",
    "Grasshopper Lawns": "GHP",
    "Green Image": "GRI",
    "Fairway": "FWY",
    "Seacoast Tree": "TREE",
    "Delaware Valley Turf": "DVT",
    "Custom": "CLC",
    "Green Machine": "GRM",
    "Total Lawn Care": "TLC",
    "Concord Custom Lawn Care": "CRD",
    "Highest Quality": "HQL"
};

// Global Application State
let db = null;
let isGlobalSync = false;

let rawHeaders = [];
let inventoryData = [];
let entityWorkflowMap = {};

let activeUnlockedEntity = "";
let isApprovalMode = false;

// Column Indexes
let entityColIndex = -1;
let warehouseIdColIndex = -1;
let warehouseNameColIndex = -1;
let warehouseColIndex = -1;
let productLineColIndex = -1;
let itemNameColIndex = -1;
let startCountColIndex = -1;
let countColIndex = -1;

let pendingAction = null;
