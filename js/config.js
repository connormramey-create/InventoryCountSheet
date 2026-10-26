// --- FIREBASE REALTIME CONFIGURATION ---
// The Firebase settings are NOT stored in this repo. They are injected at deploy
// time by .github/workflows/static.yml, which writes js/firebase-config.js from
// GitHub repository secrets. For local testing, copy js/firebase-config.example.js
// to js/firebase-config.js and fill in your values (that file is git-ignored).
// If no config is present the app falls back to Local Storage mode.
const firebaseConfig = window.FIREBASE_CONFIG || {};

// System Passwords
const ADMIN_PASSWORD = "1234";
const ENTITY_PASSWORDS = {
    "default": "1234",
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

// Global State Variables
let db = null;
let isGlobalSync = false;

let rawHeaders = [];
let inventoryData = [];
let entityWorkflowMap = {};

let activeUnlockedEntity = "";
let isApprovalMode = false;

// Column Index Pointers
let entityColIndex = -1;
let warehouseIdColIndex = -1;
let warehouseNameColIndex = -1;
let warehouseColIndex = -1;
let productLineColIndex = -1;
let itemNameColIndex = -1;
let startCountColIndex = -1;
let countColIndex = -1;

let pendingAction = null;
